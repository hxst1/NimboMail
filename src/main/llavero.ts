// Llavero del sistema a través de la API Secret Service de freedesktop (D-Bus), la misma que usan
// libsecret y secret-tool: GNOME Keyring, KWallet (Plasma 5.97+), KeePassXC… Hablando D-Bus directamente
// no hace falta ningún programa aparte (Ubuntu, por ejemplo, no trae secret-tool), y los elementos son
// los mismos que crea secret-tool: se leen y se sustituyen indistintamente.
import { existsSync } from 'node:fs'
import { sessionBus, Variant, type ClientInterface, type MessageBus } from 'dbus-next'
import { t } from './idioma'

const SERVICIO = 'org.freedesktop.secrets'
const RAIZ = '/org/freedesktop/secrets'
const I_SERVICIO = 'org.freedesktop.Secret.Service'
const I_COLECCION = 'org.freedesktop.Secret.Collection'
const I_ELEMENTO = 'org.freedesktop.Secret.Item'
const I_PROMPT = 'org.freedesktop.Secret.Prompt'
const NINGUNO = '/'

export type Atributos = Record<string, string>

/** Dirección del bus de sesión. dbus-next solo abre sockets abstractos con un módulo nativo, pero el net de Node también sabe. */
function direccionBus(): string | undefined {
  const dir = process.env.DBUS_SESSION_BUS_ADDRESS
  if (dir) return dir.replace(/unix:abstract=([^,;]+)/, (_, nombre: string) => `unix:socket=\u0000${nombre}`)
  const porDefecto = `/run/user/${process.getuid?.()}/bus`
  return existsSync(porDefecto) ? `unix:path=${porDefecto}` : undefined
}

let conexion: { bus: MessageBus; servicio: ClientInterface; sesion: string } | null = null

async function conectar() {
  if (conexion) return conexion
  let bus: MessageBus | undefined
  let plazo: NodeJS.Timeout | undefined
  try {
    const b = (bus = sessionBus({ busAddress: direccionBus() }))
    // Si el bus no existe, dbus-next solo emite «error» y la llamada se queda esperando para siempre.
    const fallo = new Promise<never>((_, reject) => {
      b.on('error', (e) => {
        conexion = null
        reject(e)
      })
      plazo = setTimeout(() => reject(new Error('timeout')), 15_000) // arrancar el llavero por activación lleva un momento
    })
    const abrir = async () => {
      const servicio = (await b.getProxyObject(SERVICIO, RAIZ)).getInterface(I_SERVICIO)
      // «plain»: el secreto viaja sin cifrar por el bus de sesión, que solo es accesible para el usuario (igual que secret-tool).
      const [, sesion] = (await servicio.OpenSession('plain', new Variant('s', ''))) as [Variant, string]
      return { bus: b, servicio, sesion }
    }
    conexion = await Promise.race([abrir(), fallo])
    return conexion
  } catch {
    bus?.disconnect()
    throw new Error(t().principal.cuentas.sinLlavero)
  } finally {
    clearTimeout(plazo)
  }
}

async function interfaz(bus: MessageBus, ruta: string, nombre: string) {
  return (await bus.getProxyObject(SERVICIO, ruta)).getInterface(nombre)
}

/** Si el llavero pide algo al usuario (desbloquearlo, crear la colección…), muestra su diálogo y espera. */
async function completar(bus: MessageBus, prompt: string): Promise<Variant | null> {
  if (prompt === NINGUNO) return null
  const p = await interfaz(bus, prompt, I_PROMPT)
  return new Promise((resolve, reject) => {
    p.once('Completed', (cancelado: boolean, resultado: Variant) =>
      cancelado ? reject(new Error(t().principal.cuentas.llaveroCancelado)) : resolve(resultado),
    )
    p.Prompt('').catch(reject)
  })
}

async function desbloquear(c: NonNullable<typeof conexion>, rutas: string[]): Promise<string[]> {
  if (!rutas.length) return []
  const [ya, prompt] = (await c.servicio.Unlock(rutas)) as [string[], string]
  const resultado = await completar(c.bus, prompt)
  return resultado ? (resultado.value as string[]) : ya
}

async function buscar(c: NonNullable<typeof conexion>, atributos: Atributos): Promise<string[]> {
  const [abiertos, cerrados] = (await c.servicio.SearchItems(atributos)) as [string[], string[]]
  return [...abiertos, ...(await desbloquear(c, cerrados))]
}

async function coleccionPorDefecto(c: NonNullable<typeof conexion>): Promise<string> {
  const ruta = (await c.servicio.ReadAlias('default')) as string
  if (ruta !== NINGUNO) {
    await desbloquear(c, [ruta])
    return ruta
  }
  // Sin colección por defecto (llavero recién estrenado): se crea, como haría libsecret.
  const etiqueta = { 'org.freedesktop.Secret.Collection.Label': new Variant('s', 'Login') }
  const [creada, prompt] = (await c.servicio.CreateCollection(etiqueta, 'default')) as [string, string]
  const resultado = await completar(c.bus, prompt)
  return resultado ? (resultado.value as string) : creada
}

// Una operación cada vez: al arrancar se piden varias contraseñas a la vez y, con el llavero bloqueado,
// cada una abriría su propio diálogo de desbloqueo.
let cola: Promise<unknown> = Promise.resolve()
function enCola<T>(fn: (c: NonNullable<typeof conexion>) => Promise<T>): Promise<T> {
  const r = cola.then(async () => {
    try {
      return await fn(await conectar())
    } catch (e) {
      if (!(e instanceof Error) || e.message !== t().principal.cuentas.llaveroCancelado) conexion = null
      throw e
    }
  })
  cola = r.catch(() => {})
  return r
}

export function buscarSecreto(atributos: Atributos): Promise<string | null> {
  return enCola(async (c) => {
    const [elemento] = await buscar(c, atributos)
    if (!elemento) return null
    const secretos = (await c.servicio.GetSecrets([elemento], c.sesion)) as Record<string, [string, Buffer, Buffer, string]>
    const valor = secretos[elemento]?.[2]
    return valor ? Buffer.from(valor).toString('utf8') : null
  })
}

export function guardarSecreto(etiqueta: string, atributos: Atributos, valor: string): Promise<void> {
  return enCola(async (c) => {
    const coleccion = await interfaz(c.bus, await coleccionPorDefecto(c), I_COLECCION)
    const propiedades = {
      'org.freedesktop.Secret.Item.Label': new Variant('s', etiqueta),
      // xdg:schema como secret-tool, para que «replace» sustituya también lo que guardó él.
      'org.freedesktop.Secret.Item.Attributes': new Variant('a{ss}', { 'xdg:schema': 'org.freedesktop.Secret.Generic', ...atributos }),
    }
    const secreto = [c.sesion, Buffer.alloc(0), Buffer.from(valor, 'utf8'), 'text/plain; charset=utf8']
    const [, prompt] = (await coleccion.CreateItem(propiedades, secreto, true)) as [string, string]
    await completar(c.bus, prompt)
  })
}

export function borrarSecreto(atributos: Atributos): Promise<void> {
  return enCola(async (c) => {
    for (const ruta of await buscar(c, atributos)) {
      const prompt = (await (await interfaz(c.bus, ruta, I_ELEMENTO)).Delete()) as string
      await completar(c.bus, prompt)
    }
  })
}

// Cuentas de NimboMail: la configuración en ~/.config/nimbomail/cuentas.toml y las contraseñas (o los
// tokens de OAuth) en el llavero del sistema (libsecret: GNOME Keyring, KWallet…), nunca en archivos.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import tls from 'node:tls'
import { parse, stringify } from 'smol-toml'
import { NOMBRE_ANTERIOR } from './migracion'
import { t } from './idioma'
import * as llavero from './llavero'
import { renovarAcceso, type IdOAuth } from './oauth'

export const RUTA_CUENTAS = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'nimbomail', 'cuentas.toml')
const SERVICIO_LLAVERO = 'nimbomail'

export type TipoAuth = 'clave' | IdOAuth

export interface ConfigCuenta {
  id: string
  nombre: string // nombre del remitente («Alex Martín»)
  etiqueta: string // cómo se ve la cuenta en NimboMail («Trabajo», «Gmail»)
  direccion: string
  usuario: string
  imap: string
  puerto: number
  tlsNombre?: string // verificar el certificado contra otro nombre (hostings con certificado compartido)
  smtp: string
  smtpPuerto: number
  auth: TipoAuth
  gmail: boolean
}

/** Una cuenta a partir de su tabla en cuentas.toml (o en una copia de configuración). */
export function cuentaDeFila(id: string, c: Record<string, unknown>): ConfigCuenta {
  const imap = String(c.imap)
  return {
    id,
    nombre: String(c.nombre ?? ''),
    etiqueta: String(c.etiqueta ?? id),
    direccion: String(c.direccion),
    usuario: String(c.usuario ?? c.direccion),
    imap,
    puerto: Number(c.puerto ?? 993),
    tlsNombre: c.tls_nombre ? String(c.tls_nombre) : undefined,
    smtp: String(c.smtp ?? imap),
    smtpPuerto: Number(c.smtp_puerto ?? 465),
    auth: (['microsoft', 'google'].includes(String(c.auth)) ? c.auth : 'clave') as TipoAuth,
    gmail: imap.endsWith('gmail.com'),
  }
}

/** La tabla de una cuenta tal como se guarda en cuentas.toml. */
export function filaDeCuenta(c: ConfigCuenta): Record<string, string | number> {
  const fila: Record<string, string | number> = {
    nombre: c.nombre,
    etiqueta: c.etiqueta,
    direccion: c.direccion,
    usuario: c.usuario,
    imap: c.imap,
    puerto: c.puerto,
    smtp: c.smtp,
    smtp_puerto: c.smtpPuerto,
    auth: c.auth,
  }
  if (c.tlsNombre) fila.tls_nombre = c.tlsNombre
  return fila
}

export function leerCuentas(): ConfigCuenta[] {
  if (!existsSync(RUTA_CUENTAS)) return []
  const datos = parse(readFileSync(RUTA_CUENTAS, 'utf8')) as { cuenta?: Record<string, Record<string, unknown>> }
  return Object.entries(datos.cuenta ?? {}).map(([id, c]) => cuentaDeFila(id, c))
}

export function escribirCuentas(lista: ConfigCuenta[]) {
  const cuenta = Object.fromEntries(lista.map((c) => [c.id, filaDeCuenta(c)]))
  mkdirSync(dirname(RUTA_CUENTAS), { recursive: true })
  const cabecera = `# ${t().principal.cuentas.cabeceraArchivo}\n\n`
  writeFileSync(RUTA_CUENTAS + '.tmp', cabecera + stringify({ cuenta }) + '\n', { mode: 0o600 })
  renameSync(RUTA_CUENTAS + '.tmp', RUTA_CUENTAS)
}

// ------------------------------------------------------------ llavero

const deLaCuenta = (servicio: string, direccion: string) => ({ service: servicio, account: direccion })

/** Contraseña (o token de renovación de OAuth) de una cuenta. */
export async function secreto(direccion: string): Promise<string> {
  const valor = (await llavero.buscarSecreto(deLaCuenta(SERVICIO_LLAVERO, direccion))) ?? (await traerDeTuxMail(direccion))
  if (valor === null) throw new SinClave(direccion)
  return valor
}

/** NimboMail se llamaba TuxMail: su contraseña se pasa al servicio nuevo del llavero la primera vez que se pide. */
async function traerDeTuxMail(direccion: string): Promise<string | null> {
  const antigua = deLaCuenta(NOMBRE_ANTERIOR, direccion)
  const valor = await llavero.buscarSecreto(antigua)
  if (valor === null) return null
  try {
    await guardarSecreto(direccion, valor)
    await llavero.borrarSecreto(antigua)
  } catch {} // si no se puede guardar, se sigue usando la antigua
  return valor
}

export async function guardarSecreto(direccion: string, valor: string): Promise<void> {
  try {
    await llavero.guardarSecreto(`NimboMail: ${direccion}`, deLaCuenta(SERVICIO_LLAVERO, direccion), valor)
  } catch (e) {
    throw new Error(e instanceof Error && e.message ? e.message : t().principal.cuentas.noGuardarLlavero)
  }
}

export async function borrarSecreto(direccion: string): Promise<void> {
  for (const servicio of [SERVICIO_LLAVERO, NOMBRE_ANTERIOR]) {
    try {
      await llavero.borrarSecreto(deLaCuenta(servicio, direccion))
    } catch {} // quitar la cuenta no debe fallar por el llavero
  }
}

export class SinClave extends Error {
  constructor(public direccion: string) {
    super(t().principal.cuentas.faltaClaveDe(direccion))
  }
}

// ------------------------------------------------------------ credenciales para IMAP y SMTP

const accesos = new Map<string, { token: string; caduca: number }>()

/** Token de acceso de OAuth vigente (se renueva con el token guardado en el llavero). */
async function tokenAcceso(c: ConfigCuenta): Promise<string> {
  const ya = accesos.get(c.direccion)
  if (ya && ya.caduca > Date.now() + 60_000) return ya.token
  const r = await renovarAcceso(c.auth as IdOAuth, await secreto(c.direccion))
  if (r.renovacion) await guardarSecreto(c.direccion, r.renovacion)
  accesos.set(c.direccion, { token: r.acceso, caduca: r.caduca })
  return r.acceso
}

export async function credencialesImap(c: ConfigCuenta) {
  return c.auth === 'clave' ? { user: c.usuario, pass: await secreto(c.direccion) } : { user: c.usuario, accessToken: await tokenAcceso(c) }
}

export async function credencialesSmtp(c: ConfigCuenta) {
  return c.auth === 'clave'
    ? { user: c.usuario, pass: await secreto(c.direccion) }
    : { type: 'OAuth2' as const, user: c.usuario, accessToken: await tokenAcceso(c) }
}

/** Opciones TLS: verificación completa, pero contra `tlsNombre` si el servidor usa un certificado compartido. */
export function opcionesTls(c: { tlsNombre?: string }): tls.ConnectionOptions {
  if (!c.tlsNombre) return {}
  const nombre = c.tlsNombre
  return {
    servername: nombre,
    checkServerIdentity: (_host, cert) => tls.checkServerIdentity(nombre, cert),
  }
}

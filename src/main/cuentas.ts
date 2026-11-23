// Cuentas de NimboMail: la configuración en ~/.config/nimbomail/cuentas.toml y las contraseñas (o los
// tokens de OAuth) en el llavero del sistema (libsecret: GNOME Keyring, KWallet…), nunca en archivos.
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import tls from 'node:tls'
import { parse, stringify } from 'smol-toml'
import { NOMBRE_ANTERIOR } from './migracion'
import { t } from './idioma'
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

export function leerCuentas(): ConfigCuenta[] {
  if (!existsSync(RUTA_CUENTAS)) return []
  const datos = parse(readFileSync(RUTA_CUENTAS, 'utf8')) as { cuenta?: Record<string, Record<string, unknown>> }
  return Object.entries(datos.cuenta ?? {}).map(([id, c]) => {
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
  })
}

export function escribirCuentas(lista: ConfigCuenta[]) {
  const cuenta: Record<string, Record<string, string | number>> = {}
  for (const c of lista) {
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
    cuenta[c.id] = fila
  }
  mkdirSync(dirname(RUTA_CUENTAS), { recursive: true })
  const cabecera = `# ${t().principal.cuentas.cabeceraArchivo}\n\n`
  writeFileSync(RUTA_CUENTAS + '.tmp', cabecera + stringify({ cuenta }) + '\n', { mode: 0o600 })
  renameSync(RUTA_CUENTAS + '.tmp', RUTA_CUENTAS)
}

// ------------------------------------------------------------ llavero

/** Contraseña (o token de renovación de OAuth) de una cuenta. */
export async function secreto(direccion: string): Promise<string> {
  const valor = (await buscarSecreto(SERVICIO_LLAVERO, direccion)) ?? (await traerDeTuxMail(direccion))
  if (valor === null) throw new SinClave(direccion)
  return valor
}

function buscarSecreto(servicio: string, direccion: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('secret-tool', ['lookup', 'service', servicio, 'account', direccion], { encoding: 'utf8' }, (err, out) =>
      resolve(err || !out ? null : out),
    )
  })
}

/** NimboMail se llamaba TuxMail: su contraseña se pasa al servicio nuevo del llavero la primera vez que se pide. */
async function traerDeTuxMail(direccion: string): Promise<string | null> {
  const valor = await buscarSecreto(NOMBRE_ANTERIOR, direccion)
  if (valor === null) return null
  try {
    await guardarSecreto(direccion, valor)
    execFile('secret-tool', ['clear', 'service', NOMBRE_ANTERIOR, 'account', direccion], () => {})
  } catch {} // si no se puede guardar, se sigue usando la antigua
  return valor
}

export function guardarSecreto(direccion: string, valor: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('secret-tool', ['store', `--label=NimboMail: ${direccion}`, 'service', SERVICIO_LLAVERO, 'account', direccion], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let error = ''
    p.stderr.on('data', (d) => (error += d))
    p.on('error', () => reject(new Error(t().principal.cuentas.faltaSecretTool)))
    p.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Error(error.trim() || t().principal.cuentas.noGuardarLlavero))))
    p.stdin.end(valor)
  })
}

export function borrarSecreto(direccion: string): Promise<void> {
  return new Promise((resolve) => {
    execFile('secret-tool', ['clear', 'service', SERVICIO_LLAVERO, 'account', direccion], () =>
      execFile('secret-tool', ['clear', 'service', NOMBRE_ANTERIOR, 'account', direccion], () => resolve()),
    )
  })
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

// Alta de cuentas: detecta los servidores a partir de la dirección (como Thunderbird) y prueba la conexión.
//   1. Proveedores conocidos.  2. Registros MX (Google Workspace, Microsoft 365 con dominio propio).
//   3. Base de datos de proveedores de Mozilla (ISPDB).  4. Autoconfig del propio dominio.
//   5. Probar mail.<dominio> e imap.<dominio>.
import { resolveMx } from 'node:dns/promises'
import tls from 'node:tls'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import { opcionesTls, type TipoAuth } from './cuentas'
import { oauthDisponible } from './oauth'

export type Proveedor = 'google' | 'microsoft' | 'icloud' | 'yahoo' | 'fastmail' | 'proton' | 'otro'

export interface Servidores {
  imap: string
  puerto: number
  smtp: string
  smtpPuerto: number
  usuario: string
  tlsNombre?: string
}

export interface Deteccion {
  proveedor: Proveedor
  etiqueta: string // nombre sugerido para la cuenta en NimboMail
  servidores: Servidores | null
  auth: TipoAuth // cómo se entra: contraseña (de aplicación o normal) u OAuth
  ayuda?: { texto: string; enlaces?: { etiqueta: string; url: string }[] }
  origen: string // de dónde salió la configuración (para mostrarlo)
}

const CONOCIDOS: { dominios: string[]; proveedor: Proveedor; etiqueta: string; s: Omit<Servidores, 'usuario'>; ayuda?: Deteccion['ayuda'] }[] = [
  {
    dominios: ['gmail.com', 'googlemail.com'],
    proveedor: 'google',
    etiqueta: 'Gmail',
    s: { imap: 'imap.gmail.com', puerto: 993, smtp: 'smtp.gmail.com', smtpPuerto: 465 },
    ayuda: {
      texto:
        'Gmail no acepta tu contraseña de siempre: necesita una contraseña de aplicación. Créala con el nombre «NimboMail» y pega aquí las 16 letras (los espacios dan igual). Si Google dice que no está disponible, activa antes la verificación en dos pasos.',
      enlaces: [
        { etiqueta: 'Crear contraseña de aplicación', url: 'https://myaccount.google.com/apppasswords' },
        { etiqueta: 'Verificación en dos pasos', url: 'https://myaccount.google.com/signinoptions/twosv' },
      ],
    },
  },
  {
    dominios: ['outlook.com', 'outlook.es', 'hotmail.com', 'hotmail.es', 'live.com', 'live.es', 'msn.com'],
    proveedor: 'microsoft',
    etiqueta: 'Outlook',
    s: { imap: 'outlook.office365.com', puerto: 993, smtp: 'smtp-mail.outlook.com', smtpPuerto: 587 },
  },
  {
    dominios: ['icloud.com', 'me.com', 'mac.com'],
    proveedor: 'icloud',
    etiqueta: 'iCloud',
    s: { imap: 'imap.mail.me.com', puerto: 993, smtp: 'smtp.mail.me.com', smtpPuerto: 587 },
    ayuda: {
      texto: 'iCloud necesita una contraseña específica para apps: créala en tu cuenta de Apple, en «Inicio de sesión y seguridad».',
      enlaces: [{ etiqueta: 'Abrir tu cuenta de Apple', url: 'https://account.apple.com' }],
    },
  },
  {
    dominios: ['yahoo.com', 'yahoo.es', 'ymail.com'],
    proveedor: 'yahoo',
    etiqueta: 'Yahoo',
    s: { imap: 'imap.mail.yahoo.com', puerto: 993, smtp: 'smtp.mail.yahoo.com', smtpPuerto: 465 },
    ayuda: {
      texto: 'Yahoo necesita una contraseña de aplicación: créala en la seguridad de tu cuenta.',
      enlaces: [{ etiqueta: 'Abrir la seguridad de Yahoo', url: 'https://login.yahoo.com/account/security' }],
    },
  },
  {
    dominios: ['fastmail.com', 'fastmail.fm'],
    proveedor: 'fastmail',
    etiqueta: 'Fastmail',
    s: { imap: 'imap.fastmail.com', puerto: 993, smtp: 'smtp.fastmail.com', smtpPuerto: 465 },
    ayuda: { texto: 'Fastmail necesita una contraseña de aplicación: créala en Ajustes → Privacidad y seguridad.' },
  },
  {
    dominios: ['proton.me', 'protonmail.com', 'pm.me'],
    proveedor: 'proton',
    etiqueta: 'Proton',
    s: { imap: '127.0.0.1', puerto: 1143, smtp: '127.0.0.1', smtpPuerto: 1025 },
    ayuda: {
      texto: 'Proton solo funciona con Proton Mail Bridge abierto: usa la contraseña que te da el Bridge.',
      enlaces: [{ etiqueta: 'Descargar Proton Mail Bridge', url: 'https://proton.me/mail/bridge' }],
    },
  },
]

const ayudaMicrosoft = (): Deteccion['ayuda'] =>
  oauthDisponible('microsoft')
    ? undefined
    : { texto: 'Esta versión de NimboMail no tiene configurado el inicio de sesión con Microsoft (ver README). Puedes probar con una contraseña de aplicación si tu cuenta la permite.' }

function deConocido(k: (typeof CONOCIDOS)[number], email: string, origen: string, etiqueta = k.etiqueta): Deteccion {
  const ms = k.proveedor === 'microsoft'
  return {
    proveedor: k.proveedor,
    etiqueta,
    servidores: { ...k.s, usuario: email },
    auth: ms && oauthDisponible('microsoft') ? 'microsoft' : 'clave',
    ayuda: ms ? ayudaMicrosoft() : k.ayuda,
    origen,
  }
}

/** Nombre sugerido para la cuenta a partir del dominio: «estudio-ejemplo.es» → «Estudio ejemplo». */
const etiquetaDeDominio = (d: string) => {
  const base = d.split('.').slice(-2, -1)[0] ?? d
  return (base.charAt(0).toUpperCase() + base.slice(1)).replace(/[-_]+/g, ' ')
}

async function conTiempo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])
}

/** Lee un config-v1.1.xml de Thunderbird (solo IMAP y SMTP). */
function leerXml(xml: string, email: string): Omit<Servidores, 'tlsNombre'> | null {
  const [local, dominio] = email.split('@')
  const sustituir = (s: string) => s.replace(/%EMAILADDRESS%/g, email).replace(/%EMAILLOCALPART%/g, local).replace(/%EMAILDOMAIN%/g, dominio)
  const bloque = (tipo: 'incomingServer' | 'outgoingServer', protocolo: string) =>
    [...xml.matchAll(new RegExp(`<${tipo}[^>]*type="${protocolo}"[^>]*>([\\s\\S]*?)</${tipo}>`, 'g'))]
      .map((m) => m[1])
      .map((b) => ({
        host: b.match(/<hostname>([^<]+)<\/hostname>/)?.[1]?.trim(),
        puerto: Number(b.match(/<port>(\d+)<\/port>/)?.[1]),
        socket: b.match(/<socketType>([^<]+)<\/socketType>/)?.[1]?.trim(),
        usuario: b.match(/<username>([^<]+)<\/username>/)?.[1]?.trim(),
      }))
      // Primero las cifradas de verdad (SSL/TLS), luego STARTTLS; nunca en claro.
      .filter((x) => x.host && x.puerto && x.socket !== 'plain')
      .sort((a, b) => (a.socket === 'SSL' ? -1 : 0) - (b.socket === 'SSL' ? -1 : 0))[0]
  const i = bloque('incomingServer', 'imap')
  const o = bloque('outgoingServer', 'smtp')
  if (!i?.host || !o?.host) return null
  return { imap: i.host, puerto: i.puerto, smtp: o.host, smtpPuerto: o.puerto, usuario: sustituir(i.usuario ?? '%EMAILADDRESS%') }
}

async function pedirXml(url: string, email: string) {
  const r = await conTiempo(fetch(url, { signal: AbortSignal.timeout(6000) }), 6500)
  if (!r?.ok) return null
  return leerXml(await r.text(), email)
}

/** ¿Responde un servidor IMAP con TLS en ese nombre? (para el último recurso) */
function responde(host: string, puerto: number): Promise<boolean> {
  return new Promise((ok) => {
    const s = tls.connect({ host, port: puerto, servername: host, rejectUnauthorized: false, timeout: 4000 }, () => {
      s.destroy()
      ok(true)
    })
    s.on('error', () => ok(false))
    s.on('timeout', () => (s.destroy(), ok(false)))
  })
}

export async function detectar(email: string): Promise<Deteccion> {
  email = email.trim().toLowerCase()
  const dominio = email.split('@')[1]
  if (!dominio) throw new Error('La dirección no es válida')

  const conocido = CONOCIDOS.find((k) => k.dominios.includes(dominio))
  if (conocido) return deConocido(conocido, email, 'proveedor conocido')

  // Dominio propio en Google Workspace o Microsoft 365: se nota en los MX.
  const mx = ((await conTiempo(resolveMx(dominio), 4000)) ?? []).sort((a, b) => a.priority - b.priority).map((m) => m.exchange.toLowerCase())
  const etiqueta = etiquetaDeDominio(dominio)
  if (mx.some((h) => /(^|\.)(google|googlemail)\.com$/.test(h) || h.endsWith('smtp.google.com'))) {
    return deConocido(CONOCIDOS[0], email, 'Google Workspace (por los registros MX)', etiqueta)
  }
  if (mx.some((h) => h.endsWith('.mail.protection.outlook.com') || h.endsWith('outlook.com'))) {
    return deConocido(CONOCIDOS[1], email, 'Microsoft 365 (por los registros MX)', etiqueta)
  }

  // Base de datos de Mozilla, autoconfig del dominio y la del dominio de los MX.
  const mxBase = mx[0]?.split('.').slice(-2).join('.')
  const intentos: [string, string][] = [
    [`https://autoconfig.thunderbird.net/v1.1/${dominio}`, 'base de datos de Mozilla'],
    [`https://autoconfig.${dominio}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`, `autoconfig de ${dominio}`],
    [`https://${dominio}/.well-known/autoconfig/mail/config-v1.1.xml`, `autoconfig de ${dominio}`],
    ...(mxBase && mxBase !== dominio ? ([[`https://autoconfig.thunderbird.net/v1.1/${mxBase}`, `base de datos de Mozilla (${mxBase})`]] as [string, string][]) : []),
  ]
  for (const [url, origen] of intentos) {
    const s = await pedirXml(url, email)
    if (s) return { proveedor: 'otro', etiqueta, servidores: s, auth: 'clave', origen }
  }

  // Último recurso: los nombres de siempre.
  for (const host of [`mail.${dominio}`, `imap.${dominio}`]) {
    if (await responde(host, 993)) {
      const smtp = host.startsWith('imap.') ? `smtp.${dominio}` : host
      return { proveedor: 'otro', etiqueta, servidores: { imap: host, puerto: 993, smtp, smtpPuerto: 465, usuario: email }, auth: 'clave', origen: 'probando nombres habituales' }
    }
  }
  return { proveedor: 'otro', etiqueta, servidores: null, auth: 'clave', origen: 'no encontrada: hay que ponerla a mano' }
}

// ------------------------------------------------------------ prueba de conexión

export type ResultadoPrueba =
  | { ok: true }
  | { ok: false; donde: 'imap' | 'smtp'; motivo: 'clave' | 'certificado' | 'conexion'; detalle: string; certificado?: string }

/** Nombre del certificado que presenta el servidor (para ofrecer confiar en él si no coincide). */
function nombreCertificado(host: string, puerto: number): Promise<string | null> {
  return new Promise((ok) => {
    const s = tls.connect({ host, port: puerto, servername: host, rejectUnauthorized: false, timeout: 5000 }, () => {
      const cert = s.getPeerCertificate()
      s.destroy()
      // Con el certificado válido (cadena de confianza) pero de otro nombre: se usa ese nombre.
      if (!s.authorized && s.authorizationError && !/altname|hostname/i.test(String(s.authorizationError))) return ok(null)
      const dns = (cert.subjectaltname ?? '').split(/,\s*/).map((x) => x.replace(/^DNS:/, '')).filter(Boolean)
      const nombre = dns[0] ?? cert.subject?.CN
      ok(nombre ? String(nombre).replace(/^\*\./, 'mail.') : null)
    })
    s.on('error', () => ok(null))
    s.on('timeout', () => (s.destroy(), ok(null)))
  })
}

const esCertificado = (e: Error & { code?: string }) =>
  /ALTNAME|HOSTNAME|CERT|self.signed|unable to verify/i.test(`${e.code ?? ''} ${e.message}`)

export async function probar(
  s: Servidores,
  credencial: { pass: string } | { accessToken: string },
): Promise<ResultadoPrueba> {
  const cli = new ImapFlow({
    host: s.imap,
    port: s.puerto,
    secure: s.puerto !== 143 && s.puerto !== 1143,
    auth: { user: s.usuario, ...credencial },
    tls: opcionesTls(s),
    logger: false,
    emitLogs: false,
  })
  cli.on('error', () => {})
  try {
    await conTiempo(cli.connect(), 20_000).then((r) => {
      if (r === null && !cli.usable) throw new Error('El servidor IMAP no responde')
    })
    await cli.logout().catch(() => {})
  } catch (err) {
    const e = err as Error & { code?: string; authenticationFailed?: boolean; responseText?: string }
    if (e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|authentication failed/i.test(`${e.responseText ?? ''} ${e.message}`)) {
      return { ok: false, donde: 'imap', motivo: 'clave', detalle: e.responseText || e.message }
    }
    if (esCertificado(e)) return { ok: false, donde: 'imap', motivo: 'certificado', detalle: e.message, certificado: (await nombreCertificado(s.imap, s.puerto)) ?? undefined }
    return { ok: false, donde: 'imap', motivo: 'conexion', detalle: e.message }
  }

  const t = nodemailer.createTransport({
    host: s.smtp,
    port: s.smtpPuerto,
    secure: s.smtpPuerto === 465,
    requireTLS: s.smtpPuerto !== 465,
    auth: 'pass' in credencial ? { user: s.usuario, pass: credencial.pass } : { type: 'OAuth2', user: s.usuario, accessToken: credencial.accessToken },
    tls: opcionesTls(s),
    connectionTimeout: 15_000,
  })
  try {
    await t.verify()
  } catch (err) {
    const e = err as Error & { code?: string; responseCode?: number }
    // Microsoft a veces no deja enviar con OAuth en cuentas personales nuevas: se avisa, pero la
    // cuenta se puede añadir igual para leer.
    if (e.code === 'EAUTH' || e.responseCode === 535) return { ok: false, donde: 'smtp', motivo: 'clave', detalle: e.message }
    if (esCertificado(e)) return { ok: false, donde: 'smtp', motivo: 'certificado', detalle: e.message, certificado: (await nombreCertificado(s.smtp, s.smtpPuerto)) ?? undefined }
    return { ok: false, donde: 'smtp', motivo: 'conexion', detalle: e.message }
  } finally {
    t.close()
  }
  return { ok: true }
}

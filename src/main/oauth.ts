// Inicio de sesión con OAuth 2.0 para apps de escritorio: PKCE y redirección a localhost (RFC 8252).
// Se abre el navegador del sistema, el usuario entra en su proveedor y NimboMail recibe el código en un
// servidor local de un solo uso. En una app de escritorio el client ID no es secreto: lo protege PKCE.
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'

export type IdOAuth = 'microsoft' | 'google'

interface Proveedor {
  clientId: string
  clientSecret?: string // Google lo pide también a las apps de escritorio (no es secreto de verdad)
  autorizar: string
  token: string
  scopes: string[]
  extra?: Record<string, string>
}

// Los client ID se registran gratis en cada proveedor (ver README). Se pueden dar también por
// variable de entorno para probar con uno propio.
const PROVEEDORES: Record<IdOAuth, Proveedor> = {
  microsoft: {
    clientId: process.env.NIMBOMAIL_MICROSOFT_CLIENT_ID ?? '',
    autorizar: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'https://outlook.office.com/IMAP.AccessAsUser.All', 'https://outlook.office.com/SMTP.Send'],
  },
  // Preparado para cuando la app esté verificada en Google; hasta entonces, contraseña de aplicación.
  google: {
    clientId: process.env.NIMBOMAIL_GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.NIMBOMAIL_GOOGLE_CLIENT_SECRET ?? '',
    autorizar: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scopes: ['https://mail.google.com/'],
    extra: { access_type: 'offline', prompt: 'consent' },
  },
}

export const oauthDisponible = (id: IdOAuth) => !!PROVEEDORES[id].clientId

const base64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export interface Tokens {
  acceso: string
  renovacion?: string
  caduca: number
}

async function pedirToken(p: Proveedor, cuerpo: Record<string, string>): Promise<Tokens> {
  const r = await fetch(p.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: p.clientId, ...(p.clientSecret ? { client_secret: p.clientSecret } : {}), ...cuerpo }),
  })
  const d = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string }
  if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error || `El proveedor respondió ${r.status}`)
  return { acceso: d.access_token, renovacion: d.refresh_token, caduca: Date.now() + (d.expires_in ?? 3600) * 1000 }
}

/** Abre el navegador para entrar y devuelve los tokens (el de renovación se guarda en el llavero). */
export function iniciarSesion(id: IdOAuth, pista?: string): Promise<Tokens> {
  const p = PROVEEDORES[id]
  if (!p.clientId) return Promise.reject(new Error('Esta versión de NimboMail no tiene configurado el inicio de sesión con este proveedor'))
  const verificador = base64url(randomBytes(32))
  const reto = base64url(createHash('sha256').update(verificador).digest())
  const estado = base64url(randomBytes(16))

  return new Promise((resolve, reject) => {
    let redireccion = ''
    const fin = setTimeout(() => cerrar(new Error('Se agotó el tiempo para iniciar sesión')), 5 * 60_000)
    const servidor = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname !== '/') return res.writeHead(404).end()
      const error = url.searchParams.get('error_description') || url.searchParams.get('error')
      const codigo = url.searchParams.get('code')
      const ok = !error && codigo && url.searchParams.get('state') === estado
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><meta charset="utf-8"><title>NimboMail</title><body style="font:16px system-ui;background:#141516;color:#e4e6e7;display:grid;place-items:center;height:90vh">` +
          (ok ? 'Listo. Ya puedes volver a NimboMail.' : 'No se pudo iniciar sesión. Vuelve a NimboMail para intentarlo de nuevo.') +
          '</body>',
      )
      if (!ok) return cerrar(new Error(error || 'Respuesta no válida del proveedor'))
      try {
        cerrar(null, await pedirToken(p, { grant_type: 'authorization_code', code: codigo!, redirect_uri: redireccion, code_verifier: verificador }))
      } catch (e) {
        cerrar(e as Error)
      }
    })
    const cerrar = (err: Error | null, t?: Tokens) => {
      clearTimeout(fin)
      servidor.close()
      if (err) reject(err)
      else resolve(t!)
    }
    // Solo en la interfaz local, en un puerto libre cualquiera.
    servidor.listen(0, '127.0.0.1', () => {
      const puerto = (servidor.address() as AddressInfo).port
      redireccion = id === 'microsoft' ? `http://localhost:${puerto}` : `http://127.0.0.1:${puerto}`
      const q = new URLSearchParams({
        client_id: p.clientId,
        response_type: 'code',
        redirect_uri: redireccion,
        scope: p.scopes.join(' '),
        code_challenge: reto,
        code_challenge_method: 'S256',
        state: estado,
        ...(pista ? { login_hint: pista } : {}),
        ...p.extra,
      })
      shell.openExternal(`${p.autorizar}?${q}`)
    })
  })
}

export function renovarAcceso(id: IdOAuth, renovacion: string): Promise<Tokens> {
  return pedirToken(PROVEEDORES[id], { grant_type: 'refresh_token', refresh_token: renovacion, scope: PROVEEDORES[id].scopes.join(' ') })
}

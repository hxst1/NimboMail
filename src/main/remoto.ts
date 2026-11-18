// Imágenes remotas con protección de privacidad: el principal las descarga cuando llega el correo (no al
// abrirlo), sin cookies ni Referer, y el correo las ve desde la caché por tuxmail://remoto/<suma>.
// El iframe del correo nunca sale a internet; los píxeles de rastreo no se descargan nunca.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { nativeImage } from 'electron'
import type { Db } from './db'

export const DIR_REMOTO = join(homedir(), '.cache', 'tuxmail', 'remoto')
const MAX_BYTES = 5 * 1024 * 1024
const ESPERA_MS = 10_000
const EN_PARALELO = 4
// Un navegador cualquiera: que no se distinga a TuxMail del resto.
const AGENTE = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
export const GIF_VACIO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// Servicios de rastreo de aperturas conocidos (la URL entera se compara en minúsculas).
const RASTREADORES = [
  /mailtrack\.io/, /yesware\.com/, /sidekickopen/, /t\.(sidekick|signaux)/, /\/wf\/open\b/, /\/track\/open/,
  /list-manage\.com\/track/, /mandrillapp\.com\/track/, /mailchimp\.com\/.*\/open/, /bananatag\.com/, /getnotify\.com/,
  /mailtag\.io/, /readnotify\.com/, /streak\.com\/.*pixel/, /mixmax\.com\/.*\/open/, /cirrusinsight\.com/, /emltrk\.com/,
  /hubspotemail\.net\/.*\/(o|e)\d/, /\/e2t\/to\//, /pixel\.(gif|png)\b/, /\/open\.(gif|png|php)\b/, /\/(beacon|pixel|tracking)(\.gif|\.png|\/|\?)/,
  /email\.mg\.[^/]+\/o\//, /sendibt\d?\.com\/tr\/op/, /trk\.klclick\.com\/.*open/, /links\.[^/]+\/e\/o\//, /ct\.sendgrid\.net\/wf\/open/,
]

export const esRastreador = (url: string) => {
  const u = url.toLowerCase()
  return RASTREADORES.some((r) => r.test(u))
}

const suma = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 32)
const desentidad = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0*38;/g, '&').replace(/&quot;/g, '"').trim()

/** ¿Tiene el HTML referencias remotas sin reescribir? (cuerpos guardados antes de esto) */
export const tieneRemotas = (html: string) => /(?:src|background|poster)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i.test(html)

// Atributos de tamaño que delatan un píxel: width/height de 0–2 px.
const PIXEL = /\b(?:width|height)\s*=\s*["']?\s*[0-2](?:px)?\s*["'\s/>]|(?:^|[;"'\s])(?:width|height)\s*:\s*[0-2](?:px)?\s*(?:;|["'])/i
const OCULTA = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;"'\s]|$)/i

export class Remotas {
  private enCurso = new Map<string, Promise<boolean>>()
  private cola: string[] = []
  private activas = 0

  constructor(private db: Db) {}

  /**
   * Cambia cada imagen remota por tuxmail://remoto/<suma> y apunta la URL para descargarla.
   * Los píxeles de rastreo (por servicio conocido o por tamaño) se quedan en un GIF vacío.
   */
  reescribir(html: string): { html: string; sumas: string[] } {
    const sumas = new Set<string>()
    const registrar = (bruta: string): string => {
      const url = desentidad(bruta)
      if (!/^https?:\/\//i.test(url) || esRastreador(url)) return GIF_VACIO
      const s = suma(url)
      this.db.apuntarRemota(s, url)
      sumas.add(s)
      return `tuxmail://remoto/${s}`
    }

    // 1. <img> enteros: los píxeles por tamaño o invisibles, fuera antes de nada.
    let out = html.replace(/<img\b[^>]*>/gi, (tag) => {
      const src = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const url = src ? (src[1] ?? src[2] ?? src[3] ?? '') : ''
      if (!/^\s*https?:/i.test(url)) return tag
      if (PIXEL.test(tag) || OCULTA.test(tag)) return tag.replace(src![0], ` src="${GIF_VACIO}"`)
      return tag
    })
    // 2. srcset con URLs remotas: se quita (con el src basta).
    out = out.replace(/\ssrcset\s*=\s*(?:"[^"]*https?:[^"]*"|'[^']*https?:[^']*')/gi, '')
    // 3. src / background / poster remotos.
    out = out.replace(
      /(\s(?:src|background|poster)\s*=\s*)(?:"\s*(https?:[^"]*)"|'\s*(https?:[^']*)'|(https?:[^\s>]+))/gi,
      (_m, attr: string, a?: string, b?: string, c?: string) => `${attr}"${registrar(a ?? b ?? c ?? '')}"`,
    )
    // 4. Hojas de estilo y fuentes remotas: fuera (casi nunca hacen falta y también rastrean).
    out = out.replace(/<link\b[^>]*\bhref\s*=\s*["']?\s*https?:[^>]*>/gi, '')
    out = out.replace(/@import\s+(?:url\()?\s*["']?https?:[^;]*;?/gi, '')
    out = out.replace(/@font-face\s*\{[^}]*\}/gi, '') // tipografías web: no se cargan (la CSP tampoco las dejaría)
    // 5. url(...) en estilos (atributos style y bloques <style>). Sin comillas: la suma no lleva
    //    caracteres raros y así no se rompe un style="…" que ya va entre comillas.
    out = out.replace(/url\(\s*(?:&quot;|["'])?\s*(https?:[^"')]+?)\s*(?:&quot;|["'])?\s*\)/gi, (_m, u: string) => `url(${registrar(u)})`)
    return { html: out, sumas: [...sumas] }
  }

  private ruta(s: string) {
    return join(DIR_REMOTO, s)
  }

  /** Descarga en segundo plano (como mucho EN_PARALELO a la vez). */
  precargar(sumas: string[]) {
    for (const s of sumas) if (!existsSync(this.ruta(s)) && !this.cola.includes(s)) this.cola.push(s)
    this.bombear()
  }

  private bombear() {
    while (this.activas < EN_PARALELO && this.cola.length) {
      const s = this.cola.shift()!
      this.activas++
      this.descargar(s).finally(() => {
        this.activas--
        this.bombear()
      })
    }
  }

  /** Baja una imagen (una sola vez aunque la pidan varios a la vez). true si quedó en caché. */
  descargar(s: string): Promise<boolean> {
    if (existsSync(this.ruta(s))) return Promise.resolve(true)
    const ya = this.enCurso.get(s)
    if (ya) return ya
    const p = this.bajar(s).finally(() => this.enCurso.delete(s))
    this.enCurso.set(s, p)
    return p
  }

  private async bajar(s: string): Promise<boolean> {
    const fila = this.db.remota(s)
    if (!fila || fila.estado === 2) return false
    try {
      const r = await fetch(fila.url, {
        headers: { 'User-Agent': AGENTE, Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'follow',
        signal: AbortSignal.timeout(ESPERA_MS),
      })
      const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!r.ok || !tipo.startsWith('image/') || Number(r.headers.get('content-length') ?? 0) > MAX_BYTES) {
        this.db.estadoRemota(s, 2, tipo)
        return false
      }
      const datos = await leerConLimite(r, MAX_BYTES)
      if (!datos) {
        this.db.estadoRemota(s, 2, tipo)
        return false
      }
      // Un píxel que se coló (1×1 sin atributos): se guarda vacío para no enseñarlo.
      const tam = tipo === 'image/svg+xml' ? null : nativeImage.createFromBuffer(datos).getSize()
      const pixel = !!tam && tam.width > 0 && tam.width <= 2 && tam.height <= 2
      await mkdir(DIR_REMOTO, { recursive: true })
      await writeFile(this.ruta(s), pixel ? Buffer.from(GIF_VACIO.split(',')[1], 'base64') : datos)
      this.db.estadoRemota(s, 1, pixel ? 'image/gif' : tipo)
      return true
    } catch {
      return false // sin red o tarda demasiado: se reintenta la próxima vez que se pida
    }
  }

  tipo(s: string): string | null {
    return this.db.remota(s)?.tipo ?? null
  }

  /** Para el protocolo tuxmail://remoto/<suma>: de la caché, o se descarga al momento. */
  async servir(s: string): Promise<Response> {
    if (!/^[0-9a-f]{32}$/.test(s)) return new Response('No encontrado', { status: 404 })
    const ok = await this.descargar(s)
    if (!ok) return new Response('No disponible', { status: 404 })
    const tipo = this.db.remota(s)?.tipo || 'application/octet-stream'
    return new Response(new Uint8Array(await readFile(this.ruta(s))), {
      headers: { 'content-type': tipo, 'cache-control': 'max-age=31536000, immutable' },
    })
  }
}

async function leerConLimite(r: Response, max: number): Promise<Buffer | null> {
  if (!r.body) return null
  const trozos: Uint8Array[] = []
  let total = 0
  for await (const t of r.body as unknown as AsyncIterable<Uint8Array>) {
    total += t.length
    if (total > max) return null
    trozos.push(t)
  }
  return Buffer.concat(trozos)
}

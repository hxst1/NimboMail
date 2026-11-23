// Traductor inglés → español en local con Bergamot (el motor de Firefox Translations).
// El principal solo descarga el modelo de Mozilla y sirve los archivos por nimbomail://traductor/.
// El motor corre en un Web Worker dentro de un iframe con su propio origen, sin acceso a la app:
// el texto de los correos nunca sale del PC.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { t } from './idioma'

const DIR_MODELO = join(homedir(), '.local', 'share', 'nimbomail', 'traduccion', 'en-es')
const DIR_PAGINA = join(import.meta.dirname, '../../resources/traductor')
const DIR_MOTOR = join(dirname(createRequire(import.meta.url).resolve('@browsermt/bergamot-translator/package.json')), 'worker')
const AJUSTES = 'https://firefox.settings.services.mozilla.com/v1'
const ARCHIVOS = { model: 'model.bin', lex: 'lex.bin', vocab: 'vocab.spm' } as const

// Solo lo que hace falta: scripts y WebAssembly de su propio origen, nada hacia fuera.
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; worker-src 'self'; connect-src 'self'"

export const modeloListo = () => Object.values(ARCHIVOS).every((f) => existsSync(join(DIR_MODELO, f)))

let preparando: Promise<void> | null = null

/** Descarga el modelo la primera vez (unos 37 MB), comprobando la suma que publica Mozilla. */
export function prepararTraductor(): Promise<void> {
  if (modeloListo()) return Promise.resolve()
  if (!preparando) preparando = descargarModelo().finally(() => (preparando = null))
  return preparando
}

interface Registro {
  fileType: keyof typeof ARCHIVOS
  version: string
  attachment: { location: string; hash: string; size: number }
}

async function descargarModelo() {
  const raiz = (await (await fetch(`${AJUSTES}/`)).json()) as { capabilities: { attachments: { base_url: string } } }
  const base = raiz.capabilities.attachments.base_url
  const { data } = (await (
    await fetch(`${AJUSTES}/buckets/main/collections/translations-models/records?fromLang=en&toLang=es`)
  ).json()) as { data: Registro[] }
  // La versión más nueva de cada archivo (modelo, lista corta y vocabulario).
  const num = (v: string) => v.split('.').map((x) => x.padStart(4, '0')).join('.')
  const ultimo = new Map<string, Registro>()
  for (const r of data) {
    if (!(r.fileType in ARCHIVOS)) continue
    const ya = ultimo.get(r.fileType)
    if (!ya || num(r.version) > num(ya.version)) ultimo.set(r.fileType, r)
  }
  if (ultimo.size !== 3) throw new Error(t().principal.traductor.modeloIncompleto)
  await mkdir(DIR_MODELO, { recursive: true })
  for (const r of ultimo.values()) {
    const resp = await fetch(base + r.attachment.location)
    if (!resp.ok) throw new Error(t().principal.traductor.noDescargar(resp.status))
    const datos = Buffer.from(await resp.arrayBuffer())
    const suma = createHash('sha256').update(datos).digest('hex')
    if (suma !== r.attachment.hash) throw new Error(t().principal.traductor.sumaNoCoincide)
    const destino = join(DIR_MODELO, ARCHIVOS[r.fileType])
    await writeFile(destino + '.tmp', datos)
    await rename(destino + '.tmp', destino)
  }
  await writeFile(join(DIR_MODELO, 'version.json'), JSON.stringify([...ultimo.values()].map((r) => [r.fileType, r.version])))
}

const TIPOS: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  wasm: 'application/wasm',
  bin: 'application/octet-stream',
  spm: 'application/octet-stream',
}

/** nimbomail://traductor/<pagina.html|trabajador.js> · motor/<archivo> · modelo/<archivo> */
export async function servirTraductor(ruta: string): Promise<Response> {
  const partes = ruta.replace(/^\/+/, '').split('/')
  let archivo: string | null = null
  if (partes.length === 1 && /^(pagina\.html|pagina\.js|trabajador\.js)$/.test(partes[0])) archivo = join(DIR_PAGINA, partes[0])
  else if (partes[0] === 'motor' && /^bergamot-translator-worker\.(js|wasm)$/.test(partes[1] ?? '')) archivo = join(DIR_MOTOR, partes[1])
  else if (partes[0] === 'modelo' && Object.values(ARCHIVOS).includes(partes[1] as never)) archivo = join(DIR_MODELO, partes[1])
  if (!archivo || !existsSync(archivo)) return new Response('No encontrado', { status: 404 })
  const ext = archivo.split('.').pop() ?? ''
  return new Response(new Uint8Array(await readFile(archivo)), {
    headers: { 'content-type': TIPOS[ext] ?? 'application/octet-stream', 'content-security-policy': CSP },
  })
}

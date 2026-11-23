// Adjuntos en caché de disco, servidos a la interfaz por el protocolo nimbomail://adjunto/…
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Attachment } from 'mailparser'
import type { Adjunto } from '@shared/tipos'

export const DIR_ADJUNTOS = join(homedir(), '.cache', 'nimbomail', 'adjuntos')

const carpetaDe = (id: string) => createHash('sha1').update(id).digest('hex').slice(0, 20)
const limpio = (nombre: string) => nombre.replace(/[/\\\0]/g, '_').slice(0, 180) || 'adjunto'

export async function guardarAdjuntos(id: string, lista: Attachment[]): Promise<Adjunto[]> {
  if (!lista.length) return []
  const dir = join(DIR_ADJUNTOS, carpetaDe(id))
  await mkdir(dir, { recursive: true })
  const out: Adjunto[] = []
  for (const [i, a] of lista.entries()) {
    const nombre = limpio(a.filename ?? `adjunto-${i + 1}`)
    const archivo = `${i}-${nombre}`
    await writeFile(join(dir, archivo), a.content)
    out.push({
      nombre,
      tipo: a.contentType || 'application/octet-stream',
      tamano: a.size ?? a.content.length,
      url: `nimbomail://adjunto/${carpetaDe(id)}/${i}`,
      // Las imágenes incrustadas en el HTML (cid:) no salen como adjunto, pero sí en el visor.
      inline: !!a.related || (a.contentDisposition === 'inline' && !!a.cid),
    })
  }
  return out
}

// ------------------------------------------------------------ adjuntos bajo demanda
// En los correos grandes solo se baja el texto: los adjuntos se apuntan en un manifiesto y se
// descargan la primera vez que alguien los pide (vista rápida, copiar, guardar).

export interface AdjuntoPendiente {
  parte: string
  nombre: string
  tipo: string
  tamano: number
}

type Descargador = (id: string, parte: string) => Promise<Buffer>
let descargador: Descargador | null = null
export const ponerDescargador = (fn: Descargador) => {
  descargador = fn
}
const bajando = new Map<string, Promise<void>>()

export async function apuntarAdjuntos(id: string, lista: AdjuntoPendiente[]): Promise<Adjunto[]> {
  if (!lista.length) return []
  const dir = join(DIR_ADJUNTOS, carpetaDe(id))
  await mkdir(dir, { recursive: true })
  const partes = lista.map((a, i) => ({ ...a, nombre: limpio(a.nombre || `adjunto-${i + 1}`) }))
  await writeFile(join(dir, 'manifiesto.json'), JSON.stringify({ id, partes }))
  return partes.map((a, i) => ({
    nombre: a.nombre,
    tipo: a.tipo || 'application/octet-stream',
    tamano: a.tamano,
    url: `nimbomail://adjunto/${carpetaDe(id)}/${i}`,
    inline: false,
  }))
}

/** Ruta en disco de nimbomail://adjunto/<carpeta>/<índice>, sin dejar salir de la caché. */
export async function rutaAdjunto(carpeta: string, indice: string): Promise<{ ruta: string; nombre: string } | null> {
  if (!/^[0-9a-f]{20}$/.test(carpeta) || !/^\d+$/.test(indice)) return null
  const dir = join(DIR_ADJUNTOS, carpeta)
  const buscar = async () => (await readdir(dir).catch(() => [] as string[])).find((f) => f.startsWith(`${indice}-`))
  let archivo = await buscar()
  if (!archivo && descargador) {
    // No está en disco: si el manifiesto lo conoce, se baja ahora (una sola vez aunque lo pidan dos).
    const clave = `${carpeta}/${indice}`
    let p = bajando.get(clave)
    if (!p) {
      p = (async () => {
        const m = JSON.parse(await readFile(join(dir, 'manifiesto.json'), 'utf8')) as { id: string; partes: AdjuntoPendiente[] }
        const a = m.partes[Number(indice)]
        if (!a) return
        await writeFile(join(dir, `${indice}-${a.nombre}`), await descargador!(m.id, a.parte))
      })()
        .catch((e) => console.error('[adjunto]', (e as Error).message))
        .finally(() => bajando.delete(clave))
      bajando.set(clave, p)
    }
    await p
    archivo = await buscar()
  }
  return archivo ? { ruta: join(dir, archivo), nombre: archivo.slice(indice.length + 1) } : null
}

export async function leerAdjunto(url: string): Promise<{ datos: Buffer; nombre: string } | null> {
  const m = url.match(/^nimbomail:\/\/adjunto\/([0-9a-f]{20})\/(\d+)$/)
  if (!m) return null
  const r = await rutaAdjunto(m[1], m[2])
  return r ? { datos: await readFile(r.ruta), nombre: r.nombre } : null
}

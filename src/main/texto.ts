// Decodificar trocitos de cuerpo para las vistas previas de la lista.

export interface NodoEstructura {
  part?: string
  type: string
  parameters?: Record<string, string>
  encoding?: string
  disposition?: string
  dispositionParameters?: Record<string, string>
  id?: string // Content-ID, para las imágenes incrustadas (cid:)
  size?: number
  childNodes?: NodoEstructura[]
}

/** Parte de texto que mejor sirve de vista previa: text/plain, si no text/html. */
export function parteTexto(raiz: NodoEstructura): { parte: string; tipo: string; codificacion: string; charset: string } | null {
  let html: NodoEstructura | null = null
  let plano: NodoEstructura | null = null
  const visitar = (n: NodoEstructura) => {
    if (n.disposition === 'attachment') return
    if (n.type === 'text/plain' && !plano) plano = n
    else if (n.type === 'text/html' && !html) html = n
    n.childNodes?.forEach(visitar)
  }
  visitar(raiz)
  const n = (plano ?? html) as NodoEstructura | null
  if (!n) return null
  return {
    parte: n.part ?? '1',
    tipo: n.type,
    codificacion: (n.encoding ?? '7bit').toLowerCase(),
    charset: (n.parameters?.charset ?? 'utf-8').toLowerCase(),
  }
}

/** Adjuntos de verdad (no imágenes incrustadas en el HTML). */
export function contarAdjuntos(raiz: NodoEstructura): number {
  let n = 0
  const visitar = (x: NodoEstructura) => {
    const nombre = x.dispositionParameters?.filename ?? x.parameters?.name
    if (x.disposition === 'attachment' || (nombre && x.disposition !== 'inline' && !x.type.startsWith('text/'))) n++
    x.childNodes?.forEach(visitar)
  }
  visitar(raiz)
  return n
}

function decodificarQP(s: string): Uint8Array {
  const limpio = s.replace(/=\r?\n/g, '')
  const out: number[] = []
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(limpio.slice(i + 1, i + 3))) {
      out.push(parseInt(limpio.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      out.push(limpio.charCodeAt(i) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

export function decodificarParte(datos: Buffer, codificacion: string, charset: string): string {
  let bytes: Uint8Array
  if (codificacion === 'base64') {
    // Un trozo cortado puede acabar a mitad de bloque: se recorta a múltiplo de 4.
    const b64 = datos.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, '')
    bytes = Buffer.from(b64.slice(0, b64.length - (b64.length % 4)), 'base64')
  } else if (codificacion === 'quoted-printable') {
    bytes = decodificarQP(datos.toString('latin1'))
  } else {
    bytes = datos
  }
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

const ENTIDADES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
      }
      return ENTIDADES[e.toLowerCase()] ?? m
    })
}

/** Texto plano → vista previa de dos líneas: sin citas, sin firmas de móvil, espacios colapsados. */
export function vistaPrevia(texto: string, esHtml: boolean): string {
  const plano = esHtml ? htmlATexto(texto) : texto
  const lineas: string[] = []
  for (const l of plano.split(/\r?\n/)) {
    const t = l.trim()
    if (t.startsWith('>')) continue
    // A partir de «El … escribió:» / «On … wrote:» / cabecera de Outlook es todo cita.
    if (/^(El .+ escribi[óo]:|On .+ wrote:|-{2,}\s*Original Message|De:\s.+|From:\s.+)$/i.test(t) && lineas.length) break
    lineas.push(t)
  }
  const limpiar = (t: string) =>
    t
      .replace(/[[<(]\s*(https?:|mailto:)[^\]>)\s]*\s*[\]>)]/gi, ' ') // [https://…] <mailto:…> que deja el texto de los HTML
      .replace(/\bhttps?:\/\/\S+/gi, ' ')
      .replace(/([-=_*~·•→—])\1{2,}|[-=_]{3,}/g, ' ') // rayas separadoras
      .replace(/\s*[→›»]+\s*(?=\s|$)/g, ' ')
      .replace(/[\u200b-\u200d\u00ad\ufeff\u034f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const propio = limpiar(lineas.join(' '))
  // Si todo el mensaje va citado, mejor enseñar la cita que nada.
  return propio || limpiar(plano.replace(/^\s*>[> ]*/gm, ''))
}

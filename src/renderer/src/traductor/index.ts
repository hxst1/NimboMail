// Traductor inglés → español de TuxMail, en local.
// El motor (Bergamot) corre en un worker dentro de un iframe invisible con su propio origen
// (tuxmail://traductor): no ve nada de la app y la app solo le pasa textos por postMessage.
import { api } from '@/estado'

const ORIGEN = 'tuxmail://traductor'

type Pendiente = { ok: (r: string[]) => void; ko: (e: Error) => void }
let marco: HTMLIFrameElement | null = null
let arranque: Promise<void> | null = null
let siguiente = 0
const pendientes = new Map<number, Pendiente>()

/** Arranca el traductor (la primera vez descarga el modelo, unos 37 MB). */
export function iniciarTraductor(): Promise<void> {
  if (arranque) return arranque
  arranque = (async () => {
    await api.prepararTraductor()
    await new Promise<void>((ok, ko) => {
      const alMensaje = (e: MessageEvent) => {
        if (!marco || e.source !== marco.contentWindow) return
        const d = e.data as { tipo?: string; id?: number; resultado?: string[]; error?: string }
        if (d.tipo === 'listo') return ok()
        if (d.tipo === 'error') return ko(new Error(d.error))
        const p = d.id !== undefined ? pendientes.get(d.id) : undefined
        if (!p) return
        pendientes.delete(d.id!)
        if (d.error) p.ko(new Error(d.error))
        else p.ok(d.resultado ?? [])
      }
      window.addEventListener('message', alMensaje)
      marco = document.createElement('iframe')
      marco.src = `${ORIGEN}/pagina.html`
      marco.setAttribute('sandbox', 'allow-scripts allow-same-origin')
      marco.setAttribute('aria-hidden', 'true')
      marco.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
      document.body.appendChild(marco)
    })
  })()
  arranque.catch(() => {
    marco?.remove()
    marco = null
    arranque = null
  })
  return arranque
}

async function traducirLote(textos: { text: string; html: boolean }[]): Promise<string[]> {
  await iniciarTraductor()
  return new Promise((ok, ko) => {
    const id = ++siguiente
    pendientes.set(id, { ok, ko })
    marco!.contentWindow!.postMessage({ tipo: 'traducir', id, textos }, ORIGEN)
  })
}

/** Una selección o un trozo de texto suelto. */
export async function traducirTexto(texto: string): Promise<string> {
  const parrafos = texto.split(/\n\s*\n/)
  const limpios = parrafos.map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
  const conTexto = limpios.map((p, i) => [p, i] as const).filter(([p]) => /\p{L}/u.test(p))
  const r = conTexto.length ? await traducirLote(conTexto.map(([p]) => ({ text: p, html: false }))) : []
  const out = [...limpios]
  conTexto.forEach(([, i], k) => (out[i] = r[k]))
  return out.join('\n\n')
}

// ------------------------------------------------------------ documentos HTML

const EN_LINEA = new Set([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'BIG', 'CITE', 'DFN', 'EM', 'FONT', 'I', 'KBD', 'LABEL', 'MARK', 'Q', 'S',
  'SAMP', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TIME', 'TT', 'U', 'VAR', 'WBR', 'IMG', 'DEL', 'INS', 'NOBR',
])
const SALTAR = new Set(['STYLE', 'SCRIPT', 'HEAD', 'TITLE', 'CODE', 'PRE', 'TEXTAREA', 'SVG', 'NOSCRIPT', 'SUMMARY', 'BR'])
const TEXTO = 3
const ELEMENTO = 1

const enLinea = (n: Node): boolean =>
  n.nodeType === TEXTO ||
  (n.nodeType === ELEMENTO && EN_LINEA.has((n as Element).tagName) && Array.from(n.childNodes).every(enLinea))

interface Segmento {
  nodos: Node[]
  html: boolean
  texto: string
  antes: string
  despues: string
}

const escapar = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/**
 * Trozos de texto que se traducen de una vez: las tiras de nodos en línea entre bloques y <br>.
 * Si la tira es un solo elemento (un <span> con estilo que envuelve el párrafo) se entra en él,
 * para no perder su formato. Las citas plegadas se dejan para cuando se desplieguen.
 */
function recoger(el: Element, out: Segmento[]) {
  if (SALTAR.has(el.tagName)) return
  if (el.tagName === 'DETAILS' && el.classList.contains('tm-cita') && (!(el as HTMLDetailsElement).open || (el as HTMLElement).dataset.tmTraducido)) return
  let tira: Node[] = []
  const cerrar = () => {
    const nodos = tira
    tira = []
    const texto = nodos.map((n) => n.textContent ?? '').join('')
    if (!/\p{L}{2}/u.test(texto)) return
    const elementos = nodos.filter((n) => n.nodeType === ELEMENTO) as Element[]
    if (elementos.length === 1 && !nodos.some((n) => n.nodeType === TEXTO && n.textContent!.trim()) && elementos[0].tagName !== 'A') {
      return recoger(elementos[0], out)
    }
    // Con enlaces o imágenes va como HTML para no perderlos; si no, como texto (traduce mejor).
    const html = elementos.some((e) => e.tagName === 'A' || e.tagName === 'IMG' || !!e.querySelector('a, img'))
    const bruto = html
      ? nodos.map((n) => (n.nodeType === TEXTO ? escapar(n.textContent ?? '') : (n as Element).outerHTML)).join('')
      : texto
    const antes = bruto.match(/^\s*/)![0]
    const despues = bruto.match(/\s*$/)![0]
    out.push({ nodos, html, texto: bruto.trim().replace(/\s+/g, ' '), antes, despues })
  }
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === ELEMENTO && SALTAR.has((n as Element).tagName)) {
      cerrar() // un <br>, un <style>…: corta la tira y no se traduce
      continue
    }
    if (enLinea(n)) tira.push(n)
    else {
      cerrar()
      if (n.nodeType === ELEMENTO) recoger(n as Element, out)
    }
  }
  cerrar()
}

function aplicar(s: Segmento, traduccion: string) {
  const primero = s.nodos[0]
  const padre = primero.parentNode
  if (!padre) return
  const doc = primero.ownerDocument!
  if (s.html) {
    const plantilla = doc.createElement('template')
    plantilla.innerHTML = s.antes + traduccion + s.despues
    padre.insertBefore(plantilla.content, primero)
  } else {
    padre.insertBefore(doc.createTextNode(s.antes + traduccion + s.despues), primero)
  }
  s.nodos.forEach((n) => n.parentNode?.removeChild(n))
}

/**
 * Traduce un documento (o una parte, p. ej. una cita al desplegarla) en su sitio, por lotes, para
 * que se vaya viendo. Marca lo traducido para no traducirlo dos veces.
 */
export async function traducirArbol(raiz: Element, alAvanzar?: () => void): Promise<void> {
  const segmentos: Segmento[] = []
  recoger(raiz, segmentos)
  for (let i = 0; i < segmentos.length; i += 40) {
    const lote = segmentos.slice(i, i + 40)
    const r = await traducirLote(lote.map((s) => ({ text: s.texto, html: s.html })))
    lote.forEach((s, k) => r[k] && aplicar(s, r[k]))
    alAvanzar?.()
  }
  // Las citas que estaban abiertas ya van traducidas.
  raiz.querySelectorAll<HTMLDetailsElement>('details.tm-cita[open]').forEach((d) => (d.dataset.tmTraducido = '1'))
  ;(raiz as HTMLElement).dataset.tmTraducido = '1'
}

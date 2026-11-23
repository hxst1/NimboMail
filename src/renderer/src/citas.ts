// Pliega el texto citado de las respuestas (como Mail): queda dentro de un <details>
// que se abre con «···». Funciona sin scripts, así que vale dentro del iframe aislado.
import DOMPurify from 'dompurify'
import { t } from '@/i18n'

const resumen = () => `<summary title="${t().lector.mostrarCita}">···</summary>`

// Marcadores de cita de los clientes más habituales.
const ELEMENTOS_CITA = [
  '.gmail_quote', // Gmail
  'blockquote[type="cite"]', // Apple Mail, Thunderbird
  '.yahoo_quoted', // Yahoo
  '.protonmail_quote', // Proton
  'div.moz-forward-container',
].join(',')

// Outlook no envuelve la cita: a partir del marcador, todo lo que sigue es cita.
const MARCADORES_OUTLOOK = ['#divRplyFwdMsg', '#appendonsend', 'div[id*="divRplyFwdMsg"]', '.moz-cite-prefix']

export function plegarCitasHtml(html: string): string {
  const limpio = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'script', 'iframe', 'object', 'embed'],
    ADD_ATTR: ['target'],
    // Como la de DOMPurify, más nimbomail: (imágenes remotas en caché y adjuntos servidos por la app).
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|nimbomail):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  })
  const doc = new DOMParser().parseFromString(limpio, 'text/html')

  const envolver = (nodos: Node[]) => {
    if (!nodos.length) return
    const det = doc.createElement('details')
    det.className = 'tm-cita'
    det.innerHTML = resumen()
    nodos[0].parentNode?.insertBefore(det, nodos[0])
    for (const n of nodos) det.appendChild(n)
  }

  // Outlook: el marcador (y la raya <hr> que suele ir justo antes) y todo lo que viene detrás.
  for (const sel of MARCADORES_OUTLOOK) {
    const m = doc.querySelector(sel)
    if (!m || m.closest('details.tm-cita')) continue
    let inicio: Element = m
    const prev = m.previousElementSibling
    if (prev?.tagName === 'HR') inicio = prev
    const nodos: Node[] = []
    for (let n: Node | null = inicio; n; n = n.nextSibling) nodos.push(n)
    envolver(nodos)
  }

  // Outlook de escritorio no marca nada: un bloque «De: … Enviado el: …» y debajo la cita.
  if (!doc.querySelector('details.tm-cita')) {
    const cabecera = Array.from(doc.body.querySelectorAll('p, div')).find((el) => {
      const t = (el.textContent ?? '').trim().slice(0, 400)
      return /^(De|From)\s*:\s*\S/.test(t) && /(Enviado( el)?|Sent|Fecha|Date)\s*:/.test(t) && el.querySelectorAll('p, div').length < 12
    })
    if (cabecera) {
      // Si va dentro del típico div con borde superior, se empieza por ese div (y la raya de antes).
      let inicio: Element = cabecera
      const padre = cabecera.parentElement
      if (padre && padre !== doc.body && /border-top/i.test(padre.getAttribute('style') ?? '')) inicio = padre
      if (inicio.previousElementSibling?.tagName === 'HR') inicio = inicio.previousElementSibling
      const nodos: Node[] = []
      for (let n: Node | null = inicio; n; n = n.nextSibling) nodos.push(n)
      // Lo que va detrás en los niveles de arriba también es cita.
      for (let a: Element | null = inicio.parentElement; a && a !== doc.body; a = a.parentElement) {
        for (let n: Node | null = a.nextSibling; n; n = n.nextSibling) nodos.push(n)
      }
      envolver(nodos)
    }
  }

  for (const el of Array.from(doc.querySelectorAll(ELEMENTOS_CITA))) {
    if (el.closest('details.tm-cita')) continue
    // Mail de macOS mete el texto propio en un blockquote «cite» sin borde al compartir o pegar
    // contenido (Apple-Mail-URLShareWrapperClass): no es una cita.
    if (el.closest('.Apple-Mail-URLShareWrapperClass') || /border-left-style:\s*none/i.test(el.getAttribute('style') ?? '')) continue
    // Gmail pone «El … escribió:» en .gmail_attr dentro de la cita: se queda dentro también.
    envolver([el])
  }

  // Outlook deja varios párrafos vacíos antes de la cita: fuera, que solo ocupan sitio.
  for (const det of Array.from(doc.querySelectorAll('details.tm-cita'))) {
    let prev = det.previousElementSibling
    while (prev && /^(P|DIV|BR)$/.test(prev.tagName) && !prev.textContent?.replace(/\u00a0/g, '').trim() && !prev.querySelector('img')) {
      const quitar = prev
      prev = prev.previousElementSibling
      quitar.remove()
    }
  }

  // Si fuera de las citas no queda nada que leer, el mensaje entero es la «cita»: se enseña sin plegar.
  const visible = (raiz: Element) => {
    const copia = raiz.cloneNode(true) as Element
    copia.querySelectorAll('details.tm-cita, style, title').forEach((x) => x.remove())
    return !!copia.textContent?.replace(/[\s\u00a0\u200b-\u200d]/g, '') || !!copia.querySelector('img')
  }
  if (doc.querySelector('details.tm-cita') && !visible(doc.body)) {
    for (const det of Array.from(doc.querySelectorAll('details.tm-cita'))) {
      if (det.parentElement?.closest('details.tm-cita')) continue
      det.querySelector(':scope > summary')?.remove()
      det.replaceWith(...Array.from(det.childNodes))
      if (visible(doc.body)) break
    }
  }

  return '<!doctype html>' + doc.documentElement.outerHTML
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const enlazar = (s: string) =>
  s.replace(/\bhttps?:\/\/[^\s<>"')\]]+/g, (u) => `<a href="${u}" target="_blank" rel="noreferrer">${u}</a>`)

const INICIO_CITA = /^(El .{3,200} escribi[óo]:|On .{3,200} wrote:|-{2,}\s*(Original Message|Mensaje original)\s*-{2,}|-{3,}\s*Forwarded message\s*-{3,}|De:\s.+|From:\s.+)$/i

/** Separa lo escrito en un correo de texto plano de lo que cita (desde «El … escribió:», «>»…). */
export function separarCita(texto: string): { propio: string; cita: string } {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n')
  let corte = lineas.findIndex((l, i) => {
    const t = l.trim()
    if (INICIO_CITA.test(t)) {
      // «De:» solo cuenta si va seguido de las otras cabeceras de Outlook.
      if (/^(De|From):/i.test(t)) return /^(Enviado|Sent|Para|To|Fecha|Date):/i.test(lineas[i + 1]?.trim() ?? '')
      return true
    }
    return t.startsWith('>') && lineas.slice(i).filter((x) => x.trim()).every((x) => x.trim().startsWith('>'))
  })
  if (corte <= 0) corte = corte === 0 ? 0 : lineas.length
  return { propio: lineas.slice(0, corte).join('\n').replace(/\s+$/, ''), cita: lineas.slice(corte).join('\n') }
}

/** Texto plano → HTML seguro, con enlaces y la cita plegada. */
export function textoAHtml(texto: string): { html: string; tieneCita: boolean } {
  const { propio, cita } = separarCita(texto)
  const html = enlazar(escapar(propio))
  if (!cita.trim()) return { html, tieneCita: false }
  // Sin texto propio (todo el mensaje es cita): se enseña tal cual, sin plegar.
  if (!propio.trim()) return { html: `<div class="tm-cita-texto">${enlazar(escapar(cita.replace(/^> ?/gm, '')))}</div>`, tieneCita: true }
  const citaHtml = enlazar(escapar(cita.replace(/^> ?/gm, '')))
  return { html: `${html}<details class="tm-cita">${resumen()}<div class="tm-cita-texto">${citaHtml}</div></details>`, tieneCita: true }
}

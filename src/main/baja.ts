// Darse de baja de boletines: cabeceras List-Unsubscribe (RFC 2369), baja de un clic (RFC 8058) y List-Id.

export interface InfoBaja {
  web: string[] // enlaces https
  correo: string | null // mailto:
  unClic: boolean // List-Unsubscribe-Post: List-Unsubscribe=One-Click
}

export const CABECERAS_BAJA = ['list-unsubscribe', 'list-unsubscribe-post', 'list-id']

/** Cabeceras en bruto → nombre (minúsculas) → valor, con las líneas plegadas unidas. */
export function leerCabeceras(bruto: Buffer | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!bruto) return out
  const texto = bruto.toString('utf8').replace(/\r?\n[ \t]+/g, ' ')
  for (const linea of texto.split(/\r?\n/)) {
    const i = linea.indexOf(':')
    if (i <= 0) continue
    const nombre = linea.slice(0, i).trim().toLowerCase()
    out[nombre] = out[nombre] ? `${out[nombre]}, ${linea.slice(i + 1).trim()}` : linea.slice(i + 1).trim()
  }
  return out
}

/** JSON con cómo darse de baja, o '' si el correo no lo ofrece. */
export function infoBaja(c: Record<string, string>): string {
  const lu = c['list-unsubscribe']
  if (!lu) return ''
  const enlaces = [...lu.matchAll(/<\s*([^>]+?)\s*>/g)].map((m) => m[1])
  const web = enlaces.filter((u) => /^https:\/\//i.test(u))
  const correo = enlaces.find((u) => /^mailto:/i.test(u)) ?? null
  if (!web.length && !correo) return ''
  const info: InfoBaja = { web, correo, unClic: /list-unsubscribe\s*=\s*one-click/i.test(c['list-unsubscribe-post'] ?? '') && web.length > 0 }
  return JSON.stringify(info)
}

/** List-Id: «Boletín de Ejemplo <boletin.ejemplo.com>» → «boletin.ejemplo.com» */
export function listaId(c: Record<string, string>): string | null {
  const v = c['list-id']
  if (!v) return null
  return (v.match(/<([^>]+)>/)?.[1] ?? v).trim().toLowerCase().slice(0, 200) || null
}

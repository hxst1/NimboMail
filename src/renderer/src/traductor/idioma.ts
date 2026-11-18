// ¿Está en inglés? Heurística de palabras frecuentes, sin dependencias. Basta para decidir si se
// ofrece «Traducir»: los correos en inglés están llenos de «the», «you», «to»…

const INGLES = new Set(
  `the and you to of is that it for on with this have be are your we will as at from if not can or by
   about would please thanks thank hi hello our was were has had been just do does let me know any
   could should there their they what when which who how also more all here get see us i'm i'll it's
   don't we're you're best regards kind`.split(/\s+/),
)
const ESPANOL = new Set(
  `el la de que y en los las un una por con para es no se lo al del su como más pero gracias hola sus
   muy este esta estos esas ese eso le les nos ya si sí también porque cuando hay está están ser son
   fue saludos un abrazo te tu tus mi mis puedes podemos quedo atento`.split(/\s+/),
)

export function esIngles(texto: string | null | undefined): boolean {
  if (!texto) return false
  const palabras = texto.toLowerCase().match(/[a-záéíóúñü']+/g)?.slice(0, 600) ?? []
  if (palabras.length < 6) return false
  let en = 0
  let es = 0
  for (const p of palabras) {
    if (INGLES.has(p)) en++
    if (ESPANOL.has(p)) es++
  }
  return en >= 4 && en > es * 2 && en / palabras.length > 0.08
}

/** Texto plano de un HTML (para decidir el idioma), sin estilos ni lo citado. */
export function textoDeHtml(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')
    .replace(/<div[^>]+gmail_quote[\s\S]*$/i, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .slice(0, 6000)
}

const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const diaSemana = new Intl.DateTimeFormat('es-ES', { weekday: 'long' })
const corta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'numeric', year: '2-digit' })
const larga = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function inicioDia(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Como Mail: «09:41», «Ayer», «lunes» esta semana, y si no «12/11/26». */
export function fechaLista(ms: number): string {
  const dias = Math.round((inicioDia(Date.now()) - inicioDia(ms)) / 86_400_000)
  if (dias <= 0) return hora.format(ms)
  if (dias === 1) return 'Ayer'
  if (dias < 7) return mayus(diaSemana.format(ms))
  return corta.format(ms)
}

export const fechaLarga = (ms: number) => mayus(larga.format(ms))

export function iniciales(nombre: string): string {
  const partes = nombre.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`
}

export const miles = (n: number) => n.toLocaleString('es-ES')

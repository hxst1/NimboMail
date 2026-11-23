import { opcionesHora } from '@shared/i18n'
import { locale, t } from '@/i18n'

// Formateadores por locale (crearlos cuesta): se rehacen solo si cambia el idioma.
let localeFormatos = ''
let f: { hora: Intl.DateTimeFormat; diaSemana: Intl.DateTimeFormat; corta: Intl.DateTimeFormat; larga: Intl.DateTimeFormat }
function formatos() {
  const l = locale()
  if (l !== localeFormatos) {
    localeFormatos = l
    f = {
      hora: new Intl.DateTimeFormat(l, opcionesHora(l)),
      diaSemana: new Intl.DateTimeFormat(l, { weekday: 'long' }),
      corta: new Intl.DateTimeFormat(l, { day: 'numeric', month: 'numeric', year: '2-digit' }),
      larga: new Intl.DateTimeFormat(l, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...opcionesHora(l) }),
    }
  }
  return f
}

function inicioDia(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Como Mail: «09:41», «Ayer», «lunes» esta semana, y si no «12/11/26». */
export function fechaLista(ms: number): string {
  const dias = Math.round((inicioDia(Date.now()) - inicioDia(ms)) / 86_400_000)
  if (dias <= 0) return formatos().hora.format(ms)
  if (dias === 1) return t().comun.ayer
  if (dias < 7) return mayus(formatos().diaSemana.format(ms))
  return formatos().corta.format(ms)
}

export const fechaLarga = (ms: number) => mayus(formatos().larga.format(ms))

export function iniciales(nombre: string): string {
  const partes = nombre.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(bytes / 1024 ** 2)} MB`
}

export const miles = (n: number) => n.toLocaleString(locale())

// Idiomas de la interfaz. El inglés es el principal: es la referencia de los textos (en/) y el idioma
// por defecto. Cada idioma es un objeto con la misma forma que el inglés (TypeScript avisa si falta
// algo): cadenas, o funciones cuando el texto lleva datos (nombres, números, plurales).
import { en } from './en'
import { es } from './es'

export type Idioma = 'en' | 'es'
export type PreferenciaIdioma = 'auto' | Idioma
export type Textos = typeof en

/** Para el desplegable de Ajustes: cada idioma con su propio nombre. */
export const IDIOMAS: { id: Idioma; nombre: string }[] = [
  { id: 'en', nombre: 'English' },
  { id: 'es', nombre: 'Español' },
]

const TEXTOS: Record<Idioma, Textos> = { en, es }
export const textos = (idioma: Idioma): Textos => TEXTOS[idioma]

/** Lo que el principal le pasa a la interfaz (al arrancar y cada vez que cambia). */
export type EstadoIdioma = { preferencia: PreferenciaIdioma; idioma: Idioma; locale: string }

export const esPreferencia = (v: unknown): v is PreferenciaIdioma => v === 'auto' || v === 'en' || v === 'es'

/** «es_ES.UTF-8» → «es-ES»; null si no hay nada útil («C», «POSIX»…). */
export function normalizarLocale(valor: string | undefined | null): string | null {
  const base = valor?.split(/[.@]/)[0]?.replace('_', '-')
  return base && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/i.test(base) ? base : null
}

/** «Automático»: el idioma del sistema si la app lo tiene; si no, inglés. */
export function resolverIdioma(preferencia: PreferenciaIdioma, localeSistema: string | null): Idioma {
  if (preferencia !== 'auto') return preferencia
  const base = localeSistema?.slice(0, 2).toLowerCase()
  return IDIOMAS.some((i) => i.id === base) ? (base as Idioma) : 'en'
}

/**
 * Locale para fechas y números: el del sistema si es del mismo idioma (en-GB, es-MX…), para respetar
 * sus costumbres; si no, el habitual de ese idioma.
 */
export function localeDe(idioma: Idioma, localeSistema: string | null): string {
  if (localeSistema?.toLowerCase().startsWith(idioma + '-')) return localeSistema
  return idioma === 'es' ? 'es-ES' : 'en-US'
}

/**
 * Opciones de hora para Intl: «9:41 AM» donde se usa el reloj de 12 horas (sin cero delante, como
 * hace todo el mundo) y «09:41» donde se usa el de 24.
 */
export function opcionesHora(locale: string): Intl.DateTimeFormatOptions {
  const ciclo = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle
  return { hour: ciclo === 'h11' || ciclo === 'h12' ? 'numeric' : '2-digit', minute: '2-digit' }
}

// Idioma de la app en el proceso principal: la preferencia se guarda en preferencias.json (junto a
// los datos) porque la necesita el principal antes de abrir ninguna ventana (formato de fechas de
// Chromium, menú de la bandeja, notificaciones, textos de los correos que se envían…).
import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  esPreferencia, localeDe, normalizarLocale, resolverIdioma, textos, type EstadoIdioma, type Idioma, type PreferenciaIdioma, type Textos,
} from '@shared/i18n'

let ruta: string | null = null
let preferencia: PreferenciaIdioma = 'auto'
let estado: EstadoIdioma = calcular()
let actuales: Textos = textos(estado.idioma)

/** Avisa con 'cambio' (EstadoIdioma) cuando el usuario elige otro idioma en Ajustes. */
export const idiomas = new EventEmitter()

/** El locale del sistema (LC_ALL > LC_MESSAGES > LANG), normalizado: «es_ES.UTF-8» → «es-ES». */
function localeSistema(): string | null {
  const e = process.env
  return normalizarLocale(e.LC_ALL) ?? normalizarLocale(e.LC_MESSAGES) ?? normalizarLocale(e.LANG)
}

function calcular(): EstadoIdioma {
  const sistema = localeSistema()
  // NIMBOMAIL_IDIOMA=en|es fuerza el idioma (capturas, pruebas) sin tocar la preferencia guardada.
  const forzado = process.env.NIMBOMAIL_IDIOMA
  const idioma: Idioma = forzado === 'en' || forzado === 'es' ? forzado : resolverIdioma(preferencia, sistema)
  return { preferencia, idioma, locale: localeDe(idioma, sistema) }
}

/** Lee la preferencia guardada. Se llama una vez al arrancar, con la carpeta de datos ya decidida. */
export function iniciarIdioma(dirDatos: string) {
  ruta = join(dirDatos, 'preferencias.json')
  try {
    const p = (JSON.parse(readFileSync(ruta, 'utf8')) as { idioma?: unknown }).idioma
    if (esPreferencia(p)) preferencia = p
  } catch {
    /* sin archivo o ilegible: automático */
  }
  estado = calcular()
  actuales = textos(estado.idioma)
}

export const estadoIdioma = (): EstadoIdioma => estado
/** Los textos del idioma actual. Se llama en el momento de usarlos (el idioma puede cambiar en marcha). */
export const t = (): Textos => actuales

export function ponerIdioma(p: PreferenciaIdioma): EstadoIdioma {
  if (!esPreferencia(p)) throw new Error('Idioma desconocido')
  preferencia = p
  if (ruta) {
    let datos: Record<string, unknown> = {}
    try {
      datos = JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>
    } catch {}
    datos.idioma = p
    mkdirSync(join(ruta, '..'), { recursive: true })
    writeFileSync(ruta + '.tmp', JSON.stringify(datos, null, 2) + '\n')
    renameSync(ruta + '.tmp', ruta)
  }
  estado = calcular()
  actuales = textos(estado.idioma)
  idiomas.emit('cambio', estado)
  return estado
}

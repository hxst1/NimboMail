// Copia de la configuración de NimboMail en un archivo JSON (Ajustes → Copia de seguridad): cuentas
// (sin contraseñas), idioma, preferencias de la interfaz y calendarios (con los enlaces de los suscritos).
// Sirve para llevársela a otro equipo o recuperarla tras borrar ~/.config/nimbomail. El correo no va:
// se vuelve a descargar del servidor.
import { readFile, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { esPreferencia } from '@shared/i18n'
import type { Servicio } from './servicio'
import { cambiarPreferencias, interfaz, leerPreferencias } from './preferencias'
import { ponerIdioma, t } from './idioma'

const FORMATO = 1

export interface ResumenImportacion {
  cuentas: number // cuentas añadidas
  calendarios: number // suscripciones añadidas
}

export async function exportar(servicio: Servicio, ruta: string) {
  const copia = {
    app: 'nimbomail',
    formato: FORMATO,
    version: app.getVersion(),
    fecha: new Date().toISOString(),
    idioma: leerPreferencias().idioma ?? 'auto',
    interfaz: interfaz(),
    ...(await servicio.copiaConfiguracion()),
  }
  // Lleva los enlaces de los calendarios suscritos (pueden ser privados): solo lo lee el usuario.
  await writeFile(ruta, JSON.stringify(copia, null, 2) + '\n', { mode: 0o600 })
}

export async function importar(servicio: Servicio, ruta: string): Promise<ResumenImportacion> {
  let copia: Record<string, unknown>
  try {
    copia = JSON.parse(await readFile(ruta, 'utf8')) as Record<string, unknown>
  } catch {
    throw new Error(t().principal.configuracion.ilegible)
  }
  if (!copia || typeof copia !== 'object' || copia.app !== 'nimbomail') throw new Error(t().principal.configuracion.noEsCopia)
  if (typeof copia.formato !== 'number' || copia.formato > FORMATO) throw new Error(t().principal.configuracion.masNueva)

  if (copia.interfaz && typeof copia.interfaz === 'object' && !Array.isArray(copia.interfaz)) {
    const nuevas = Object.fromEntries(
      Object.entries(copia.interfaz as Record<string, unknown>).filter(([k, v]) => typeof v === 'string' && /^[a-zA-Z]{1,40}$/.test(k)),
    ) as Record<string, string>
    cambiarPreferencias((p) => {
      p.interfaz = { ...interfaz(), ...nuevas }
    })
  }
  const resumen = await servicio.restaurarConfiguracion({ cuentas: copia.cuentas, calendario: copia.calendario })
  if (esPreferencia(copia.idioma)) ponerIdioma(copia.idioma)
  return resumen
}

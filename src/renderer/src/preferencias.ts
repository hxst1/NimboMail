// Preferencias de la interfaz (acento, disposición, carpetas ocultas…). Se guardan en preferencias.json
// a través del principal, así sobreviven a reinstalar o actualizar la app y entran en la copia de
// configuración. Antes iban en localStorage: lo que haya allí se pasa al archivo la primera vez que se lee.
import { api } from '@/estado'

const guardadas: Record<string, string> = { ...(window.niebla?.interfaz ?? {}) }

export function leerPreferencia(clave: string): string | null {
  if (clave in guardadas) return guardadas[clave]
  try {
    const vieja = localStorage.getItem(clave)
    if (vieja !== null) {
      guardarPreferencia(clave, vieja)
      return vieja
    }
  } catch {
    /* sin almacenamiento */
  }
  return null
}

export function guardarPreferencia(clave: string, valor: string) {
  if (guardadas[clave] === valor) return
  guardadas[clave] = valor
  api.ponerInterfaz(clave, valor).catch(() => {})
}

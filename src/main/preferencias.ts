// Preferencias de NimboMail en ~/.config/nimbomail/preferencias.json: el idioma y lo que se elige en la
// interfaz (acento, disposición, carpetas ocultas…). Un archivo normal junto a cuentas.toml, en vez del
// localStorage de Chromium: sobrevive a reinstalar y actualizar la app y entra en la copia de configuración.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface Preferencias {
  idioma?: unknown
  interfaz?: Record<string, string>
  [clave: string]: unknown
}

let ruta: string | null = null

/** Se llama una vez al arrancar, con la carpeta de datos ya decidida. */
export function iniciarPreferencias(dirDatos: string) {
  ruta = join(dirDatos, 'preferencias.json')
}

export function leerPreferencias(): Preferencias {
  if (!ruta) return {}
  try {
    const p = JSON.parse(readFileSync(ruta, 'utf8')) as unknown
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Preferencias) : {}
  } catch {
    return {} // sin archivo o ilegible
  }
}

/** Lee, cambia y vuelve a escribir el archivo entero (de forma atómica). */
export function cambiarPreferencias(fn: (p: Preferencias) => void) {
  if (!ruta) return
  const p = leerPreferencias()
  fn(p)
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta + '.tmp', JSON.stringify(p, null, 2) + '\n')
  renameSync(ruta + '.tmp', ruta)
}

/** Las preferencias de la interfaz (clave → texto), tal como las guarda el renderer. */
export function interfaz(): Record<string, string> {
  const i = leerPreferencias().interfaz
  if (!i || typeof i !== 'object') return {}
  return Object.fromEntries(Object.entries(i).filter(([, v]) => typeof v === 'string'))
}

export function ponerInterfaz(clave: string, valor: string) {
  if (typeof clave !== 'string' || typeof valor !== 'string' || !/^[a-zA-Z]{1,40}$/.test(clave)) return
  cambiarPreferencias((p) => {
    p.interfaz = { ...interfazDe(p), [clave]: valor }
  })
}

const interfazDe = (p: Preferencias) => (p.interfaz && typeof p.interfaz === 'object' ? p.interfaz : {})

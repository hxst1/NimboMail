// Idioma de la interfaz. Los componentes usan useT() (y se vuelven a pintar al cambiar de idioma);
// el código fuera de React (formato de fechas, citas…) usa t() y locale(), que dan los del momento.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { textos, type EstadoIdioma, type Textos } from '@shared/i18n'

let estado: EstadoIdioma = window.niebla.idioma
let actuales: Textos = textos(estado.idioma)
document.documentElement.lang = estado.idioma

/** Los textos del idioma actual, para código fuera de los componentes. */
export const t = (): Textos => actuales
/** Locale para fechas y números («en-US», «es-ES»…). */
export const locale = (): string => estado.locale

type Valor = { estado: EstadoIdioma; t: Textos }
const Contexto = createContext<Valor>({ estado, t: actuales })

export function ProveedorIdioma({ children }: { children: ReactNode }) {
  const [valor, setValor] = useState<Valor>({ estado, t: actuales })
  useEffect(
    () =>
      window.niebla.alIdioma((e) => {
        estado = e
        actuales = textos(e.idioma)
        document.documentElement.lang = e.idioma
        setValor({ estado: e, t: actuales })
      }),
    [],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** Los textos del idioma actual; el componente se vuelve a pintar si cambia. */
export const useT = (): Textos => useContext(Contexto).t
/** Preferencia, idioma y locale actuales (para Ajustes y para formatear fechas). */
export const useIdioma = (): EstadoIdioma => useContext(Contexto).estado

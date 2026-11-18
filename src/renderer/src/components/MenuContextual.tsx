import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CaretRight, Copy, Translate } from '@phosphor-icons/react'
import { api } from '@/estado'
import { traducirTexto } from '@/traductor'

export type ElementoMenu =
  | '-'
  | {
      etiqueta: string
      icono?: ReactNode
      atajo?: string
      accion?: () => unknown
      desactivado?: boolean
      peligro?: boolean
      submenu?: ElementoMenu[]
    }

export interface MenuAbierto {
  x: number
  y: number
  elementos: ElementoMenu[]
}

/** Lo que cualquier parte de la interfaz puede pedir a la ventana: menús, avisos, buscar, redactar… */
export interface Interfaz {
  abrirMenu: (m: MenuAbierto) => void
  traducirSeleccion: (x: number, y: number, texto: string) => void
  avisar: (texto: string) => void
  buscar: (texto: string) => void
  redactar: (o: OpcionesRedactar) => void
}

export type OpcionesRedactar =
  | { tipo: 'nuevo'; para?: { nombre: string; direccion: string }[]; cuenta?: string }
  | { tipo: 'responder' | 'responderTodos' | 'reenviar'; id: string; cita?: string }
  | { tipo: 'borrador'; id: string }

export const InterfazContexto = createContext<Interfaz>({
  abrirMenu: () => {},
  traducirSeleccion: () => {},
  avisar: () => {},
  buscar: () => {},
  redactar: () => {},
})
export const useInterfaz = () => useContext(InterfazContexto)

/** Coloca una capa flotante en (x, y) sin que se salga de la ventana. */
function usePosicion(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y, visible: false })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(6, Math.min(x, window.innerWidth - r.width - 6))
    const top = y + r.height > window.innerHeight - 6 ? Math.max(6, y - r.height) : y
    setPos({ left, top, visible: true })
  }, [x, y])
  return { ref, estilo: { left: pos.left, top: pos.top, visibility: pos.visible ? ('visible' as const) : ('hidden' as const) } }
}

function Lista({ elementos, onCerrar }: { elementos: ElementoMenu[]; onCerrar: () => void }) {
  const [abierto, setAbierto] = useState<number | null>(null)
  return (
    <>
      {elementos.map((e, i) =>
        e === '-' ? (
          <div key={i} className="menu-separador" />
        ) : (
          <div
            key={i}
            className={`menu-fila${e.desactivado ? ' desactivado' : ''}${e.peligro ? ' peligro' : ''}${abierto === i ? ' abierta' : ''}`}
            onMouseEnter={() => setAbierto(e.submenu ? i : null)}
            onClick={() => {
              if (e.desactivado || e.submenu) return
              onCerrar()
              Promise.resolve(e.accion?.()).catch(() => {})
            }}
          >
            <span className="menu-icono">{e.icono}</span>
            <span className="menu-etiqueta">{e.etiqueta}</span>
            {e.atajo && <kbd>{e.atajo}</kbd>}
            {e.submenu && <CaretRight size={11} weight="bold" className="menu-flecha" />}
            {e.submenu && abierto === i && (
              <div className="menu-contextual submenu">
                <Lista elementos={e.submenu} onCerrar={onCerrar} />
              </div>
            )}
          </div>
        ),
      )}
    </>
  )
}

export function MenuContextual({ menu, onCerrar }: { menu: MenuAbierto; onCerrar: () => void }) {
  const { ref, estilo } = usePosicion(menu.x, menu.y)
  useCierre(ref, onCerrar)
  return (
    <div ref={ref} className="menu-contextual" style={estilo} onContextMenu={(e) => e.preventDefault()}>
      <Lista elementos={menu.elementos} onCerrar={onCerrar} />
    </div>
  )
}

/** Se cierra con Esc, con un clic fuera, al desplazar o al perder el foco la ventana. */
function useCierre(ref: React.RefObject<HTMLDivElement | null>, onCerrar: () => void) {
  useEffect(() => {
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onCerrar()
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('mousedown', fuera, true)
    window.addEventListener('keydown', tecla, true)
    window.addEventListener('blur', onCerrar)
    window.addEventListener('wheel', onCerrar, { passive: true })
    return () => {
      window.removeEventListener('mousedown', fuera, true)
      window.removeEventListener('keydown', tecla, true)
      window.removeEventListener('blur', onCerrar)
      window.removeEventListener('wheel', onCerrar)
    }
  }, [ref, onCerrar])
}

/** Burbuja con la traducción de una selección, con «Copiar». */
export function BurbujaTraduccion({ x, y, texto, onCerrar }: { x: number; y: number; texto: string; onCerrar: () => void }) {
  const { ref, estilo } = usePosicion(x, y)
  const [traduccion, setTraduccion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  useCierre(ref, onCerrar)
  useEffect(() => {
    let vivo = true
    traducirTexto(texto).then(
      (t) => vivo && setTraduccion(t),
      (e: Error) => vivo && setError(e.message),
    )
    return () => {
      vivo = false
    }
  }, [texto])
  return (
    <div ref={ref} className="burbuja-traduccion" style={estilo}>
      <div className="burbuja-cabeza">
        <Translate size={14} /> Inglés → español
      </div>
      <div className={`burbuja-texto${traduccion ? '' : ' cargando'}`}>
        {error ? `No se pudo traducir: ${error}` : (traduccion ?? 'Traduciendo…')}
      </div>
      {traduccion && (
        <button
          className="burbuja-copiar"
          onClick={() => {
            api.copiarTexto(traduccion)
            setCopiado(true)
            setTimeout(onCerrar, 700)
          }}
        >
          <Copy size={13} /> {copiado ? 'Copiado' : 'Copiar'}
        </button>
      )}
    </div>
  )
}

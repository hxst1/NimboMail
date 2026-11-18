import { useEffect, useRef, useState } from 'react'
import {
  ArrowClockwise,
  Archive,
  ArrowBendDoubleUpLeft,
  ArrowBendUpLeft,
  ArrowBendUpRight,
  CaretDown,
  Columns,
  DotsThree,
  Flag,
  FolderSimple,
  FunnelSimple,
  MagnifyingGlass,
  NotePencil,
  Prohibit,
  Rows,
  SidebarSimple,
  Trash,
  X,
  type Icon,
} from '@phosphor-icons/react'

export type Disposicion = 'columnas' | 'ancha'

interface Props {
  titulo: string
  subtitulo: string
  haySeleccion: boolean
  marcado: boolean
  filtroNoLeidos: boolean
  disposicion: Disposicion
  barraOculta: boolean
  actualizando: boolean
  busqueda: string
  enfocarBusqueda: number // cambia para pedir el foco (Ctrl+F)
  onBuscar: (t: string) => void
  onMostrarBarra: () => void
  onAccion: (a: AccionBarra) => void
}

export type AccionBarra =
  | 'filtro'
  | 'redactar'
  | 'responder'
  | 'responderTodos'
  | 'reenviar'
  | 'archivar'
  | 'papelera'
  | 'spam'
  | 'mover'
  | 'marcar'
  | 'disposicion'
  | 'mas'
  | 'actualizar'

function Boton(p: { icono: Icon; titulo: string; onClick: () => void; activo?: boolean; disabled?: boolean; peso?: 'regular' | 'fill'; clase?: string; caret?: boolean }) {
  const Ico = p.icono
  return (
    <button
      className={`tb-boton${p.activo ? ' activo' : ''}${p.clase ? ` ${p.clase}` : ''}${p.caret ? ' con-caret' : ''}`}
      title={p.titulo}
      disabled={p.disabled}
      onClick={p.onClick}
    >
      <Ico size={19} weight={p.peso ?? 'regular'} />
      {p.caret && <CaretDown size={10} weight="bold" className="tb-caret" />}
    </button>
  )
}

export function Toolbar(p: Props) {
  const [buscando, setBuscando] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const sin = !p.haySeleccion

  useEffect(() => {
    if (p.enfocarBusqueda) {
      setBuscando(true)
      requestAnimationFrame(() => campo.current?.focus())
    }
  }, [p.enfocarBusqueda])

  return (
    <header className="toolbar">
      {p.barraOculta && (
        <button className="boton-icono" title="Mostrar barra lateral" onClick={p.onMostrarBarra}>
          <SidebarSimple size={18} />
        </button>
      )}
      <div className="tb-titulo">
        <div className="tb-nombre">{p.titulo}</div>
        <div className="tb-sub">{p.subtitulo}</div>
      </div>

      <div className="tb-grupos">
        <div className="capsula">
          <Boton icono={FunnelSimple} titulo="Solo no leídos" activo={p.filtroNoLeidos} onClick={() => p.onAccion('filtro')} />
          <Boton
            icono={p.disposicion === 'columnas' ? Rows : Columns}
            titulo={p.disposicion === 'columnas' ? 'Lista ancha' : 'Lista y mensaje en columnas'}
            onClick={() => p.onAccion('disposicion')}
          />
          <Boton icono={DotsThree} titulo="Más" onClick={() => p.onAccion('mas')} />
        </div>

        <div className="capsula">
          <Boton
            icono={ArrowClockwise}
            titulo={p.actualizando ? 'Buscando correo nuevo…' : 'Obtener correo nuevo (F5)'}
            clase={p.actualizando ? 'girando' : undefined}
            onClick={() => p.onAccion('actualizar')}
          />
          <Boton icono={NotePencil} titulo="Redactar (Ctrl+N)" onClick={() => p.onAccion('redactar')} />
        </div>

        <div className="capsula">
          <Boton icono={ArrowBendUpLeft} titulo="Responder (Ctrl+R)" disabled={sin} onClick={() => p.onAccion('responder')} />
          <Boton icono={ArrowBendDoubleUpLeft} titulo="Responder a todos (Ctrl+Shift+R)" disabled={sin} onClick={() => p.onAccion('responderTodos')} />
          <Boton icono={ArrowBendUpRight} titulo="Reenviar (Ctrl+Shift+F)" disabled={sin} onClick={() => p.onAccion('reenviar')} />
        </div>

        <div className="capsula">
          <Boton icono={Archive} titulo="Archivar (Ctrl+Shift+A)" disabled={sin} onClick={() => p.onAccion('archivar')} />
          <Boton icono={Trash} titulo="Papelera (Supr)" disabled={sin} onClick={() => p.onAccion('papelera')} />
          <Boton icono={Prohibit} titulo="Spam (Ctrl+Shift+J)" disabled={sin} onClick={() => p.onAccion('spam')} />
        </div>

        <div className="capsula">
          <Boton icono={FolderSimple} titulo="Mover a…" disabled={sin} caret onClick={() => p.onAccion('mover')} />
        </div>

        <div className="capsula">
          <Boton
            icono={Flag}
            titulo="Marcar (Ctrl+Shift+L)"
            disabled={sin}
            peso={p.marcado ? 'fill' : 'regular'}
            clase={p.marcado ? 'bandera' : ''}
            caret
            onClick={() => p.onAccion('marcar')}
          />
        </div>

        {buscando ? (
          <div className="capsula buscador">
            <MagnifyingGlass size={16} className="buscador-lupa" />
            <input
              ref={campo}
              value={p.busqueda}
              placeholder="Buscar"
              onChange={(e) => p.onBuscar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  p.onBuscar('')
                  setBuscando(false)
                }
              }}
            />
            <button
              className="buscador-cerrar"
              title="Cerrar búsqueda"
              onClick={() => {
                p.onBuscar('')
                setBuscando(false)
              }}
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        ) : (
          <div className="capsula">
            <Boton icono={MagnifyingGlass} titulo="Buscar (Ctrl+F)" onClick={() => {
              setBuscando(true)
              requestAnimationFrame(() => campo.current?.focus())
            }} />
          </div>
        )}
      </div>
    </header>
  )
}

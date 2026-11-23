import { memo, useEffect, useRef } from 'react'
import { VList, type VListHandle } from 'virtua'
import { ArrowBendUpLeft, CaretCircleRight, Flag, Paperclip } from '@phosphor-icons/react'
import type { Mensaje } from '@shared/tipos'
import { fechaLista } from '@/formato'
import { useT } from '@/i18n'

interface Props {
  mensajes: Mensaje[]
  seleccion: string | null
  ancha: boolean
  onSeleccionar: (id: string) => void
  onAbrir: (id: string) => void
  onMenu: (m: Mensaje, x: number, y: number) => void
}

/**
 * Lista virtualizada: solo están en el DOM las filas que se ven (y unas pocas de margen), así
 * que da igual tener 1.000 conversaciones que 50.000.
 */
export function MessageList({ mensajes, seleccion, ancha, onSeleccionar, onAbrir, onMenu }: Props) {
  const t = useT()
  const lista = useRef<VListHandle>(null)

  // La fila seleccionada siempre a la vista al moverse con el teclado.
  useEffect(() => {
    if (!seleccion) return
    const i = mensajes.findIndex((m) => m.id === seleccion)
    if (i >= 0) lista.current?.scrollToIndex(i, { align: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion])

  if (!mensajes.length) {
    return (
      <div className="lista vacia">
        <div className="vacia-texto">{t.lista.sinMensajes}</div>
      </div>
    )
  }

  return (
    <VList ref={lista} className={`lista${ancha ? ' ancha' : ''}`} data={mensajes} bufferSize={400}>
      {(m, i) => {
        const activo = m.id === seleccion
        // Separador fino entre filas, salvo en la primera y alrededor de la seleccionada.
        const sep = i > 0 && !activo && mensajes[i - 1]?.id !== seleccion
        return <Fila key={m.id} m={m} activo={activo} sep={sep} onSeleccionar={onSeleccionar} onAbrir={onAbrir} onMenu={onMenu} />
      }}
    </VList>
  )
}

const Fila = memo(function Fila({
  m,
  activo,
  sep,
  onSeleccionar,
  onAbrir,
  onMenu,
}: {
  m: Mensaje
  activo: boolean
  sep: boolean
  onSeleccionar: (id: string) => void
  onAbrir: (id: string) => void
  onMenu: (m: Mensaje, x: number, y: number) => void
}) {
  const t = useT()
  return (
    <div
      data-id={m.id}
      className={`fila${activo ? ' activa' : ''}${sep ? ' sep' : ''}${m.leido ? '' : ' no-leida'}`}
      onMouseDown={() => onSeleccionar(m.id)}
      onDoubleClick={() => onAbrir(m.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(m, e.clientX, e.clientY)
      }}
    >
      <div className="fila-margen">
        {!m.leido && <span className="punto" />}
        {m.leido && m.respondido && <ArrowBendUpLeft size={12} weight="bold" className="respondido" />}
      </div>
      <div className="fila-cuerpo">
        <div className="fila-linea">
          <span className="fila-de">{m.de.nombre || m.de.direccion}</span>
          <span className="fila-fecha">{fechaLista(m.fecha)}</span>
        </div>
        <div className="fila-linea">
          <span className="fila-asunto">{m.asunto || t.lista.sinAsunto}</span>
          <span className="fila-iconos">
            {m.marcado && <Flag size={12} weight="fill" className="bandera" />}
            {m.adjuntos > 0 && <Paperclip size={13} />}
            {m.enHilo > 1 && (
              <span className="hilo">
                {m.enHilo}
                <CaretCircleRight size={13} />
              </span>
            )}
          </span>
        </div>
        <div className="fila-vista">{m.vistaPrevia}</div>
      </div>
    </div>
  )
})

import { useRef } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'
import { useInterfaz } from '@/components/MenuContextual'

/**
 * Desplegable con el estilo de NimboMail (el <select> nativo sale con el aspecto del sistema): un botón
 * con el valor elegido que abre el menú de cristal, con una ✓ en la opción actual.
 */
export function Desplegable<T extends string | number>({
  valor,
  opciones,
  onCambiar,
  titulo,
  clase,
}: {
  valor: T
  opciones: { valor: T; texto: string }[]
  onCambiar: (v: T) => void
  titulo?: string
  clase?: string
}) {
  const ui = useInterfaz()
  const boton = useRef<HTMLButtonElement>(null)
  const actual = opciones.find((o) => o.valor === valor)
  return (
    <button
      ref={boton}
      type="button"
      className={`desplegable${clase ? ` ${clase}` : ''}`}
      title={titulo}
      onClick={() => {
        const r = boton.current!.getBoundingClientRect()
        ui.abrirMenu({
          x: r.left,
          y: r.bottom + 4,
          elementos: opciones.map((o) => ({
            etiqueta: o.texto,
            icono: o.valor === valor ? <Check size={14} weight="bold" /> : <span />,
            accion: () => onCambiar(o.valor),
          })),
        })
      }}
    >
      <span>{actual?.texto ?? ''}</span>
      <CaretDown size={11} weight="bold" />
    </button>
  )
}

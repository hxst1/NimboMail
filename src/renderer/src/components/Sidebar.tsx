import { useState, type ReactNode } from 'react'
import {
  Plus,
  Archive,
  CaretRight,
  File,
  Flag,
  Folder,
  GearSix,
  PaperPlaneTilt,
  Prohibit,
  SidebarSimple,
  Trash,
  Tray,
  type Icon,
} from '@phosphor-icons/react'
import type { Buzon, Carpeta, RolCarpeta } from '@shared/tipos'
import type { Correo } from '@/estado'

const iconoRol: Record<RolCarpeta, Icon> = {
  inbox: Tray,
  drafts: File,
  sent: PaperPlaneTilt,
  junk: Prohibit,
  trash: Trash,
  archive: Archive,
  all: Archive,
  normal: Folder,
}

// Orden de Mail dentro de cada cuenta.
const ordenRol: RolCarpeta[] = ['inbox', 'drafts', 'sent', 'junk', 'trash', 'archive', 'all', 'normal']

const mismoBuzon = (a: Buzon, b: Buzon) => JSON.stringify(a) === JSON.stringify(b)

interface Props {
  correo: Correo
  onOcultar: () => void
  onAnadirCuenta: () => void
  onMenuCuenta: (id: string, x: number, y: number) => void
  onArreglarCuenta: (id: string) => void // «Falta la contraseña» / sin conexión
}

export function Sidebar({ correo, onOcultar, onAnadirCuenta, onMenuCuenta, onArreglarCuenta }: Props) {
  const { datos, buzon, elegirBuzon, contar } = correo
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({ todas: true })

  function Item(p: {
    buzon: Buzon
    icono: Icon
    texto: string
    contador?: number
    nivel?: number
    desplegable?: string
  }) {
    const activo = mismoBuzon(buzon, p.buzon)
    const Ico = p.icono
    return (
      <div
        className={`sb-item${activo ? ' activo' : ''}`}
        style={{ paddingLeft: 10 + (p.nivel ?? 0) * 18 }}
        onClick={() => elegirBuzon(p.buzon)}
      >
        <span
          className={`sb-caret${p.desplegable ? '' : ' vacio'}${p.desplegable && abiertos[p.desplegable] ? ' abierto' : ''}`}
          onClick={(e) => {
            if (!p.desplegable) return
            e.stopPropagation()
            setAbiertos((a) => ({ ...a, [p.desplegable!]: !a[p.desplegable!] }))
          }}
        >
          <CaretRight size={10} weight="bold" />
        </span>
        <Ico className="sb-icono" size={18} weight="regular" />
        <span className="sb-texto">{p.texto}</span>
        {!!p.contador && <span className="sb-contador">{p.contador}</span>}
      </div>
    )
  }

  const Seccion = ({ titulo, children, cuenta }: { titulo: string; children: ReactNode; cuenta?: string }) => (
    <div className="sb-seccion">
      <div
        className="sb-titulo"
        onContextMenu={
          cuenta
            ? (e) => {
                e.preventDefault()
                onMenuCuenta(cuenta, e.clientX, e.clientY)
              }
            : undefined
        }
      >
        {titulo}
      </div>
      {children}
    </div>
  )

  const carpetasDe = (cuenta: string): Carpeta[] =>
    datos.carpetas
      .filter((c) => c.cuenta === cuenta)
      .sort((a, b) => ordenRol.indexOf(a.rol) - ordenRol.indexOf(b.rol) || a.nombre.localeCompare(b.nombre))

  return (
    <aside className="sidebar">
      <div className="sb-cabecera">
        <button className="boton-icono" title="Ocultar barra lateral" onClick={onOcultar}>
          <SidebarSimple size={18} />
        </button>
      </div>

      <div className="sb-scroll">
        <Seccion titulo="Favoritos">
          <Item
            buzon={{ tipo: 'todas', rol: 'inbox' }}
            icono={Tray}
            texto="Todas las bandejas"
            contador={contar({ tipo: 'todas', rol: 'inbox' })}
            desplegable="todas"
          />
          {abiertos.todas &&
            datos.cuentas.map((c) => {
              const inbox = datos.carpetas.find((f) => f.cuenta === c.id && f.rol === 'inbox')
              if (!inbox) return null
              const b: Buzon = { tipo: 'carpeta', carpeta: inbox.id }
              return <Item key={c.id} buzon={b} icono={Tray} texto={c.nombre} contador={contar(b)} nivel={1} />
            })}
          <Item
            buzon={{ tipo: 'marcados' }}
            icono={Flag}
            texto="Marcados"
            contador={contar({ tipo: 'marcados' }, false)}
          />
          <Item buzon={{ tipo: 'todas', rol: 'drafts' }} icono={File} texto="Todos los borradores" />
          <Item buzon={{ tipo: 'todas', rol: 'sent' }} icono={PaperPlaneTilt} texto="Todos los enviados" />
        </Seccion>

        <Seccion titulo="Buzones inteligentes">
          <Item buzon={{ tipo: 'hoy' }} icono={GearSix} texto="Hoy" contador={contar({ tipo: 'hoy' })} />
        </Seccion>

        {datos.cuentas.map((c) => (
          <Seccion key={c.id} titulo={c.nombre} cuenta={c.id}>
            {carpetasDe(c.id).map((f) => {
              const b: Buzon = { tipo: 'carpeta', carpeta: f.id }
              return (
                <Item
                  key={f.id}
                  buzon={b}
                  icono={iconoRol[f.rol]}
                  texto={f.nombre}
                  contador={f.rol === 'inbox' || f.rol === 'normal' ? contar(b) : undefined}
                />
              )
            })}
          </Seccion>
        ))}

        <button className="sb-anadir" onClick={onAnadirCuenta}>
          <Plus size={13} weight="bold" /> Añadir cuenta
        </button>
      </div>

      {datos.estados.some((e) => e.estado !== 'listo') && (
        <div className="sb-estado">
          {datos.estados
            .filter((e) => e.estado !== 'listo')
            .map((e) => {
              const nombre = datos.cuentas.find((c) => c.id === e.id)?.nombre ?? e.id
              const texto =
                e.estado === 'conectando' ? 'Conectando…' : e.estado === 'sin-clave' ? 'Falta la contraseña' : 'Sin conexión'
              return (
                <div
                  key={e.id}
                  className={`sb-estado-fila ${e.estado}${e.estado === 'conectando' ? '' : ' pulsable'}`}
                  title={e.estado === 'conectando' ? e.detalle : `${e.detalle ?? ''}\nPulsa para arreglarlo`}
                  onClick={e.estado === 'conectando' ? undefined : () => onArreglarCuenta(e.id)}
                >
                  <span className="sb-estado-punto" />
                  <b>{nombre}</b> · {texto}
                </div>
              )
            })}
        </div>
      )}
    </aside>
  )
}

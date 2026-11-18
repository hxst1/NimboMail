import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle, DotsThree, EnvelopeSimple, Globe, Lightning, MagnifyingGlass, Prohibit, Trash, X } from '@phosphor-icons/react'
import type { Suscripcion } from '@shared/tipos'
import { api } from '@/estado'
import { iniciales } from '@/formato'
import { useInterfaz } from '@/components/MenuContextual'

type Orden = 'total' | 'recientes' | 'sinLeer'

const METODOS: Record<Suscripcion['metodo'], { texto: string; ayuda: string }> = {
  'un-clic': { texto: 'Baja de un clic', ayuda: 'Se da de baja al momento, sin abrir ninguna web (RFC 8058).' },
  correo: { texto: 'Baja por correo', ayuda: 'TuxMail manda el correo de baja desde tu cuenta.' },
  web: { texto: 'Baja en su web', ayuda: 'Este remitente solo ofrece una página: se abrirá en el navegador.' },
}

function hace(ms: number): string {
  const dias = Math.floor((Date.now() - ms) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const anos = Math.floor(meses / 12)
  return `hace ${anos} ${anos === 1 ? 'año' : 'años'}`
}

const clave = (s: Suscripcion) => `${s.cuenta}|${s.clave}`

export function Suscripciones({ onCerrar, onVerCorreos }: { onCerrar: () => void; onVerCorreos: (direccion: string) => void }) {
  const ui = useInterfaz()
  const [lista, setLista] = useState<Suscripcion[]>([])
  const [cargado, setCargado] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<Orden>('total')
  const [ocultarDadas, setOcultarDadas] = useState(false)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState<Set<string>>(new Set())

  const cargar = useCallback(async () => {
    setLista(await api.suscripciones())
    setCargado(true)
  }, [])
  useEffect(() => {
    cargar()
    return window.niebla.alCambiar(() => cargar())
  }, [cargar])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const variasCuentas = new Set(lista.map((s) => s.cuenta)).size > 1 // la cuenta solo se enseña si hay varias

  const vistas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return lista
      .filter((s) => !q || `${s.nombre} ${s.direccion} ${s.clave}`.toLowerCase().includes(q))
      .filter((s) => !ocultarDadas || !s.bajaFecha)
      .sort((a, b) => (orden === 'recientes' ? b.ultima - a.ultima : orden === 'sinLeer' ? b.sinLeer - a.sinLeer : b.total - a.total))
  }, [lista, busqueda, orden, ocultarDadas])

  const conOcupado = async (k: string, fn: () => Promise<unknown>) => {
    setOcupado((o) => new Set(o).add(k))
    try {
      await fn()
    } finally {
      setOcupado((o) => {
        const n = new Set(o)
        n.delete(k)
        return n
      })
    }
  }

  const darDeBaja = (s: Suscripcion) =>
    conOcupado(clave(s), async () => {
      try {
        const m = await api.darseDeBaja(s.cuenta, s.clave)
        ui.avisar(
          m === 'web'
            ? `Se ha abierto la página de baja de ${s.nombre || s.direccion}`
            : `Baja pedida a ${s.nombre || s.direccion}${m === 'un-clic' ? '' : ' (por correo)'}`,
        )
      } catch (e) {
        ui.avisar(`No se pudo: ${(e as Error).message}`)
      }
    })

  const limpiar = (s: Suscripcion, destino: 'trash' | 'archive' | 'junk') =>
    conOcupado(clave(s), async () => {
      const n = await api.limpiarSuscripcion(s.cuenta, s.clave, destino)
      const donde = destino === 'trash' ? 'a la papelera' : destino === 'archive' ? 'al archivo' : 'a spam'
      ui.avisar(`${n} ${n === 1 ? 'correo movido' : 'correos movidos'} ${donde} · Ctrl+Z para deshacer`)
    })

  const menuFila = (s: Suscripcion, x: number, y: number) =>
    ui.abrirMenu({
      x,
      y,
      elementos: [
        { etiqueta: 'Ver sus correos', icono: <MagnifyingGlass size={15} />, accion: () => onVerCorreos(s.direccion) },
        '-',
        { etiqueta: `Mover sus ${s.aLaVista} correos a la papelera`, icono: <Trash size={15} />, desactivado: !s.aLaVista, accion: () => limpiar(s, 'trash') },
        { etiqueta: `Archivar sus ${s.aLaVista} correos`, icono: <Archive size={15} />, desactivado: !s.aLaVista, accion: () => limpiar(s, 'archive') },
        { etiqueta: 'Mandar todo a spam', icono: <Prohibit size={15} />, peligro: true, desactivado: !s.aLaVista, accion: () => limpiar(s, 'junk') },
      ],
    })

  const elegidasVistas = vistas.filter((s) => elegidas.has(clave(s)))
  const bajaElegidas = async () => {
    for (const s of elegidasVistas.filter((x) => !x.bajaFecha)) await darDeBaja(s)
    setElegidas(new Set())
  }
  const totalALaVista = lista.reduce((n, s) => n + s.aLaVista, 0)

  return (
    <section className="suscripciones">
      <header className="su-cabeza">
        <div>
          <h1>Suscripciones</h1>
          <div className="su-sub">
            {cargado
              ? `${lista.length} ${lista.length === 1 ? 'remitente' : 'remitentes'} con boletines · ${totalALaVista} correos suyos a la vista`
              : 'Buscando boletines…'}
          </div>
        </div>
        <div className="su-buscar">
          <MagnifyingGlass size={14} />
          <input placeholder="Buscar remitente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <select className="aj-select" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
          <option value="total">Más correos</option>
          <option value="recientes">Más recientes</option>
          <option value="sinLeer">Más sin leer</option>
        </select>
        <label className="su-filtro">
          <input type="checkbox" checked={ocultarDadas} onChange={(e) => setOcultarDadas(e.target.checked)} /> Ocultar las dadas de baja
        </label>
        <button className="cal-boton" title="Volver al correo (Esc)" onClick={onCerrar}>
          <X size={17} />
        </button>
      </header>

      {elegidasVistas.length > 0 && (
        <div className="su-barra-seleccion">
          <span>
            {elegidasVistas.length} {elegidasVistas.length === 1 ? 'seleccionada' : 'seleccionadas'}
          </span>
          <button className="destacado" onClick={bajaElegidas}>
            Darse de baja de todas
          </button>
          <button onClick={async () => (await Promise.all(elegidasVistas.map((s) => limpiar(s, 'trash'))), setElegidas(new Set()))}>
            <Trash size={14} /> Sus correos a la papelera
          </button>
          <button onClick={() => setElegidas(new Set())}>Quitar selección</button>
        </div>
      )}

      <div className="su-lista">
        {cargado && !vistas.length && (
          <div className="su-vacio">
            {lista.length
              ? 'Nada con ese filtro.'
              : 'Todavía no hay boletines detectados. TuxMail lee la cabecera de baja de cada correo al sincronizar: si acabas de actualizar, puede tardar un poco.'}
          </div>
        )}
        {vistas.map((s) => {
          const k = clave(s)
          const m = METODOS[s.metodo]
          return (
            <div
              key={k}
              className={`su-fila${s.bajaFecha ? ' dada' : ''}${elegidas.has(k) ? ' elegida' : ''}`}
              onContextMenu={(e) => {
                e.preventDefault()
                menuFila(s, e.clientX, e.clientY)
              }}
            >
              <input
                type="checkbox"
                checked={elegidas.has(k)}
                onChange={(e) =>
                  setElegidas((x) => {
                    const n = new Set(x)
                    if (e.target.checked) n.add(k)
                    else n.delete(k)
                    return n
                  })
                }
              />
              <div className="avatar">{iniciales(s.nombre || s.direccion)}</div>
              <div className="su-datos">
                <div className="su-nombre">
                  {s.nombre || s.direccion}
                  {variasCuentas && <span className="su-cuenta">{s.cuenta}</span>}
                </div>
                <div className="su-dir">{s.direccion}</div>
                <div className="su-cifras">
                  <b>{s.total}</b> {s.total === 1 ? 'correo' : 'correos'}
                  {s.sinLeer > 0 && <> · {Math.round((s.sinLeer / s.total) * 100)} % sin leer</>} · último {hace(s.ultima)}
                </div>
              </div>
              <span className={`su-metodo ${s.metodo}`} title={m.ayuda}>
                {s.metodo === 'un-clic' ? <Lightning size={12} weight="fill" /> : s.metodo === 'correo' ? <EnvelopeSimple size={12} /> : <Globe size={12} />}
                {m.texto}
              </span>
              {s.bajaFecha ? (
                <span className="su-hecha" title={`Pedida el ${new Date(s.bajaFecha).toLocaleDateString('es-ES')}`}>
                  <CheckCircle size={15} weight="fill" /> Baja pedida
                </span>
              ) : (
                <button className="su-baja destacado" disabled={ocupado.has(k)} onClick={() => darDeBaja(s)}>
                  {ocupado.has(k) ? 'Un momento…' : 'Darse de baja'}
                </button>
              )}
              {s.bajaFecha && s.aLaVista > 0 && (
                <button className="su-limpiar" disabled={ocupado.has(k)} onClick={() => limpiar(s, 'trash')} title="Mover sus correos a la papelera">
                  <Trash size={14} /> {s.aLaVista}
                </button>
              )}
              <button className="cal-boton" title="Más" onClick={(e) => menuFila(s, e.clientX, e.clientY)}>
                <DotsThree size={18} weight="bold" />
              </button>
            </div>
          )
        })}
      </div>
      <footer className="cal-pie">
        La baja de un clic y por correo no abren ninguna web. Después puedes mandar sus correos a la papelera desde aquí (Ctrl+Z deshace).
      </footer>
    </section>
  )
}

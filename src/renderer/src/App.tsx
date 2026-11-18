import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive, ArrowBendDoubleUpLeft, ArrowBendUpLeft, ArrowBendUpRight, EnvelopeSimple, EnvelopeSimpleOpen, Flag, Folder,
  Key, Prohibit, Trash, UserPlus,
} from '@phosphor-icons/react'
import type { Buzon, Datos, Mensaje, RolCarpeta } from '@shared/tipos'
import { api, useCorreo } from '@/estado'
import { Sidebar } from '@/components/Sidebar'
import { Toolbar, type AccionBarra, type Disposicion } from '@/components/Toolbar'
import { MessageList } from '@/components/MessageList'
import { Reader, TRADUCIR_SIEMPRE, type ElementoVista } from '@/components/Reader'
import { VistaRapida } from '@/components/VistaRapida'
import { Redactar } from '@/components/Redactar'
import { NuevaCuenta } from '@/components/NuevaCuenta'
import { SelectorAcento, useAcento } from '@/components/Acento'
import { miles } from '@/formato'
import {
  BurbujaTraduccion, InterfazContexto, MenuContextual, type ElementoMenu, type Interfaz, type MenuAbierto, type OpcionesRedactar,
} from '@/components/MenuContextual'

function leerPreferencia<T extends string>(clave: string, porDefecto: T): T {
  try {
    return (localStorage.getItem(clave) as T) || porDefecto
  } catch {
    return porDefecto
  }
}

function guardarPreferencia(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* sin almacenamiento: da igual */
  }
}

function tituloDe(d: Datos, b: Buzon): string {
  switch (b.tipo) {
    case 'todas':
      return { inbox: 'Todas las bandejas', drafts: 'Todos los borradores', sent: 'Todos los enviados' }[b.rol]
    case 'marcados':
      return 'Marcados'
    case 'hoy':
      return 'Hoy'
    case 'carpeta': {
      const c = d.carpetas.find((f) => f.id === b.carpeta)
      const cuenta = d.cuentas.find((x) => x.id === c?.cuenta)
      return `${c?.nombre ?? ''} — ${cuenta?.nombre ?? ''}`
    }
  }
}

export function App() {
  const correo = useCorreo()
  const { datos, seleccion } = correo

  const vistaForzada = window.niebla.vista
  const [disposicion, setDisposicion] = useState<Disposicion>(() =>
    vistaForzada ? (vistaForzada.startsWith('ancha') ? 'ancha' : 'columnas') : leerPreferencia('disposicion', 'columnas'),
  )
  const [barraOculta, setBarraOculta] = useState(() => leerPreferencia<'visible' | 'oculta'>('barra', 'visible') === 'oculta')
  const [soloNoLeidos, setSoloNoLeidos] = useState(false)
  const [abierto, setAbierto] = useState(vistaForzada === 'ancha-abierta') // lector a pantalla completa en lista ancha
  // Sin mensaje seleccionado (al cambiar de buzón, al archivar el último…) no hay nada que leer:
  // en lista ancha se vuelve a la lista, que si no el lector vacío la tapa.
  useEffect(() => {
    if (!correo.seleccion && vistaForzada !== 'ancha-abierta') setAbierto(false)
  }, [correo.seleccion, vistaForzada])
  const [menuMover, setMenuMover] = useState(false)
  const [menuMas, setMenuMas] = useState<number | null>(null) // distancia al borde derecho
  const [acento, setAcento] = useAcento()
  const [focoBusqueda, setFocoBusqueda] = useState(0)
  const [hilo, setHilo] = useState<Mensaje[]>([])
  const [vista, setVista] = useState<{ elementos: ElementoVista[]; indice: number } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuAbierto | null>(null)
  const [redactando, setRedactando] = useState<OpcionesRedactar | null>(null)
  const [alta, setAlta] = useState<{ cuenta?: string } | null>(null) // añadir cuenta o poner su contraseña
  const [burbuja, setBurbuja] = useState<{ x: number; y: number; texto: string } | null>(null)
  const cerrarMenu = useCallback(() => setMenu(null), [])
  const cerrarBurbuja = useCallback(() => setBurbuja(null), [])
  const [siempreTraducir, setSiempreTraducir] = useState(() => leerPreferencia<string>(TRADUCIR_SIEMPRE, '0') === '1')

  const lista = useMemo(
    () => (soloNoLeidos ? correo.lista.filter((m) => !m.leido || m.id === seleccion) : correo.lista),
    [correo.lista, soloNoLeidos, seleccion],
  )
  const actual = correo.lista.find((m) => m.id === seleccion) ?? null

  // Errores del principal (sin conexión, fallo al mover…): aviso discreto unos segundos.
  useEffect(
    () =>
      window.niebla.alError((t) => {
        setAviso(t)
        setTimeout(() => setAviso((a) => (a === t ? null : a)), 6000)
      }),
    [],
  )

  // La conversación del mensaje seleccionado. Solo se vuelve a pedir si cambia ese hilo (llega
  // una respuesta): marcar como leído u otros cambios de la lista no la recargan.
  const firmaHilo = actual ? `${actual.enHilo}|${actual.fecha}` : ''
  useEffect(() => {
    if (!seleccion) return setHilo([])
    let vivo = true
    api.hilo(seleccion).then((h) => {
      if (!vivo) return
      setHilo(h)
      const noLeidos = h.filter((m) => !m.leido).map((m) => m.id)
      // En el modo captura (pruebas con la cuenta real) no se toca nada del servidor.
      if (noLeidos.length && !window.niebla.vista) api.marcar(noLeidos, { leido: true }, false)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, firmaHilo])

  // Precarga en caliente: los 5 de arriba y los 5 de abajo de la selección, para que al bajar
  // con las flechas ya estén descargados.
  useEffect(() => {
    if (!seleccion || window.niebla.demo) return
    const t = setTimeout(() => {
      const i = lista.findIndex((m) => m.id === seleccion)
      if (i < 0) return
      const vecinos = [...lista.slice(i + 1, i + 6), ...lista.slice(Math.max(0, i - 5), i)].map((m) => m.id)
      if (vecinos.length) api.precargar(vecinos)
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion])

  // En la demo arranca con un mensaje abierto, para ver el lector.
  useEffect(() => {
    if ((window.niebla.demo || window.niebla.vista) && correo.cargado && !seleccion && lista[window.niebla.sel]) {
      correo.setSeleccion(lista[window.niebla.sel].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correo.cargado, lista.length])

  // Los mensajes de la conversación que están en la misma carpeta que la fila: se mueven juntos.
  const idsConversacion = useCallback(() => {
    if (!actual) return []
    const mismos = hilo.filter((m) => m.carpeta === actual.carpeta).map((m) => m.id)
    return mismos.includes(actual.id) ? mismos : [actual.id, ...mismos]
  }, [actual, hilo])

  // Tras archivar o borrar, Mail salta al siguiente mensaje (o al anterior si era el último).
  const siguienteTras = (id: string) => {
    const i = lista.findIndex((m) => m.id === id)
    return lista[i + 1]?.id ?? lista[i - 1]?.id ?? null
  }

  const moverA = (destino: { rol: RolCarpeta } | { ruta: string }) => {
    if (!actual) return
    const ids = idsConversacion()
    correo.setSeleccion(siguienteTras(actual.id))
    api.mover(ids, destino)
  }

  const avisar = useCallback((t: string) => {
    setAviso(t)
    setTimeout(() => setAviso((a) => (a === t ? null : a)), 4000)
  }, [])

  const redactar = useCallback((o: OpcionesRedactar) => setRedactando(o), [])
  const rolDe = useCallback((carpeta: string) => datos.carpetas.find((c) => c.id === carpeta)?.rol, [datos.carpetas])

  const interfaz = useMemo<Interfaz>(
    () => ({
      abrirMenu: setMenu,
      traducirSeleccion: (x, y, texto) => setBurbuja({ x, y, texto }),
      avisar,
      buscar: (t) => correo.setBusqueda(t),
      redactar,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [avisar, redactar],
  )

  // Menú de una cuenta (clic derecho en su nombre en la barra lateral).
  const menuCuenta = (id: string, x: number, y: number) => {
    const c = datos.cuentas.find((x) => x.id === id)
    if (!c) return
    setMenu({
      x,
      y,
      elementos: [
        c.auth === 'clave'
          ? { etiqueta: 'Cambiar la contraseña…', icono: <Key size={15} />, accion: () => setAlta({ cuenta: id }) }
          : { etiqueta: 'Volver a iniciar sesión', icono: <Key size={15} />, accion: () => api.volverAEntrar(id).catch((e: Error) => avisar(e.message)) },
        { etiqueta: 'Añadir otra cuenta…', icono: <UserPlus size={15} />, accion: () => setAlta({}) },
        '-',
        {
          etiqueta: `Quitar «${c.nombre}» de TuxMail`,
          icono: <Trash size={15} />,
          peligro: true,
          // Confirmación en el propio menú: el correo del servidor no se toca, solo la copia local.
          submenu: [
            {
              etiqueta: 'Sí, quitarla (el correo sigue en el servidor)',
              peligro: true,
              accion: async () => {
                await api.quitarCuenta(id)
                avisar(`«${c.nombre}» quitada de TuxMail`)
              },
            },
          ],
        },
      ],
    })
  }

  // Clic derecho en una fila: la selecciona (como Mail) y ofrece las acciones de esa conversación.
  const menuFila = useCallback(
    (m: Mensaje, x: number, y: number) => {
      correo.setSeleccion(m.id)
      const idsHilo = async () => {
        const h = await api.hilo(m.id)
        const mismos = h.filter((x) => x.carpeta === m.carpeta).map((x) => x.id)
        return mismos.length ? mismos : [m.id]
      }
      const moverFila = async (destino: { rol: RolCarpeta } | { ruta: string }) => api.mover(await idsHilo(), destino)
      const remitente = m.de.nombre || m.de.direccion
      const elementos: ElementoMenu[] = [
        { etiqueta: 'Responder', icono: <ArrowBendUpLeft size={15} />, atajo: 'Ctrl R', accion: () => redactar({ tipo: 'responder', id: m.id }) },
        { etiqueta: 'Responder a todos', icono: <ArrowBendDoubleUpLeft size={15} />, atajo: 'Ctrl ⇧ R', accion: () => redactar({ tipo: 'responderTodos', id: m.id }) },
        { etiqueta: 'Reenviar', icono: <ArrowBendUpRight size={15} />, atajo: 'Ctrl ⇧ F', accion: () => redactar({ tipo: 'reenviar', id: m.id }) },
        '-',
        {
          etiqueta: m.leido ? 'Marcar como no leído' : 'Marcar como leído',
          icono: m.leido ? <EnvelopeSimple size={15} /> : <EnvelopeSimpleOpen size={15} />,
          atajo: 'Ctrl ⇧ U',
          accion: async () => api.marcar(await idsHilo(), { leido: !m.leido }),
        },
        { etiqueta: m.marcado ? 'Quitar marca' : 'Marcar', icono: <Flag size={15} />, atajo: 'Ctrl ⇧ L', accion: () => api.marcar([m.id], { marcado: !m.marcado }) },
        '-',
        { etiqueta: 'Archivar', icono: <Archive size={15} />, atajo: 'Ctrl ⇧ A', accion: () => moverFila({ rol: 'archive' }) },
        {
          etiqueta: 'Mover a',
          icono: <Folder size={15} />,
          submenu: datos.carpetas
            .filter((c) => c.cuenta === m.cuenta && c.id !== m.carpeta)
            .map((c) => ({ etiqueta: c.nombre, icono: <Folder size={14} />, accion: () => moverFila({ ruta: c.ruta }) })),
        },
        { etiqueta: 'Mandar a spam', icono: <Prohibit size={15} />, atajo: 'Ctrl ⇧ J', accion: () => moverFila({ rol: 'junk' }) },
        { etiqueta: 'Mover a la papelera', icono: <Trash size={15} />, atajo: 'Supr', peligro: true, accion: () => moverFila({ rol: 'trash' }) },
        '-',
        {
          etiqueta: `Nuevo correo a ${remitente}`,
          icono: <UserPlus size={15} />,
          accion: () => redactar({ tipo: 'nuevo', para: [m.de], cuenta: m.cuenta }),
        },
      ]
      setMenu({ x, y, elementos })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.carpetas, redactar],
  )

  const accion = (a: AccionBarra) => {
    switch (a) {
      case 'filtro':
        return setSoloNoLeidos((v) => !v)
      case 'disposicion': {
        const nueva = disposicion === 'columnas' ? 'ancha' : 'columnas'
        guardarPreferencia('disposicion', nueva)
        setAbierto(false)
        return setDisposicion(nueva)
      }
      case 'archivar':
        return moverA({ rol: 'archive' })
      case 'papelera':
        return moverA({ rol: 'trash' })
      case 'spam':
        return moverA({ rol: 'junk' })
      case 'mover':
        return setMenuMover((v) => !v)
      case 'mas': {
        // El menú cuelga del propio botón «···».
        const r = document.querySelector('[title="Más"]')?.getBoundingClientRect()
        const principal = document.querySelector('.principal')?.getBoundingClientRect()
        return setMenuMas((v) => (v !== null || !r || !principal ? null : Math.max(8, principal.right - r.right - 100)))
      }
      case 'marcar':
        if (actual) api.marcar([actual.id], { marcado: !actual.marcado })
        return
      case 'redactar':
        return redactar({ tipo: 'nuevo', cuenta: actual?.cuenta })
      case 'responder':
      case 'responderTodos':
      case 'reenviar':
        if (actual) redactar({ tipo: a, id: actual.id })
        return
      default:
        return
    }
  }

  // Atajos de teclado de Mail (Cmd → Ctrl).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (vista || redactando || alta) return // la vista rápida y la ventana de redactar tienen sus propias teclas
      const enCampo = (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')
      const k = e.key.toLowerCase()
      if (e.ctrlKey && !e.shiftKey && k === 'f') return e.preventDefault(), setFocoBusqueda(Date.now())
      if (enCampo) return
      if (e.ctrlKey && !e.shiftKey && k === 'z') return e.preventDefault(), api.deshacer()
      if (e.ctrlKey && e.shiftKey && k === 't') return e.preventDefault(), window.dispatchEvent(new Event('tuxmail:traducir'))
      if (e.ctrlKey && !e.shiftKey && k === 'n') return e.preventDefault(), accion('redactar')
      if (e.ctrlKey && !e.shiftKey && k === 'r') return e.preventDefault(), accion('responder')
      if (e.ctrlKey && e.shiftKey && k === 'r') return e.preventDefault(), accion('responderTodos')
      if (e.ctrlKey && e.shiftKey && k === 'f') return e.preventDefault(), accion('reenviar')
      if (e.ctrlKey && e.shiftKey && k === 'a') return e.preventDefault(), accion('archivar')
      if (e.ctrlKey && e.shiftKey && k === 'j') return e.preventDefault(), accion('spam')
      if (e.ctrlKey && e.shiftKey && k === 'l') return e.preventDefault(), accion('marcar')
      if (e.ctrlKey && e.shiftKey && k === 'u' && actual)
        return e.preventDefault(), api.marcar(idsConversacion(), { leido: !actual.leido })
      if (k === 'delete' || k === 'backspace') return e.preventDefault(), accion('papelera')
      if (k === 'arrowdown' || k === 'arrowup') {
        e.preventDefault()
        const i = lista.findIndex((m) => m.id === seleccion)
        const j = k === 'arrowdown' ? Math.min(lista.length - 1, i + 1) : Math.max(0, i - 1)
        if (lista[j]) correo.setSeleccion(lista[j].id)
      }
      if (k === 'enter' && actual && disposicion === 'ancha') setAbierto(true)
      if (k === 'escape') setAbierto(false), setMenuMover(false), setMenuMas(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const titulo = tituloDe(datos, correo.buzon)
  const total = lista.length
  const subtitulo = `${miles(total)} ${total === 1 ? 'conversación' : 'conversaciones'}${soloNoLeidos ? ' · solo no leídos' : ''}`
  const verLector = disposicion === 'columnas' || abierto
  const ancha = disposicion === 'ancha'
  // Doble clic: en Borradores abre el borrador para editarlo; en lista ancha, el lector.
  const abrirFila = useCallback(
    (id: string) => {
      const m = correo.lista.find((x) => x.id === id)
      if (m && rolDe(m.carpeta) === 'drafts') return setRedactando({ tipo: 'borrador', id })
      if (ancha) setAbierto(true)
    },
    [ancha, correo.lista, rolDe],
  )
  const misDirecciones = useMemo(() => new Set(datos.cuentas.map((c) => c.direccion.toLowerCase())), [datos.cuentas])

  return (
    <InterfazContexto.Provider value={interfaz}>
    <div className={`app${barraOculta ? ' sin-barra' : ''}`}>
      {!barraOculta && (
        <Sidebar
          correo={correo}
          onOcultar={() => {
            setBarraOculta(true)
            guardarPreferencia('barra', 'oculta')
          }}
          onAnadirCuenta={() => setAlta({})}
          onMenuCuenta={menuCuenta}
          onArreglarCuenta={(id) => {
            const c = datos.cuentas.find((x) => x.id === id)
            if (c?.auth === 'clave') setAlta({ cuenta: id })
            else api.volverAEntrar(id).catch((e: Error) => avisar(e.message))
          }}
        />
      )}
      <main className="principal">
        <Toolbar
          titulo={titulo}
          subtitulo={subtitulo}
          haySeleccion={!!actual}
          marcado={!!actual?.marcado}
          filtroNoLeidos={soloNoLeidos}
          disposicion={disposicion}
          barraOculta={barraOculta}
          busqueda={correo.busqueda}
          enfocarBusqueda={focoBusqueda}
          onBuscar={correo.setBusqueda}
          onMostrarBarra={() => {
            setBarraOculta(false)
            guardarPreferencia('barra', 'visible')
          }}
          onAccion={accion}
        />
        {menuMas !== null && (
          <div className="menu-mas" style={{ right: menuMas }} onMouseLeave={() => setMenuMas(null)}>
            <SelectorAcento acento={acento} onCambiar={setAcento} />
            <div className="menu-mas-separador" />
            <label className="menu-mas-opcion">
              <input
                type="checkbox"
                checked={siempreTraducir}
                onChange={(e) => {
                  setSiempreTraducir(e.target.checked)
                  guardarPreferencia(TRADUCIR_SIEMPRE, e.target.checked ? '1' : '0')
                }}
              />
              <span>Traducir siempre los correos en inglés</span>
              <kbd>Ctrl ⇧ T</kbd>
            </label>
          </div>
        )}
        {menuMover && actual && (
          <div className="menu-mover" onMouseLeave={() => setMenuMover(false)}>
            {datos.carpetas
              .filter((c) => c.cuenta === actual.cuenta && c.id !== actual.carpeta)
              .map((c) => (
                <div
                  key={c.id}
                  className="menu-item"
                  onClick={() => {
                    setMenuMover(false)
                    moverA({ ruta: c.ruta })
                  }}
                >
                  <Folder size={15} /> {c.nombre}
                </div>
              ))}
          </div>
        )}
        <div className={`contenido ${disposicion}${abierto ? ' abierto' : ''}`}>
          {!(disposicion === 'ancha' && abierto) && (
            <MessageList
              mensajes={lista}
              seleccion={seleccion}
              ancha={disposicion === 'ancha'}
              onSeleccionar={correo.setSeleccion}
              onAbrir={abrirFila}
              onMenu={menuFila}
            />
          )}
          {verLector && (
            <Reader
              hilo={actual ? hilo : []}
              seleccionado={seleccion}
              nombreCuenta={(id) => datos.cuentas.find((c) => c.id === id)?.nombre ?? ''}
              esMio={(d) => misDirecciones.has(d.toLowerCase())}
              onVolver={disposicion === 'ancha' ? () => setAbierto(false) : undefined}
              onVistaRapida={(elementos, indice) => setVista({ elementos, indice })}
              esBorrador={(m) => rolDe(m.carpeta) === 'drafts'}
            />
          )}
        </div>
        {aviso && <div className="aviso-flotante">{aviso}</div>}
      </main>
      {vista && <VistaRapida elementos={vista.elementos} indice={vista.indice} onCerrar={() => setVista(null)} />}
      {redactando && (
        <Redactar
          key={JSON.stringify(redactando)}
          opciones={redactando}
          cuentas={datos.cuentas}
          onCerrar={() => setRedactando(null)}
          avisar={avisar}
        />
      )}
      {(alta || (correo.cargado && !window.niebla.demo && !window.niebla.vista && datos.cuentas.length === 0)) && (
        <NuevaCuenta
          key={alta?.cuenta ?? 'nueva'}
          existente={alta?.cuenta ? datos.cuentas.find((c) => c.id === alta.cuenta) : undefined}
          cuentas={datos.cuentas}
          bienvenida={datos.cuentas.length === 0}
          onCerrar={() => setAlta(null)}
          avisar={avisar}
        />
      )}
      {menu && <MenuContextual menu={menu} onCerrar={cerrarMenu} />}
      {burbuja && <BurbujaTraduccion x={burbuja.x} y={burbuja.y} texto={burbuja.texto} onCerrar={cerrarBurbuja} />}
    </div>
    </InterfazContexto.Provider>
  )
}

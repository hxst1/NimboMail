import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, CaretRight, Check, CheckCircle, DotsThree, EnvelopeSimple, Globe, Lightning, MagnifyingGlass, Prohibit, Trash, X,
} from '@phosphor-icons/react'
import type { Suscripcion } from '@shared/tipos'
import { api } from '@/estado'
import { iniciales } from '@/formato'
import { useInterfaz } from '@/components/MenuContextual'
import { Desplegable } from '@/components/Desplegable'

type Orden = 'total' | 'recientes' | 'sinLeer'

const METODOS: Record<Suscripcion['metodo'], { texto: string; ayuda: string }> = {
  'un-clic': { texto: 'Baja de un clic', ayuda: 'Se da de baja al momento, sin abrir ninguna web (RFC 8058).' },
  correo: { texto: 'Baja por correo', ayuda: 'NimboMail manda el correo de baja desde tu cuenta.' },
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

/**
 * Un tipo de correo: una suscripción o varias que son el mismo boletín. Hay programas de envío que
 * ponen un List-Id distinto en cada campaña («1423.22039.mail.ejemplo.com»): mismo remitente y mismo
 * List-Id salvo los números = el mismo tipo.
 */
type Tipo = Suscripcion & { miembros: Suscripcion[] }

const claveTipo = (s: Suscripcion) =>
  s.clave.includes('@') ? `${s.cuenta}|${s.clave}` : `${s.cuenta}|${s.direccion.toLowerCase()}|${s.clave.replace(/\d+/g, '#')}`

function unirCampanas(lista: Suscripcion[]): Tipo[] {
  const mapa = new Map<string, Suscripcion[]>()
  for (const s of lista) {
    const k = claveTipo(s)
    mapa.set(k, [...(mapa.get(k) ?? []), s])
  }
  return [...mapa.values()].map((miembros) => {
    const reciente = [...miembros].sort((a, b) => b.ultima - a.ultima)[0]
    return {
      ...reciente,
      clave: miembros.length > 1 ? claveTipo(reciente) : reciente.clave,
      total: miembros.reduce((n, m) => n + m.total, 0),
      sinLeer: miembros.reduce((n, m) => n + m.sinLeer, 0),
      aLaVista: miembros.reduce((n, m) => n + m.aLaVista, 0),
      miembros,
    }
  })
}

/** «beacon-split.hxst1.github.com» → la lista se enseña si no es la propia dirección. */
const nombreLista = (t: Tipo) => {
  if (t.miembros.length > 1) return `${t.miembros.length} campañas del mismo boletín`
  return t.clave.includes('@') ? null : `Lista: ${t.clave}`
}

// ------------------------------------------------------------ agrupar por empresa

// Proveedores de correo gratuito: quien escribe desde aquí es cada uno de su padre, no se agrupan.
const LIBRES = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.es', 'hotmail.com', 'hotmail.es', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.es',
  'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.es', 'gmx.de', 'aol.com', 'zoho.com', 'yandex.com',
  'mail.com', 'telefonica.net', 'movistar.es',
])
// Sufijos de dos partes (lo de antes es la empresa: «amazon.co.uk» → amazon).
const SUFIJOS_DOBLES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'com.es', 'org.es', 'com.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.au', 'co.nz', 'co.jp', 'co.in', 'co.za',
  'com.tr', 'com.cn', 'com.sg', 'com.hk',
])

/** La empresa de una dirección: «jobs-noreply@e.linkedin.com» → «linkedin»; las de Gmail, por persona. */
function empresaDe(direccion: string): string {
  const dominio = (direccion.split('@')[1] ?? direccion).toLowerCase()
  if (LIBRES.has(dominio)) return direccion.toLowerCase()
  const partes = dominio.split('.')
  const n = SUFIJOS_DOBLES.has(partes.slice(-2).join('.')) ? 3 : 2
  return partes.length >= n ? partes[partes.length - n] : dominio
}

interface Grupo {
  clave: string
  nombre: string
  subs: Tipo[]
  total: number
  sinLeer: number
  ultima: number
}

function agrupar(lista: Suscripcion[]): Grupo[] {
  const mapa = new Map<string, Tipo[]>()
  for (const s of unirCampanas(lista)) {
    const k = empresaDe(s.direccion)
    mapa.set(k, [...(mapa.get(k) ?? []), s])
  }
  return [...mapa.entries()].map(([k, subs]) => {
    // Nombre del grupo: el nombre de remitente más corto que contenga la empresa («LinkedIn» mejor que
    // «LinkedIn Job Alerts»); si ninguno, la empresa con mayúscula.
    const conMarca = subs.map((s) => s.nombre.trim()).filter((n) => n && n.toLowerCase().replace(/\s+/g, '').includes(k.replace(/[-_]/g, '')))
    const nombre =
      subs.length === 1
        ? subs[0].nombre || subs[0].direccion
        : (conMarca.sort((a, b) => a.length - b.length)[0] ?? k.charAt(0).toUpperCase() + k.slice(1))
    return {
      clave: k,
      nombre,
      subs: subs.sort((a, b) => b.total - a.total),
      total: subs.reduce((n, s) => n + s.total, 0),
      sinLeer: subs.reduce((n, s) => n + s.sinLeer, 0),
      ultima: Math.max(...subs.map((s) => s.ultima)),
    }
  })
}

/** Casilla con estado intermedio (para el grupo: unas sí y otras no). */
function Casilla({ marcada, intermedia, onCambiar, titulo }: { marcada: boolean; intermedia?: boolean; onCambiar: (v: boolean) => void; titulo?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!intermedia && !marcada
  }, [intermedia, marcada])
  return <input ref={ref} type="checkbox" title={titulo} checked={marcada} onChange={(e) => onCambiar(e.target.checked)} onClick={(e) => e.stopPropagation()} />
}

export function Suscripciones({ onCerrar, onVerCorreos }: { onCerrar: () => void; onVerCorreos: (direccion: string) => void }) {
  const ui = useInterfaz()
  const [lista, setLista] = useState<Suscripcion[]>([])
  const [cargado, setCargado] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<Orden>('total')
  const [ocultarDadas, setOcultarDadas] = useState(false)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
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

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return agrupar(lista.filter((s) => !ocultarDadas || !s.bajaFecha))
      .filter((g) => !q || `${g.nombre} ${g.subs.map((s) => `${s.nombre} ${s.direccion} ${s.clave} ${s.asunto}`).join(' ')}`.toLowerCase().includes(q))
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

  // Se da de baja con el enlace de la campaña más reciente; las demás del mismo boletín solo se apuntan.
  const darDeBaja = (t: Tipo, silencioso = false) =>
    conOcupado(claveTipo(t), async () => {
      const s = t
      try {
        const reciente = t.miembros.find((m) => m.ultimo === t.ultimo) ?? t.miembros[0]
        const m = await api.darseDeBaja(reciente.cuenta, reciente.clave)
        for (const otro of t.miembros) if (otro !== reciente) await api.apuntarBaja(otro.cuenta, otro.clave, m)
        if (!silencioso)
          ui.avisar(
            m === 'web' ? `Se ha abierto la página de baja de ${s.nombre || s.direccion}` : `Baja pedida a ${s.nombre || s.direccion}${m === 'un-clic' ? '' : ' (por correo)'}`,
          )
      } catch (e) {
        ui.avisar(`No se pudo con ${s.nombre || s.direccion}: ${(e as Error).message}`)
      }
    })

  const limpiar = (tipos: Tipo[], destino: 'trash' | 'archive' | 'junk') =>
    conOcupado(tipos.map(claveTipo).join(','), async () => {
      let n = 0
      for (const s of tipos.flatMap((t) => t.miembros)) n += await api.limpiarSuscripcion(s.cuenta, s.clave, destino)
      const donde = destino === 'trash' ? 'a la papelera' : destino === 'archive' ? 'al archivo' : 'a spam'
      ui.avisar(`${n} ${n === 1 ? 'correo movido' : 'correos movidos'} ${donde} · Ctrl+Z para deshacer`)
    })

  const menuSub = (s: Tipo, x: number, y: number) =>
    ui.abrirMenu({
      x,
      y,
      elementos: [
        { etiqueta: 'Ver sus correos', icono: <MagnifyingGlass size={15} />, accion: () => onVerCorreos(s.direccion) },
        '-',
        { etiqueta: `Mover sus ${s.aLaVista} correos a la papelera`, icono: <Trash size={15} />, desactivado: !s.aLaVista, accion: () => limpiar([s], 'trash') },
        { etiqueta: `Archivar sus ${s.aLaVista} correos`, icono: <Archive size={15} />, desactivado: !s.aLaVista, accion: () => limpiar([s], 'archive') },
        { etiqueta: 'Mandar todo a spam', icono: <Prohibit size={15} />, peligro: true, desactivado: !s.aLaVista, accion: () => limpiar([s], 'junk') },
      ],
    })

  const alternar = (claves: string[], v: boolean) =>
    setElegidas((x) => {
      const n = new Set(x)
      for (const k of claves) {
        if (v) n.add(k)
        else n.delete(k)
      }
      return n
    })
  const alternarGrupo = (k: string) =>
    setAbiertos((a) => {
      const n = new Set(a)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const todas = grupos.flatMap((g) => g.subs)
  const elegidasVistas = todas.filter((s) => elegidas.has(claveTipo(s)))
  const pendientesElegidas = elegidasVistas.filter((s) => !s.bajaFecha)
  const bajaElegidas = async () => {
    for (const s of pendientesElegidas) await darDeBaja(s, true)
    ui.avisar(`Baja pedida a ${pendientesElegidas.length} ${pendientesElegidas.length === 1 ? 'tipo de correo' : 'tipos de correo'}`)
    setElegidas(new Set())
  }
  const totalALaVista = lista.reduce((n, s) => n + s.aLaVista, 0)

  /** Una suscripción concreta (un tipo de correo): quién es, qué manda y cómo darse de baja. */
  const filaSub = (s: Tipo, dentro: boolean) => {
    const k = claveTipo(s)
    const lista = nombreLista(s)
    const m = METODOS[s.metodo]
    return (
      <div
        key={k}
        className={`su-fila${dentro ? ' sub' : ''}${s.bajaFecha ? ' dada' : ''}${elegidas.has(k) ? ' elegida' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault()
          menuSub(s, e.clientX, e.clientY)
        }}
      >
        <Casilla marcada={elegidas.has(k)} onCambiar={(v) => alternar([k], v)} titulo="Elegir este tipo de correo" />
        {!dentro && <div className="avatar">{iniciales(s.nombre || s.direccion)}</div>}
        <div className="su-datos">
          <div className="su-nombre">
            {s.nombre || s.direccion}
            {variasCuentas && <span className="su-cuenta">{s.cuenta}</span>}
          </div>
          <div className="su-dir">
            {s.direccion}
            {lista && <span className="su-lista-id"> · {lista}</span>}
          </div>
          <div className="su-asunto" title={s.asunto}>
            Último: «{s.asunto || '(sin asunto)'}»
          </div>
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
          <button className="su-limpiar" onClick={() => limpiar([s], 'trash')} title="Mover sus correos a la papelera">
            <Trash size={14} /> {s.aLaVista}
          </button>
        )}
        <button className="cal-boton" title="Más" onClick={(e) => menuSub(s, e.clientX, e.clientY)}>
          <DotsThree size={18} weight="bold" />
        </button>
      </div>
    )
  }

  return (
    <section className="suscripciones">
      <header className="su-cabeza">
        <div>
          <h1>Suscripciones</h1>
          <div className="su-sub">
            {cargado
              ? `${grupos.length} ${grupos.length === 1 ? 'remitente' : 'remitentes'} · ${todas.length} tipos de correo · ${totalALaVista} correos suyos a la vista`
              : 'Buscando boletines…'}
          </div>
        </div>
        <div className="su-buscar">
          <MagnifyingGlass size={14} />
          <input placeholder="Buscar remitente o asunto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <Desplegable<Orden>
          valor={orden}
          onCambiar={setOrden}
          titulo="Ordenar"
          opciones={[
            { valor: 'total', texto: 'Más correos' },
            { valor: 'recientes', texto: 'Más recientes' },
            { valor: 'sinLeer', texto: 'Más sin leer' },
          ]}
        />
        <button type="button" className={`su-ficha${ocultarDadas ? ' activa' : ''}`} aria-pressed={ocultarDadas} onClick={() => setOcultarDadas((v) => !v)}>
          {ocultarDadas && <Check size={12} weight="bold" />} Ocultar las dadas de baja
        </button>
        <button className="cal-boton" title="Volver al correo (Esc)" onClick={onCerrar}>
          <X size={17} />
        </button>
      </header>

      {elegidasVistas.length > 0 && (
        <div className="su-barra-seleccion">
          <span>
            {elegidasVistas.length} {elegidasVistas.length === 1 ? 'tipo de correo elegido' : 'tipos de correo elegidos'}
            {pendientesElegidas.length < elegidasVistas.length && ` (${elegidasVistas.length - pendientesElegidas.length} ya dados de baja)`}
          </span>
          {pendientesElegidas.length > 0 && (
            <button className="destacado" onClick={bajaElegidas}>
              Darse de baja de {pendientesElegidas.length === 1 ? 'este' : `estos ${pendientesElegidas.length}`}
            </button>
          )}
          <button onClick={async () => (await limpiar(elegidasVistas, 'trash'), setElegidas(new Set()))}>
            <Trash size={14} /> Sus correos a la papelera
          </button>
          <button onClick={() => setElegidas(new Set())}>Quitar selección</button>
        </div>
      )}

      <div className="su-lista">
        {cargado && !grupos.length && (
          <div className="su-vacio">
            {lista.length
              ? 'Nada con ese filtro.'
              : 'Todavía no hay boletines detectados. NimboMail lee la cabecera de baja de cada correo al sincronizar: si acabas de actualizar, puede tardar un poco.'}
          </div>
        )}
        {grupos.map((g) => {
          if (g.subs.length === 1) return filaSub(g.subs[0], false)
          const claves = g.subs.map(claveTipo)
          const marcadas = claves.filter((k) => elegidas.has(k)).length
          const dadas = g.subs.filter((s) => s.bajaFecha).length
          const abierto = abiertos.has(g.clave)
          return (
            <div key={g.clave} className={`su-grupo${abierto ? ' abierto' : ''}`}>
              <div className="su-fila grupo" onClick={() => alternarGrupo(g.clave)}>
                <Casilla
                  marcada={marcadas === claves.length}
                  intermedia={marcadas > 0}
                  onCambiar={(v) => alternar(claves, v)}
                  titulo="Elegir todos los tipos de correo de este remitente"
                />
                <div className="avatar">{iniciales(g.nombre)}</div>
                <div className="su-datos">
                  <div className="su-nombre">{g.nombre}</div>
                  <div className="su-cifras">
                    <b>{g.subs.length}</b> tipos de correo · <b>{g.total}</b> correos
                    {g.sinLeer > 0 && <> · {Math.round((g.sinLeer / g.total) * 100)} % sin leer</>} · último {hace(g.ultima)}
                  </div>
                </div>
                {dadas > 0 && (
                  <span className="su-hecha">
                    <CheckCircle size={15} weight="fill" /> {dadas === g.subs.length ? 'Todo dado de baja' : `${dadas} de ${g.subs.length} dados de baja`}
                  </span>
                )}
                <span className="su-desplegar">
                  {abierto ? 'Ocultar' : 'Ver los tipos'} <CaretRight size={12} weight="bold" className="su-flecha" />
                </span>
              </div>
              {abierto && (
                <div className="su-subs">
                  <div className="su-ayuda-grupo">Marca los que no quieras recibir. Los demás seguirán llegando como hasta ahora.</div>
                  {g.subs.map((s) => filaSub(s, true))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <footer className="cal-pie">
        Agrupados por empresa: despliega cada una para elegir qué tipos de correo dejar de recibir. La baja de un clic y por correo no abren ninguna web.
      </footer>
    </section>
  )
}

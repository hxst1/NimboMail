import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, CaretRight, Check, CheckCircle, DotsThree, EnvelopeSimple, Globe, Lightning, MagnifyingGlass, Prohibit, Trash, X,
} from '@phosphor-icons/react'
import type { Suscripcion } from '@shared/tipos'
import type { Textos } from '@shared/i18n'
import { api } from '@/estado'
import { locale, useT } from '@/i18n'
import { iniciales } from '@/formato'
import { useInterfaz } from '@/components/MenuContextual'
import { Desplegable } from '@/components/Desplegable'

type Orden = 'total' | 'recientes' | 'sinLeer'

const metodos = (t: Textos): Record<Suscripcion['metodo'], { texto: string; ayuda: string }> => ({
  'un-clic': t.suscripciones.metodos.unClic,
  correo: t.suscripciones.metodos.correo,
  web: t.suscripciones.metodos.web,
})

function hace(ms: number, t: Textos): string {
  const h = t.suscripciones.hace
  const dias = Math.floor((Date.now() - ms) / 86_400_000)
  if (dias <= 0) return h.hoy
  if (dias === 1) return h.ayer
  if (dias < 30) return h.dias(dias)
  const meses = Math.floor(dias / 30)
  if (meses < 12) return h.meses(meses)
  return h.anos(Math.floor(meses / 12))
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
const nombreLista = (tipo: Tipo, t: Textos) => {
  if (tipo.miembros.length > 1) return t.suscripciones.campanas(tipo.miembros.length)
  return tipo.clave.includes('@') ? null : t.suscripciones.lista(tipo.clave)
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
  const t = useT()
  const ts = t.suscripciones
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
  const darDeBaja = (tipo: Tipo, silencioso = false) =>
    conOcupado(claveTipo(tipo), async () => {
      const s = tipo
      try {
        const reciente = tipo.miembros.find((m) => m.ultimo === tipo.ultimo) ?? tipo.miembros[0]
        const m = await api.darseDeBaja(reciente.cuenta, reciente.clave)
        for (const otro of tipo.miembros) if (otro !== reciente) await api.apuntarBaja(otro.cuenta, otro.clave, m)
        if (!silencioso)
          ui.avisar(
            m === 'web' ? ts.paginaAbierta(s.nombre || s.direccion) : ts.bajaPedida(s.nombre || s.direccion, m !== 'un-clic'),
          )
      } catch (e) {
        ui.avisar(ts.errorBaja(s.nombre || s.direccion, (e as Error).message))
      }
    })

  const limpiar = (tipos: Tipo[], destino: 'trash' | 'archive' | 'junk') =>
    conOcupado(tipos.map(claveTipo).join(','), async () => {
      let n = 0
      for (const s of tipos.flatMap((tipo) => tipo.miembros)) n += await api.limpiarSuscripcion(s.cuenta, s.clave, destino)
      ui.avisar(ts.movidos(n, destino))
    })

  const menuSub = (s: Tipo, x: number, y: number) =>
    ui.abrirMenu({
      x,
      y,
      elementos: [
        { etiqueta: ts.menu.verCorreos, icono: <MagnifyingGlass size={15} />, accion: () => onVerCorreos(s.direccion) },
        '-',
        { etiqueta: ts.menu.aPapelera(s.aLaVista), icono: <Trash size={15} />, desactivado: !s.aLaVista, accion: () => limpiar([s], 'trash') },
        { etiqueta: ts.menu.archivar(s.aLaVista), icono: <Archive size={15} />, desactivado: !s.aLaVista, accion: () => limpiar([s], 'archive') },
        { etiqueta: ts.menu.aSpam, icono: <Prohibit size={15} />, peligro: true, desactivado: !s.aLaVista, accion: () => limpiar([s], 'junk') },
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
    ui.avisar(ts.bajaElegidas(pendientesElegidas.length))
    setElegidas(new Set())
  }
  const totalALaVista = lista.reduce((n, s) => n + s.aLaVista, 0)

  /** Una suscripción concreta (un tipo de correo): quién es, qué manda y cómo darse de baja. */
  const filaSub = (s: Tipo, dentro: boolean) => {
    const k = claveTipo(s)
    const lista = nombreLista(s, t)
    const m = metodos(t)[s.metodo]
    return (
      <div
        key={k}
        className={`su-fila${dentro ? ' sub' : ''}${s.bajaFecha ? ' dada' : ''}${elegidas.has(k) ? ' elegida' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault()
          menuSub(s, e.clientX, e.clientY)
        }}
      >
        <Casilla marcada={elegidas.has(k)} onCambiar={(v) => alternar([k], v)} titulo={ts.elegirTipo} />
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
            {ts.ultimo(s.asunto || ts.sinAsunto)}
          </div>
          <div className="su-cifras">
            <b>{s.total}</b> {ts.correos(s.total)}
            {s.sinLeer > 0 && <> · {ts.sinLeer(Math.round((s.sinLeer / s.total) * 100))}</>} · {ts.ultimoHace(hace(s.ultima, t))}
          </div>
        </div>
        <span className={`su-metodo ${s.metodo}`} title={m.ayuda}>
          {s.metodo === 'un-clic' ? <Lightning size={12} weight="fill" /> : s.metodo === 'correo' ? <EnvelopeSimple size={12} /> : <Globe size={12} />}
          {m.texto}
        </span>
        {s.bajaFecha ? (
          <span className="su-hecha" title={ts.pedidaEl(new Date(s.bajaFecha).toLocaleDateString(locale()))}>
            <CheckCircle size={15} weight="fill" /> {ts.bajaPedidaChip}
          </span>
        ) : (
          <button className="su-baja destacado" disabled={ocupado.has(k)} onClick={() => darDeBaja(s)}>
            {ocupado.has(k) ? ts.unMomento : ts.darseDeBaja}
          </button>
        )}
        {s.bajaFecha && s.aLaVista > 0 && (
          <button className="su-limpiar" onClick={() => limpiar([s], 'trash')} title={ts.moverAPapelera}>
            <Trash size={14} /> {s.aLaVista}
          </button>
        )}
        <button className="cal-boton" title={ts.mas} onClick={(e) => menuSub(s, e.clientX, e.clientY)}>
          <DotsThree size={18} weight="bold" />
        </button>
      </div>
    )
  }

  return (
    <section className="suscripciones">
      <header className="su-cabeza">
        <div>
          <h1>{t.comun.buzones.suscripciones}</h1>
          <div className="su-sub">
            {cargado
              ? ts.resumen(grupos.length, todas.length, totalALaVista)
              : ts.buscando}
          </div>
        </div>
        <div className="su-buscar">
          <MagnifyingGlass size={14} />
          <input placeholder={ts.buscar} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <Desplegable<Orden>
          valor={orden}
          onCambiar={setOrden}
          titulo={ts.ordenar}
          opciones={[
            { valor: 'total', texto: ts.orden.total },
            { valor: 'recientes', texto: ts.orden.recientes },
            { valor: 'sinLeer', texto: ts.orden.sinLeer },
          ]}
        />
        <button type="button" className={`su-ficha${ocultarDadas ? ' activa' : ''}`} aria-pressed={ocultarDadas} onClick={() => setOcultarDadas((v) => !v)}>
          {ocultarDadas && <Check size={12} weight="bold" />} {ts.ocultarDadas}
        </button>
        <button className="cal-boton" title={ts.volver} onClick={onCerrar}>
          <X size={17} />
        </button>
      </header>

      {elegidasVistas.length > 0 && (
        <div className="su-barra-seleccion">
          <span>
            {ts.elegidos(elegidasVistas.length)}
            {pendientesElegidas.length < elegidasVistas.length && ` ${ts.yaDados(elegidasVistas.length - pendientesElegidas.length)}`}
          </span>
          {pendientesElegidas.length > 0 && (
            <button className="destacado" onClick={bajaElegidas}>
              {ts.bajaDeEstos(pendientesElegidas.length)}
            </button>
          )}
          <button onClick={async () => (await limpiar(elegidasVistas, 'trash'), setElegidas(new Set()))}>
            <Trash size={14} /> {ts.susCorreosAPapelera}
          </button>
          <button onClick={() => setElegidas(new Set())}>{ts.quitarSeleccion}</button>
        </div>
      )}

      <div className="su-lista">
        {cargado && !grupos.length && (
          <div className="su-vacio">
            {lista.length
              ? ts.nadaConFiltro
              : ts.vacio}
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
                  titulo={ts.elegirGrupo}
                />
                <div className="avatar">{iniciales(g.nombre)}</div>
                <div className="su-datos">
                  <div className="su-nombre">{g.nombre}</div>
                  <div className="su-cifras">
                    <b>{g.subs.length}</b> {ts.tiposCorreo(g.subs.length)} · <b>{g.total}</b> {ts.correos(g.total)}
                    {g.sinLeer > 0 && <> · {ts.sinLeer(Math.round((g.sinLeer / g.total) * 100))}</>} · {ts.ultimoHace(hace(g.ultima, t))}
                  </div>
                </div>
                {dadas > 0 && (
                  <span className="su-hecha">
                    <CheckCircle size={15} weight="fill" /> {dadas === g.subs.length ? ts.todoDado : ts.dadosDe(dadas, g.subs.length)}
                  </span>
                )}
                <span className="su-desplegar">
                  {abierto ? ts.ocultar : ts.verTipos} <CaretRight size={12} weight="bold" className="su-flecha" />
                </span>
              </div>
              {abierto && (
                <div className="su-subs">
                  <div className="su-ayuda-grupo">{ts.ayudaGrupo}</div>
                  {g.subs.map((s) => filaSub(s, true))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <footer className="cal-pie">
        {ts.pie}
      </footer>
    </section>
  )
}

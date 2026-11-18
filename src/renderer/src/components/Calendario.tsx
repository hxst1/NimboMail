import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowsClockwise, EnvelopeSimple, MapPin, Plus, Trash, User, VideoCamera, X } from '@phosphor-icons/react'
import type { CalendarioInfo, Instancia } from '@shared/tipos'
import { api } from '@/estado'
import { useInterfaz } from '@/components/MenuContextual'

type Modo = 'mes' | 'semana'
const DIA = 86_400_000
const HORA_PX = 46

const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const lunesDe = (d: Date) => sumarDias(inicioDia(d), -((d.getDay() + 6) % 7))
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** ¿La instancia ocupa ese día? (los de varios días salen en todos) */
const tocaDia = (e: Instancia, d: Date) => {
  const ini = inicioDia(d).getTime()
  const fin = ini + DIA
  return e.inicio < fin && (e.fin > ini || (e.fin === e.inicio && e.inicio >= ini))
}

/** De qué servicio es la reunión, por su enlace. */
export function plataforma(enlace: string | null): { nombre: string; color: string } | null {
  if (!enlace) return null
  if (/meet\.google\.com/i.test(enlace)) return { nombre: 'Meet', color: '#55a868' }
  if (/teams\.(microsoft|live)\.com/i.test(enlace)) return { nombre: 'Teams', color: '#a37ad6' }
  if (/zoom\.us/i.test(enlace)) return { nombre: 'Zoom', color: '#4f8fe6' }
  if (/webex\.com/i.test(enlace)) return { nombre: 'Webex', color: '#d9873f' }
  return null
}

/** Color de un evento: el de su plataforma (Meet verde, Teams morado, Zoom azul…) o el de su calendario. */
export const colorDe = (e: Instancia) => plataforma(e.enlace)?.color ?? e.color

const RESPUESTAS: Record<string, string> = {
  'NEEDS-ACTION': 'Sin responder',
  ACCEPTED: 'Aceptada',
  TENTATIVE: 'Quizá',
  DECLINED: 'Rechazada',
  ORGANIZADOR: 'La organizas tú',
}

/** Tarjeta de una invitación: hora, quién organiza, Unirse y Aceptar / Quizá / Rechazar. */
export function TarjetaEvento({ e, onAbrirCorreo, compacta }: { e: Instancia; onAbrirCorreo?: (id: string) => void; compacta?: boolean }) {
  const ui = useInterfaz()
  const [enviando, setEnviando] = useState<string | null>(null)
  const responder = async (p: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED') => {
    setEnviando(p)
    try {
      await api.responderInvitacion(e.id, p)
      ui.avisar(p === 'ACCEPTED' ? 'Invitación aceptada' : p === 'TENTATIVE' ? 'Respondido: quizá' : 'Invitación rechazada')
    } catch (err) {
      ui.avisar(`No se pudo responder: ${(err as Error).message}`)
    } finally {
      setEnviando(null)
    }
  }
  const cancelada = e.estado === 'cancelado'
  const puedeResponder = e.esInvitacion && !cancelada && e.miRespuesta !== 'ORGANIZADOR' && !!e.organizador
  const cuando = e.todoElDia
    ? 'Todo el día'
    : `${hora(e.inicio)} – ${hora(e.fin)}`
  return (
    <div className={`evento-tarjeta${cancelada ? ' cancelado' : ''}${compacta ? ' compacta' : ''}`} style={{ '--color-cal': colorDe(e) } as React.CSSProperties}>
      <div className="et-cabeza">
        <span className="et-hora">{compacta ? new Date(e.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' : ''}{cuando}</span>
        {cancelada ? <span className="et-chip rojo">Cancelada</span> : e.esInvitacion && e.miRespuesta && <span className={`et-chip ${e.miRespuesta}`}>{RESPUESTAS[e.miRespuesta] ?? e.miRespuesta}</span>}
      </div>
      <div className="et-titulo">{e.titulo}</div>
      {e.lugar && !e.lugar.includes(e.enlace ?? '¬') && (
        <div className="et-dato">
          <MapPin size={13} /> {e.lugar}
        </div>
      )}
      {e.organizador && e.miRespuesta !== 'ORGANIZADOR' && (
        <div className="et-dato">
          <User size={13} /> {e.organizador.nombre || e.organizador.direccion}
          {e.asistentes > 1 ? ` · ${e.asistentes} invitados` : ''}
        </div>
      )}
      {e.repite && (
        <div className="et-dato">
          <ArrowsClockwise size={13} /> Se repite
        </div>
      )}
      <div className="et-acciones">
        {e.enlace && !cancelada && (
          <button className="et-unirse" onClick={() => api.abrirEnlace(e.enlace!)}>
            <VideoCamera size={14} weight="fill" /> Unirse{plataforma(e.enlace) ? ` a ${plataforma(e.enlace)!.nombre}` : ''}
          </button>
        )}
        {puedeResponder &&
          (['ACCEPTED', 'TENTATIVE', 'DECLINED'] as const).map((p) => (
            <button key={p} className={`et-resp${e.miRespuesta === p ? ' elegida' : ''}`} disabled={!!enviando} onClick={() => responder(p)}>
              {enviando === p ? '…' : { ACCEPTED: 'Aceptar', TENTATIVE: 'Quizá', DECLINED: 'Rechazar' }[p]}
            </button>
          ))}
        {e.mensaje && onAbrirCorreo && (
          <button className="et-correo" title="Ver el correo de la invitación" onClick={() => onAbrirCorreo(e.mensaje!)}>
            <EnvelopeSimple size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function Suscribir({ onCerrar }: { onCerrar: () => void }) {
  const ui = useInterfaz()
  const [nombre, setNombre] = useState('')
  const [url, setUrl] = useState('')
  const [estado, setEstado] = useState<string | null>(null)
  const enviar = async () => {
    setEstado('Comprobando el enlace…')
    try {
      const c = await api.suscribirCalendario(nombre, url)
      ui.avisar(`Calendario «${c.nombre}» añadido`)
      onCerrar()
    } catch (e) {
      setEstado((e as Error).message)
    }
  }
  return (
    <form
      className="cal-suscribir"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onCerrar())}
    >
      <div className="cs-titulo">Suscribirse a un calendario</div>
      <input placeholder="Nombre (Festivos, Personal…)" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      <input placeholder="Enlace iCal (https://… o webcal://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="cs-ayuda">En Google Calendar: Configuración del calendario → «Dirección secreta en formato iCal». Se guarda en el llavero.</div>
      {estado && <div className="cs-estado">{estado}</div>}
      <div className="cs-botones">
        <button type="button" onClick={onCerrar}>
          Cancelar
        </button>
        <button type="submit" className="destacado" disabled={!url.trim()}>
          Añadir
        </button>
      </div>
    </form>
  )
}

export function Calendario({ onCerrar, onAbrirCorreo }: { onCerrar: () => void; onAbrirCorreo: (id: string) => void }) {
  const ui = useInterfaz()
  const [modo, setModo] = useState<Modo>(() => {
    try {
      return (localStorage.getItem('calendarioModo') as Modo) || 'mes'
    } catch {
      return 'mes'
    }
  })
  const [ancla, setAncla] = useState(() => inicioDia(new Date())) // un día del mes o de la semana que se ve
  const [seleccion, setSeleccion] = useState(() => inicioDia(new Date()))
  const [calendarios, setCalendarios] = useState<CalendarioInfo[]>([])
  const [eventos, setEventos] = useState<Instancia[]>([])
  const [actualizando, setActualizando] = useState(false)
  const [suscribiendo, setSuscribiendo] = useState(false)
  const semanaRef = useRef<HTMLDivElement>(null)
  const hoy = inicioDia(new Date())

  // Días que se ven: 6 semanas en la vista mes (como en tu captura), 7 días en la semana.
  const dias = useMemo(() => {
    const primero = modo === 'mes' ? lunesDe(new Date(ancla.getFullYear(), ancla.getMonth(), 1)) : lunesDe(ancla)
    return Array.from({ length: modo === 'mes' ? 42 : 7 }, (_, i) => sumarDias(primero, i))
  }, [modo, ancla])

  const cargar = useCallback(async () => {
    const desde = dias[0].getTime()
    const hasta = sumarDias(dias[dias.length - 1], 1).getTime()
    const [c, e] = await Promise.all([api.calendarios(), api.eventos(desde, hasta)])
    setCalendarios(c)
    setEventos(e)
  }, [dias])

  useEffect(() => {
    cargar()
    return window.niebla.alCalendario(() => cargar())
  }, [cargar])

  // En la semana, se empieza viendo desde las 8:00.
  useEffect(() => {
    if (modo === 'semana' && semanaRef.current) semanaRef.current.scrollTop = HORA_PX * 7.5
  }, [modo])

  const mover = useCallback(
    (n: number) => {
      const nueva = modo === 'mes' ? new Date(ancla.getFullYear(), ancla.getMonth() + n, 1) : sumarDias(ancla, 7 * n)
      setAncla(nueva)
      setSeleccion(modo === 'mes' ? (nueva.getMonth() === hoy.getMonth() && nueva.getFullYear() === hoy.getFullYear() ? hoy : nueva) : sumarDias(seleccion, 7 * n))
    },
    [modo, ancla, seleccion, hoy],
  )

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowLeft') mover(-1)
      else if (e.key === 'ArrowRight') mover(1)
      else if (e.key.toLowerCase() === 't') (setAncla(hoy), setSeleccion(hoy))
      else if (e.key === 'Escape' && !suscribiendo) onCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const cambiarModo = (m: Modo) => {
    setModo(m)
    setAncla(seleccion)
    try {
      localStorage.setItem('calendarioModo', m)
    } catch {
      /* da igual */
    }
  }

  const actualizar = async () => {
    setActualizando(true)
    await api.actualizarCalendarios().catch(() => {})
    setActualizando(false)
  }

  const menuCalendario = (c: CalendarioInfo, x: number, y: number) =>
    ui.abrirMenu({
      x,
      y,
      elementos: [
        { etiqueta: c.visible ? 'Ocultar' : 'Mostrar', accion: () => api.mostrarCalendario(c.id, !c.visible).then(cargar) },
        ...(c.tipo === 'ical'
          ? [
              { etiqueta: 'Actualizar ahora', icono: <ArrowClockwise size={15} />, accion: () => api.actualizarCalendarios() },
              '-' as const,
              { etiqueta: `Quitar «${c.nombre}»`, icono: <Trash size={15} />, peligro: true, accion: () => api.quitarCalendario(c.id) },
            ]
          : []),
      ],
    })

  const titulo =
    modo === 'mes'
      ? `${ancla.toLocaleDateString('es-ES', { month: 'long' })} ${ancla.getFullYear()}`
      : `${dias[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${dias[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const delDia = eventos.filter((e) => tocaDia(e, seleccion))
  const sinActualizar = calendarios.filter((c) => c.error)

  return (
    <section className="calendario">
      <header className="cal-cabeza">
        <button className="cal-boton" title="Anterior (←)" onClick={() => mover(-1)}>
          <ArrowLeft size={17} />
        </button>
        <button className="cal-boton" title="Siguiente (→)" onClick={() => mover(1)}>
          <ArrowRight size={17} />
        </button>
        <button className="cal-hoy" onClick={() => (setAncla(hoy), setSeleccion(hoy))}>
          Hoy
        </button>
        <h1 className="cal-titulo">{titulo}</h1>
        <div className="cal-modo">
          {(['mes', 'semana'] as const).map((m) => (
            <button key={m} className={modo === m ? 'activo' : ''} onClick={() => cambiarModo(m)}>
              {m === 'mes' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>
        <div className="cal-pildoras">
          {calendarios.map((c) => (
            <button
              key={c.id}
              className={`cal-pildora${c.visible ? '' : ' apagada'}`}
              title={c.error ? `No se pudo actualizar: ${c.error}` : c.tipo === 'invitaciones' ? 'Invitaciones de esta cuenta' : 'Calendario suscrito'}
              style={{ '--color-cal': c.color } as React.CSSProperties}
              onClick={() => api.mostrarCalendario(c.id, !c.visible).then(cargar)}
              onContextMenu={(e) => {
                e.preventDefault()
                menuCalendario(c, e.clientX, e.clientY)
              }}
            >
              <span className="punto" /> {c.nombre}
            </button>
          ))}
        </div>
        <button className="cal-boton" title="Suscribirse a un calendario (enlace iCal)" onClick={() => setSuscribiendo(true)}>
          <Plus size={17} />
        </button>
        <button className={`cal-boton${actualizando ? ' girando' : ''}`} title="Actualizar los calendarios" onClick={actualizar}>
          <ArrowClockwise size={17} />
        </button>
        <button className="cal-boton" title="Volver al correo (Esc)" onClick={onCerrar}>
          <X size={17} />
        </button>
        {suscribiendo && <Suscribir onCerrar={() => setSuscribiendo(false)} />}
      </header>

      <div className="cal-cuerpo">
        {modo === 'mes' ? (
          <div className="cal-mes">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="cal-nombre-dia">
                {d}
              </div>
            ))}
            {dias.map((d) => {
              const delMes = d.getMonth() === ancla.getMonth()
              const evs = eventos.filter((e) => tocaDia(e, d))
              return (
                <div
                  key={d.getTime()}
                  className={`cal-dia${delMes ? '' : ' fuera'}${mismoDia(d, seleccion) ? ' elegido' : ''}${mismoDia(d, hoy) ? ' hoy' : ''}${evs.length && !delMes ? ' con-eventos' : ''}`}
                  onClick={() => setSeleccion(d)}
                  onDoubleClick={() => (setSeleccion(d), cambiarModo('semana'))}
                >
                  <span className="cal-numero">{d.getDate()}</span>
                  {evs.slice(0, 3).map((e) => (
                    <span
                      key={e.clave}
                      className={`cal-chip${e.todoElDia ? ' todo-dia' : ''}${e.estado === 'cancelado' ? ' cancelado' : ''}${e.miRespuesta === 'DECLINED' ? ' rechazado' : ''}${e.miRespuesta === 'NEEDS-ACTION' ? ' pendiente' : ''}`}
                      style={{ '--color-cal': colorDe(e) } as React.CSSProperties}
                      title={`${e.todoElDia ? '' : hora(e.inicio) + ' '}${e.titulo}`}
                    >
                      {!e.todoElDia && <b>{hora(e.inicio)}</b>} {e.titulo}
                    </span>
                  ))}
                  {evs.length > 3 && <span className="cal-mas">+{evs.length - 3} más</span>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="cal-semana">
            <div className="cs-cabecera">
              <div />
              {dias.map((d) => (
                <button key={d.getTime()} className={`cs-dia${mismoDia(d, hoy) ? ' hoy' : ''}${mismoDia(d, seleccion) ? ' elegido' : ''}`} onClick={() => setSeleccion(d)}>
                  {DIAS_SEMANA[(d.getDay() + 6) % 7]} <b>{d.getDate()}</b>
                </button>
              ))}
              <div className="cs-etiqueta">todo el día</div>
              {dias.map((d) => (
                <div key={d.getTime()} className="cs-todo-dia">
                  {eventos
                    .filter((e) => e.todoElDia && tocaDia(e, d))
                    .map((e) => (
                      <span key={e.clave} className="cal-chip todo-dia" style={{ '--color-cal': colorDe(e) } as React.CSSProperties}>
                        {e.titulo}
                      </span>
                    ))}
                </div>
              ))}
            </div>
            <div className="cs-rejilla" ref={semanaRef}>
              <div className="cs-horas">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="cs-hora" style={{ height: HORA_PX }}>
                    {h ? `${String(h).padStart(2, '0')}:00` : ''}
                  </div>
                ))}
              </div>
              {dias.map((d) => {
                const evs = eventos.filter((e) => !e.todoElDia && tocaDia(e, d))
                // Los que se solapan, en carriles.
                const carriles: number[] = []
                const puestos = evs.map((e) => {
                  let c = carriles.findIndex((finCarril) => finCarril <= e.inicio)
                  if (c < 0) c = carriles.push(0) - 1
                  carriles[c] = e.fin
                  return { e, c }
                })
                const ancho = 100 / Math.max(1, carriles.length)
                return (
                  <div key={d.getTime()} className={`cs-columna${mismoDia(d, hoy) ? ' hoy' : ''}`} onClick={() => setSeleccion(d)}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="cs-franja" style={{ height: HORA_PX }} />
                    ))}
                    {mismoDia(d, hoy) && <div className="cs-ahora" style={{ top: ((Date.now() - d.getTime()) / 3_600_000) * HORA_PX }} />}
                    {puestos.map(({ e, c }) => {
                      const ini = Math.max(e.inicio, d.getTime())
                      const fin = Math.min(Math.max(e.fin, e.inicio + 15 * 60000), d.getTime() + DIA)
                      const alto = Math.max(18, ((fin - ini) / 3_600_000) * HORA_PX - 2)
                      return (
                        <div
                          key={e.clave}
                          className={`cs-evento${alto < 36 ? ' corto' : ''}${e.estado === 'cancelado' ? ' cancelado' : ''}${e.miRespuesta === 'NEEDS-ACTION' ? ' pendiente' : ''}${e.miRespuesta === 'DECLINED' ? ' rechazado' : ''}`}
                          style={{
                            '--color-cal': colorDe(e),
                            top: ((ini - d.getTime()) / 3_600_000) * HORA_PX,
                            height: alto,
                            left: `calc(${c * ancho}% + 2px)`,
                            width: `calc(${ancho}% - 4px)`,
                          } as React.CSSProperties}
                          title={`${hora(e.inicio)}–${hora(e.fin)} ${e.titulo}`}
                        >
                          <b>{hora(e.inicio)}</b> {e.titulo}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <aside className="cal-panel">
          <div className="cp-numero">{seleccion.getDate()}</div>
          <div className="cp-fecha">
            {seleccion.toLocaleDateString('es-ES', { weekday: 'long' })}, {seleccion.toLocaleDateString('es-ES', { month: 'long' })} {seleccion.getFullYear()}
          </div>
          <div className="cp-lista">
            {delDia.length ? delDia.map((e) => <TarjetaEvento key={e.clave} e={e} onAbrirCorreo={onAbrirCorreo} />) : <div className="cp-vacio">Sin eventos</div>}
          </div>
        </aside>
      </div>
      <footer className="cal-pie">
        {calendarios.length === 0
          ? 'Las invitaciones que te lleguen por correo aparecerán aquí. Con «+» puedes suscribirte a otros calendarios por su enlace iCal.'
          : sinActualizar.length
            ? `No se pudo actualizar: ${sinActualizar.map((c) => c.nombre).join(', ')}`
            : `${calendarios.length} ${calendarios.length === 1 ? 'calendario' : 'calendarios'} · las reuniones también se exportan para otros calendarios del escritorio`}
      </footer>
    </section>
  )
}

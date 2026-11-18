import { useEffect, useState } from 'react'
import { CalendarBlank, Columns, GearSix, Info, Key, Rows, SidebarSimple, Trash, UserCircle, X } from '@phosphor-icons/react'
import { AVISOS, type CalendarioInfo, type Carpeta, type Cuenta, type Datos } from '@shared/tipos'
import { api } from '@/estado'
import { ACENTOS, SelectorAcento, type AcentoId } from '@/components/Acento'
import type { Disposicion } from '@/components/Toolbar'

type Seccion = 'general' | 'barra' | 'cuentas' | 'calendario' | 'acerca'

// Lo que se puede ocultar de Favoritos y de Buzones inteligentes.
export const FAVORITOS: { clave: string; texto: string }[] = [
  { clave: 'fav:todas', texto: 'Todas las bandejas' },
  { clave: 'fav:marcados', texto: 'Marcados' },
  { clave: 'fav:borradores', texto: 'Todos los borradores' },
  { clave: 'fav:enviados', texto: 'Todos los enviados' },
  { clave: 'fav:calendario', texto: 'Calendario' },
  { clave: 'fav:hoy', texto: 'Hoy (buzón inteligente)' },
  { clave: 'fav:suscripciones', texto: 'Suscripciones (boletines)' },
]
export const claveCarpeta = (c: Carpeta) => `carpeta:${c.id}`

const ORDEN_ROL = ['inbox', 'drafts', 'sent', 'junk', 'trash', 'archive', 'all', 'normal']

function Interruptor({ activo, onCambiar, etiqueta }: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <label className="aj-interruptor">
      <span>{etiqueta}</span>
      <button type="button" role="switch" aria-checked={activo} className={activo ? 'encendido' : ''} onClick={() => onCambiar(!activo)}>
        <span />
      </button>
    </label>
  )
}

export function Ajustes(p: {
  datos: Datos
  acento: AcentoId
  onAcento: (a: AcentoId) => void
  disposicion: Disposicion
  onDisposicion: (d: Disposicion) => void
  traducirSiempre: boolean
  onTraducirSiempre: (v: boolean) => void
  ocultos: Set<string>
  onOcultos: (s: Set<string> | ((previo: Set<string>) => Set<string>)) => void
  onAnadirCuenta: () => void
  onClave: (cuenta: string) => void
  avisar: (t: string) => void
  onCerrar: () => void
}) {
  const [seccion, setSeccion] = useState<Seccion>('general')
  const [calendarios, setCalendarios] = useState<CalendarioInfo[]>([])
  const [quitando, setQuitando] = useState<string | null>(null)
  const [avisoReuniones, setAvisoReuniones] = useState<number | null>(null)
  useEffect(() => {
    api.avisoReuniones().then(setAvisoReuniones, () => {})
  }, [])

  useEffect(() => {
    const cargar = () => api.calendarios().then(setCalendarios, () => {})
    cargar()
    return window.niebla.alCalendario(cargar)
  }, [])

  const visible = (clave: string) => !p.ocultos.has(clave)
  const alternar = (clave: string, v: boolean) =>
    p.onOcultos((previo) => {
      const n = new Set(previo)
      if (v) n.delete(clave)
      else n.add(clave)
      return n
    })
  const carpetasDe = (c: Cuenta) =>
    p.datos.carpetas
      .filter((f) => f.cuenta === c.id)
      .sort((a, b) => ORDEN_ROL.indexOf(a.rol) - ORDEN_ROL.indexOf(b.rol) || a.nombre.localeCompare(b.nombre))

  const SECCIONES: { id: Seccion; texto: string; icono: typeof GearSix }[] = [
    { id: 'general', texto: 'General', icono: GearSix },
    { id: 'barra', texto: 'Barra lateral', icono: SidebarSimple },
    { id: 'cuentas', texto: 'Cuentas', icono: UserCircle },
    { id: 'calendario', texto: 'Calendario', icono: CalendarBlank },
    { id: 'acerca', texto: 'Acerca de', icono: Info },
  ]

  return (
    <div className="redactar-fondo" onMouseDown={(e) => e.target === e.currentTarget && p.onCerrar()}>
      <div className="ajustes" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), p.onCerrar())} tabIndex={-1}>
        <nav className="aj-nav">
          <div className="aj-titulo">Ajustes</div>
          {SECCIONES.map((s) => (
            <button key={s.id} className={seccion === s.id ? 'activa' : ''} onClick={() => setSeccion(s.id)}>
              <s.icono size={16} /> {s.texto}
            </button>
          ))}
        </nav>
        <div className="aj-contenido">
          <button className="aj-cerrar" onClick={p.onCerrar} aria-label="Cerrar">
            <X size={15} />
          </button>

          {seccion === 'general' && (
            <>
              <h2>General</h2>
              <div className="aj-grupo">
                <SelectorAcento acento={p.acento} onCambiar={p.onAcento} />
              </div>
              <div className="aj-grupo">
                <div className="aj-etiqueta">Disposición</div>
                <div className="aj-opciones">
                  <button className={p.disposicion === 'columnas' ? 'elegida' : ''} onClick={() => p.onDisposicion('columnas')}>
                    <Columns size={18} /> Lista y lector en columnas
                  </button>
                  <button className={p.disposicion === 'ancha' ? 'elegida' : ''} onClick={() => p.onDisposicion('ancha')}>
                    <Rows size={18} /> Lista ancha
                  </button>
                </div>
              </div>
              <div className="aj-grupo">
                <Interruptor etiqueta="Traducir siempre los correos en inglés" activo={p.traducirSiempre} onCambiar={p.onTraducirSiempre} />
                <div className="aj-nota">Se traducen en este equipo con el motor de Firefox Translations. Atajo: Ctrl+Shift+T.</div>
              </div>
            </>
          )}

          {seccion === 'barra' && (
            <>
              <h2>Barra lateral</h2>
              <p className="aj-nota">Elige qué se ve. También puedes ocultar una carpeta con clic derecho sobre ella.</p>
              <div className="aj-grupo">
                <div className="aj-etiqueta">Favoritos</div>
                {FAVORITOS.map((f) => (
                  <Interruptor key={f.clave} etiqueta={f.texto} activo={visible(f.clave)} onCambiar={(v) => alternar(f.clave, v)} />
                ))}
              </div>
              {p.datos.cuentas.map((c) => (
                <div className="aj-grupo" key={c.id}>
                  <div className="aj-etiqueta">{c.nombre}</div>
                  {carpetasDe(c).map((f) => (
                    <Interruptor key={f.id} etiqueta={f.nombre} activo={visible(claveCarpeta(f))} onCambiar={(v) => alternar(claveCarpeta(f), v)} />
                  ))}
                </div>
              ))}
              {p.ocultos.size > 0 && (
                <button className="aj-boton" onClick={() => p.onOcultos(new Set())}>
                  Mostrar todo otra vez
                </button>
              )}
            </>
          )}

          {seccion === 'cuentas' && (
            <>
              <h2>Cuentas</h2>
              {p.datos.cuentas.map((c) => {
                const estado = p.datos.estados.find((e) => e.id === c.id)
                return (
                  <div className="aj-cuenta" key={c.id}>
                    <div className="aj-cuenta-datos">
                      <b>{c.nombre}</b>
                      <span>
                        {c.direccion} · {c.auth === 'clave' ? 'contraseña' : `inicio de sesión con ${c.auth === 'microsoft' ? 'Microsoft' : 'Google'}`}
                        {estado && estado.estado !== 'listo' ? ` · ${estado.estado === 'sin-clave' ? 'falta la contraseña' : estado.estado === 'conectando' ? 'conectando…' : 'sin conexión'}` : ''}
                      </span>
                    </div>
                    <button className="aj-boton" onClick={() => (c.auth === 'clave' ? p.onClave(c.id) : api.volverAEntrar(c.id).catch((e: Error) => p.avisar(e.message)))}>
                      <Key size={14} /> {c.auth === 'clave' ? 'Contraseña' : 'Volver a entrar'}
                    </button>
                    {quitando === c.id ? (
                      <button
                        className="aj-boton peligro"
                        onClick={async () => {
                          await api.quitarCuenta(c.id)
                          setQuitando(null)
                          p.avisar(`«${c.nombre}» quitada de TuxMail`)
                        }}
                      >
                        ¿Seguro? Quitar
                      </button>
                    ) : (
                      <button className="aj-boton" title="Quitar de TuxMail (el correo sigue en el servidor)" onClick={() => setQuitando(c.id)}>
                        <Trash size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
              <button className="aj-boton destacado" onClick={p.onAnadirCuenta}>
                Añadir cuenta
              </button>
              <p className="aj-nota">Quitar una cuenta borra de este equipo su configuración, su contraseña y su copia del correo. No toca nada del servidor.</p>
            </>
          )}

          {seccion === 'calendario' && (
            <>
              <h2>Calendario</h2>
              <div className="aj-grupo">
                <label className="aj-interruptor">
                  <span>Aviso por defecto de las reuniones (invitaciones)</span>
                  <select
                    className="aj-select"
                    value={avisoReuniones ?? 10}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setAvisoReuniones(v)
                      api.ponerAvisoReuniones(v)
                    }}
                  >
                    <option value={-1}>Sin aviso</option>
                    {AVISOS.filter((a) => a.minutos <= 1440).map((a) => (
                      <option key={a.minutos} value={a.minutos}>
                        {a.minutos === 0 ? a.texto : `${a.texto} antes`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="aj-nota">Cada evento puede tener los suyos con la campana. Los avisos salen como notificación del sistema.</div>
              </div>
              {calendarios.length === 0 && <p className="aj-nota">Todavía no hay calendarios: las invitaciones que te lleguen por correo aparecerán solas.</p>}
              {calendarios.map((c) => (
                <div className="aj-cuenta" key={c.id}>
                  <span className="aj-punto" style={{ background: c.color }} />
                  <div className="aj-cuenta-datos">
                    <b>{c.nombre}</b>
                    <span>
                      {c.tipo === 'invitaciones' ? 'Invitaciones recibidas por correo' : 'Calendario suscrito (iCal)'}
                      {c.error ? ` · error: ${c.error}` : c.actualizado ? ` · actualizado ${new Date(c.actualizado).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                  </div>
                  <div className="aj-colores" title="Color del calendario">
                    {[...new Set(['#c8ccd0', '#8b98a6', ...ACENTOS.map((a) => a.color)])].map((col) => (
                      <button
                        key={col}
                        className={c.color.toLowerCase() === col.toLowerCase() ? 'elegido' : ''}
                        style={{ background: col }}
                        aria-label={`Color ${col}`}
                        onClick={() => api.colorCalendario(c.id, col).then(() => api.calendarios().then(setCalendarios))}
                      />
                    ))}
                  </div>
                  <Interruptor etiqueta="" activo={c.visible} onCambiar={(v) => api.mostrarCalendario(c.id, v).then(() => api.calendarios().then(setCalendarios))} />
                  {c.tipo === 'ical' && (
                    <button className="aj-boton" title="Quitar la suscripción" onClick={() => api.quitarCalendario(c.id)}>
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              ))}
              <p className="aj-nota">
                Las reuniones se colorean según su plataforma: Google Meet en verde, Teams en morado, Zoom en azul y Webex en naranja. El
                resto toma el color de su calendario.
              </p>
              <p className="aj-nota">
                Para suscribirte a otro calendario, pulsa «+» en la vista Calendario. Las reuniones se exportan a ~/.local/share/tuxmail/calendario.ics para otros calendarios del escritorio.
              </p>
            </>
          )}

          {seccion === 'acerca' && (
            <>
              <h2>TuxMail</h2>
              <p className="aj-nota">Cliente de correo para Linux: rápido, minimalista y privado. Software libre bajo la licencia GNU GPL v3 o posterior.</p>
              <button className="aj-boton" onClick={() => api.abrirEnlace('https://github.com/hxst1/tuxmail')}>
                Código fuente en GitHub
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { CalendarBlank, Columns, GearSix, Info, Key, Rows, SidebarSimple, Trash, UserCircle, X } from '@phosphor-icons/react'
import { AVISOS, textoAviso, type CalendarioInfo, type Carpeta, type Cuenta, type Datos } from '@shared/tipos'
import { IDIOMAS, opcionesHora, type PreferenciaIdioma, type Textos } from '@shared/i18n'
import { api } from '@/estado'
import { useIdioma, useT } from '@/i18n'
import { ACENTOS, SelectorAcento, type AcentoId } from '@/components/Acento'
import type { Disposicion } from '@/components/Toolbar'
import { Desplegable } from '@/components/Desplegable'

type Seccion = 'general' | 'barra' | 'cuentas' | 'calendario' | 'acerca'

// Lo que se puede ocultar de Favoritos y de Buzones inteligentes, con su nombre en el idioma de `t`.
export const favoritos = (t: Textos): { clave: string; texto: string }[] => [
  { clave: 'fav:todas', texto: t.comun.buzones.todasBandejas },
  { clave: 'fav:marcados', texto: t.comun.buzones.marcados },
  { clave: 'fav:borradores', texto: t.comun.buzones.todosBorradores },
  { clave: 'fav:enviados', texto: t.comun.buzones.todosEnviados },
  { clave: 'fav:calendario', texto: t.comun.buzones.calendario },
  { clave: 'fav:hoy', texto: t.ajustes.barra.hoy },
  { clave: 'fav:suscripciones', texto: t.ajustes.barra.suscripciones },
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
  const t = useT()
  const idioma = useIdioma()
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
    { id: 'general', texto: t.ajustes.secciones.general, icono: GearSix },
    { id: 'barra', texto: t.ajustes.secciones.barra, icono: SidebarSimple },
    { id: 'cuentas', texto: t.ajustes.secciones.cuentas, icono: UserCircle },
    { id: 'calendario', texto: t.ajustes.secciones.calendario, icono: CalendarBlank },
    { id: 'acerca', texto: t.ajustes.secciones.acerca, icono: Info },
  ]

  // «Automático» primero (con el idioma al que corresponde, si es el elegido) y luego cada idioma con su nombre.
  const opcionesIdioma: { valor: PreferenciaIdioma; texto: string }[] = [
    {
      valor: 'auto',
      texto: idioma.preferencia === 'auto' ? t.ajustes.general.idiomaAutoCon(t.ajustes.general.nombresIdioma[idioma.idioma]) : t.ajustes.general.idiomaAuto,
    },
    ...IDIOMAS.map((i) => ({ valor: i.id, texto: i.nombre })),
  ]

  return (
    <div className="redactar-fondo" onMouseDown={(e) => e.target === e.currentTarget && p.onCerrar()}>
      <div className="ajustes" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), p.onCerrar())} tabIndex={-1}>
        <nav className="aj-nav">
          <div className="aj-titulo">{t.ajustes.titulo}</div>
          {SECCIONES.map((s) => (
            <button key={s.id} className={seccion === s.id ? 'activa' : ''} onClick={() => setSeccion(s.id)}>
              <s.icono size={16} /> {s.texto}
            </button>
          ))}
        </nav>
        <div className="aj-contenido">
          <button className="aj-cerrar" onClick={p.onCerrar} aria-label={t.comun.acciones.cerrar}>
            <X size={15} />
          </button>

          {seccion === 'general' && (
            <>
              <h2>{t.ajustes.secciones.general}</h2>
              <div className="aj-grupo">
                <div className="aj-fila">
                  <span>{t.ajustes.general.idioma}</span>
                  <Desplegable<PreferenciaIdioma> valor={idioma.preferencia} onCambiar={(v) => api.ponerIdioma(v)} opciones={opcionesIdioma} />
                </div>
                <div className="aj-nota">{t.ajustes.general.notaIdioma}</div>
              </div>
              <div className="aj-grupo">
                <SelectorAcento acento={p.acento} onCambiar={p.onAcento} />
              </div>
              <div className="aj-grupo">
                <div className="aj-etiqueta">{t.ajustes.general.disposicion}</div>
                <div className="aj-opciones">
                  <button className={p.disposicion === 'columnas' ? 'elegida' : ''} onClick={() => p.onDisposicion('columnas')}>
                    <Columns size={18} /> {t.ajustes.general.columnas}
                  </button>
                  <button className={p.disposicion === 'ancha' ? 'elegida' : ''} onClick={() => p.onDisposicion('ancha')}>
                    <Rows size={18} /> {t.ajustes.general.ancha}
                  </button>
                </div>
              </div>
              {/* El único modelo de traducción es inglés → español: solo con la app en español. */}
              {idioma.idioma === 'es' && (
                <div className="aj-grupo">
                  <Interruptor etiqueta={t.ajustes.general.traducirSiempre} activo={p.traducirSiempre} onCambiar={p.onTraducirSiempre} />
                  <div className="aj-nota">{t.ajustes.general.notaTraducir}</div>
                </div>
              )}
            </>
          )}

          {seccion === 'barra' && (
            <>
              <h2>{t.ajustes.secciones.barra}</h2>
              <p className="aj-nota">{t.ajustes.barra.nota}</p>
              <div className="aj-grupo">
                <div className="aj-etiqueta">{t.comun.buzones.favoritos}</div>
                {favoritos(t).map((f) => (
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
                  {t.ajustes.barra.mostrarTodo}
                </button>
              )}
            </>
          )}

          {seccion === 'cuentas' && (
            <>
              <h2>{t.ajustes.secciones.cuentas}</h2>
              {p.datos.cuentas.map((c) => {
                const estado = p.datos.estados.find((e) => e.id === c.id)
                return (
                  <div className="aj-cuenta" key={c.id}>
                    <div className="aj-cuenta-datos">
                      <b>{c.nombre}</b>
                      <span>
                        {c.direccion} · {c.auth === 'clave' ? t.ajustes.cuentas.clave : t.ajustes.cuentas.oauth(c.auth === 'microsoft' ? 'Microsoft' : 'Google')}
                        {estado && estado.estado !== 'listo'
                          ? ` · ${estado.estado === 'sin-clave' ? t.ajustes.cuentas.sinClave : estado.estado === 'conectando' ? t.ajustes.cuentas.conectando : t.ajustes.cuentas.sinConexion}`
                          : ''}
                      </span>
                    </div>
                    <button className="aj-boton" onClick={() => (c.auth === 'clave' ? p.onClave(c.id) : api.volverAEntrar(c.id).catch((e: Error) => p.avisar(e.message)))}>
                      <Key size={14} /> {c.auth === 'clave' ? t.ajustes.cuentas.botonClave : t.ajustes.cuentas.volverAEntrar}
                    </button>
                    {quitando === c.id ? (
                      <button
                        className="aj-boton peligro"
                        onClick={async () => {
                          await api.quitarCuenta(c.id)
                          setQuitando(null)
                          p.avisar(t.ajustes.cuentas.quitada(c.nombre))
                        }}
                      >
                        {t.ajustes.cuentas.confirmarQuitar}
                      </button>
                    ) : (
                      <button className="aj-boton" title={t.ajustes.cuentas.quitarTitulo} onClick={() => setQuitando(c.id)}>
                        <Trash size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
              <button className="aj-boton destacado" onClick={p.onAnadirCuenta}>
                {t.ajustes.cuentas.anadir}
              </button>
              <p className="aj-nota">{t.ajustes.cuentas.nota}</p>
            </>
          )}

          {seccion === 'calendario' && (
            <>
              <h2>{t.ajustes.secciones.calendario}</h2>
              <div className="aj-grupo">
                <div className="aj-fila">
                  <span>{t.ajustes.calendario.avisoReuniones}</span>
                  <Desplegable<number>
                    valor={avisoReuniones ?? 10}
                    onCambiar={(v) => {
                      setAvisoReuniones(v)
                      api.ponerAvisoReuniones(v)
                    }}
                    opciones={[
                      { valor: -1, texto: t.ajustes.calendario.sinAviso },
                      ...AVISOS.filter((m) => m <= 1440).map((m) => ({ valor: m, texto: m === 0 ? textoAviso(m, t) : t.ajustes.calendario.antes(textoAviso(m, t)) })),
                    ]}
                  />
                </div>
                <div className="aj-nota">{t.ajustes.calendario.notaAvisos}</div>
              </div>
              {calendarios.length === 0 && <p className="aj-nota">{t.ajustes.calendario.sinCalendarios}</p>}
              {calendarios.map((c) => (
                <div className="aj-cuenta" key={c.id}>
                  <span className="aj-punto" style={{ background: c.color }} />
                  <div className="aj-cuenta-datos">
                    <b>{c.nombre}</b>
                    <span>
                      {c.tipo === 'invitaciones' ? t.ajustes.calendario.invitaciones : c.tipo === 'propio' ? t.ajustes.calendario.propio : t.ajustes.calendario.ical}
                      {c.error
                        ? ` · ${t.ajustes.calendario.error(c.error)}`
                        : c.actualizado
                          ? ` · ${t.ajustes.calendario.actualizado(new Date(c.actualizado).toLocaleString(idioma.locale, { day: 'numeric', month: 'short', ...opcionesHora(idioma.locale) }))}`
                          : ''}
                    </span>
                  </div>
                  <div className="aj-colores" title={t.ajustes.calendario.color}>
                    {[...new Set(['#c8ccd0', '#8b98a6', ...ACENTOS.map((a) => a.color)])].map((col) => (
                      <button
                        key={col}
                        className={c.color.toLowerCase() === col.toLowerCase() ? 'elegido' : ''}
                        style={{ background: col }}
                        aria-label={t.ajustes.calendario.colorDe(col)}
                        onClick={() => api.colorCalendario(c.id, col).then(() => api.calendarios().then(setCalendarios))}
                      />
                    ))}
                  </div>
                  <Interruptor etiqueta="" activo={c.visible} onCambiar={(v) => api.mostrarCalendario(c.id, v).then(() => api.calendarios().then(setCalendarios))} />
                  {c.tipo === 'ical' && (
                    <button className="aj-boton" title={t.ajustes.calendario.quitarSuscripcion} onClick={() => api.quitarCalendario(c.id)}>
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              ))}
              <p className="aj-nota">{t.ajustes.calendario.notaColores}</p>
              <p className="aj-nota">{t.ajustes.calendario.notaSuscribir}</p>
            </>
          )}

          {seccion === 'acerca' && (
            <>
              <h2>{t.comun.app}</h2>
              <p className="aj-nota">{t.ajustes.acerca.descripcion}</p>
              <button className="aj-boton" onClick={() => api.abrirEnlace('https://github.com/hxst1/nimbomail')}>
                {t.ajustes.acerca.codigo}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

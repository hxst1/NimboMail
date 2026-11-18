import { useState } from 'react'
import { Bell, CalendarPlus, EnvelopeSimple, Trash, X } from '@phosphor-icons/react'
import { AVISOS, type Instancia } from '@shared/tipos'
import { api } from '@/estado'

/** Datos para empezar un evento nuevo (desde un día del calendario o desde un correo). */
export interface NuevoEvento {
  inicio?: number
  todoElDia?: boolean
  titulo?: string
  nota?: string
  mensaje?: string | null
  asuntoCorreo?: string
}

const dosCifras = (n: number) => String(n).padStart(2, '0')
const aFecha = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`
}
const aHora = (ms: number) => {
  const d = new Date(ms)
  return `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`
}
const deFechaHora = (fecha: string, hora = '00:00') => {
  const [a, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  return new Date(a, (m || 1) - 1, d || 1, h || 0, mi || 0).getTime()
}

/** La próxima hora en punto (o las 10:00 de otro día). */
function inicioPorDefecto(dia?: number): number {
  const ahora = new Date()
  if (dia !== undefined) {
    const d = new Date(dia)
    const esHoy = d.toDateString() === ahora.toDateString()
    if (d.getHours() || d.getMinutes()) return dia // ya trae hora (doble clic en la semana)
    if (!esHoy) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10).getTime()
  }
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), ahora.getHours() + 1).getTime()
}

export function EditorEvento({
  existente,
  nuevo,
  onCerrar,
  avisar,
}: {
  existente?: Instancia // evento propio que se edita
  nuevo?: NuevoEvento
  onCerrar: () => void
  avisar: (t: string) => void
}) {
  const ini = existente?.inicio ?? inicioPorDefecto(nuevo?.inicio)
  const [titulo, setTitulo] = useState(existente?.titulo ?? nuevo?.titulo ?? '')
  const [todoElDia, setTodoElDia] = useState(existente?.todoElDia ?? nuevo?.todoElDia ?? false)
  const [fecha, setFecha] = useState(aFecha(ini))
  const [fechaFin, setFechaFin] = useState(aFecha(existente ? (existente.todoElDia ? existente.fin - 86_400_000 : existente.fin) : ini))
  const [horaIni, setHoraIni] = useState(aHora(ini))
  const [horaFin, setHoraFin] = useState(aHora(existente?.fin ?? ini + 3_600_000))
  const [lugar, setLugar] = useState(existente?.lugar ?? '')
  const [nota, setNota] = useState(existente?.descripcion ?? nuevo?.nota ?? '')
  const [avisos, setAvisos] = useState<number[]>(existente?.avisos ?? [todoElDia ? 0 : 10])
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  const mensaje = existente?.mensaje ?? nuevo?.mensaje ?? null

  const guardar = async () => {
    const inicio = deFechaHora(fecha, todoElDia ? '00:00' : horaIni)
    let fin = todoElDia ? deFechaHora(fechaFin < fecha ? fecha : fechaFin) : deFechaHora(fecha, horaFin)
    if (!todoElDia && fin <= inicio) fin += 86_400_000 // de 23:00 a 01:00: acaba al día siguiente
    try {
      await api.guardarEvento({ id: existente?.id ?? null, titulo, inicio, fin, todoElDia, lugar, nota, mensaje, avisos })
      avisar(existente ? 'Evento guardado' : 'Evento creado')
      onCerrar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const borrar = async () => {
    if (!existente) return
    if (!borrando) return setBorrando(true)
    await api.borrarEvento(existente.id)
    avisar('Evento borrado')
    onCerrar()
  }

  const alternarAviso = (m: number) => setAvisos((a) => (a.includes(m) ? a.filter((x) => x !== m) : [...a, m].sort((x, y) => x - y)))

  return (
    <div className="redactar-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form
        className="editor-evento"
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.stopPropagation(), onCerrar())
          if (e.key === 'Enter' && e.ctrlKey) (e.preventDefault(), guardar())
        }}
      >
        <header className="ee-cabeza">
          <CalendarPlus size={18} />
          <span>{existente ? 'Editar evento' : 'Nuevo evento'}</span>
          <button type="button" className="ee-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={15} />
          </button>
        </header>

        <input className="ee-titulo" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />

        <label className="ee-fila">
          <span>Todo el día</span>
          <button type="button" role="switch" aria-checked={todoElDia} className={`ee-interruptor${todoElDia ? ' encendido' : ''}`} onClick={() => setTodoElDia((v) => !v)}>
            <span />
          </button>
        </label>

        <div className="ee-fila">
          <span>{todoElDia ? 'Desde' : 'Día'}</span>
          <input type="date" value={fecha} onChange={(e) => (setFecha(e.target.value), fechaFin < e.target.value && setFechaFin(e.target.value))} />
        </div>
        {todoElDia ? (
          <div className="ee-fila">
            <span>Hasta</span>
            <input type="date" value={fechaFin} min={fecha} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
        ) : (
          <div className="ee-fila">
            <span>Hora</span>
            <div className="ee-horas">
              <input
                type="time"
                value={horaIni}
                onChange={(e) => {
                  // Al mover el inicio se conserva la duración.
                  const dur = deFechaHora(fecha, horaFin) - deFechaHora(fecha, horaIni)
                  setHoraIni(e.target.value)
                  setHoraFin(aHora(deFechaHora(fecha, e.target.value) + Math.max(dur, 15 * 60_000)))
                }}
              />
              <span>–</span>
              <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
            </div>
          </div>
        )}

        <input className="ee-campo" placeholder="Lugar o enlace de la videollamada" value={lugar} onChange={(e) => setLugar(e.target.value)} />
        <textarea className="ee-campo ee-nota" placeholder="Nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />

        <div className="ee-avisos">
          <div className="ee-etiqueta">
            <Bell size={14} /> Avisos {todoElDia && <span className="ee-sub">(cuentan desde las 9:00 del día)</span>}
          </div>
          <div className="ee-fichas">
            {AVISOS.map((a) => (
              <button type="button" key={a.minutos} className={avisos.includes(a.minutos) ? 'elegido' : ''} onClick={() => alternarAviso(a.minutos)}>
                {a.minutos === 0 ? a.texto : `${a.texto} antes`}
              </button>
            ))}
          </div>
        </div>

        {mensaje && (
          <div className="ee-correo">
            <EnvelopeSimple size={14} /> Enlazado al correo{nuevo?.asuntoCorreo ? ` «${nuevo.asuntoCorreo}»` : ''}
          </div>
        )}
        {error && <div className="nc-fallo">{error}</div>}

        <footer className="ee-pie">
          {existente && (
            <button type="button" className={`ee-borrar${borrando ? ' seguro' : ''}`} onClick={borrar}>
              <Trash size={14} /> {borrando ? '¿Seguro? Borrar' : 'Borrar'}
            </button>
          )}
          <span className="ee-hueco" />
          <button type="button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="destacado">
            {existente ? 'Guardar' : 'Crear evento'}
          </button>
        </footer>
      </form>
    </div>
  )
}

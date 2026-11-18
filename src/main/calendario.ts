// Calendario de TuxMail: invitaciones que llegan por correo (iMIP) y calendarios suscritos por enlace
// iCal (solo lectura). Todo en la misma SQLite; los enlaces, en el llavero (suelen ser secretos).
import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CalendarioInfo, Instancia } from '@shared/tipos'
import type { Db } from './db'
import { borrarSecreto, guardarSecreto, secreto } from './cuentas'
import { calendario as envolver, eventoExportado, leerEventos, leerIcs, repeticiones, type EventoIcs } from './ics'

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS calendarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,           -- invitaciones | ical
  cuenta TEXT,                  -- la cuenta de correo (invitaciones)
  color TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  actualizado INTEGER,
  error TEXT
);
CREATE TABLE IF NOT EXISTS eventos (
  id TEXT PRIMARY KEY,
  calendario TEXT NOT NULL REFERENCES calendarios(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  recurrencia INTEGER,          -- RECURRENCE-ID: sustituye a esa repetición
  datos TEXT NOT NULL,          -- el evento entero (JSON)
  inicio INTEGER NOT NULL,
  fin INTEGER NOT NULL,
  rrule TEXT,
  mi_respuesta TEXT,            -- NEEDS-ACTION | ACCEPTED | TENTATIVE | DECLINED | ORGANIZADOR
  mensaje TEXT,                 -- último correo que la trajo
  fecha_correo INTEGER
);
CREATE INDEX IF NOT EXISTS eventos_calendario ON eventos(calendario, inicio);
-- Respuestas que mandé yo (METHOD:REPLY en Enviados), por si llegan antes que la invitación.
CREATE TABLE IF NOT EXISTS respuestas_enviadas (
  clave TEXT PRIMARY KEY,       -- calendario:uid:recurrencia
  respuesta TEXT NOT NULL,
  fecha INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invitaciones_correo (
  mensaje TEXT PRIMARY KEY,
  evento TEXT NOT NULL
);
`

// Colores de la paleta Niebla primero; luego los de resaltado.
const COLORES = ['#c8ccd0', '#8b98a6', '#a37ad6', '#4f8fe6', '#55a868', '#d9873f', '#d9558f']
const MAX_FEED = 15 * 1024 * 1024
const CADA = 30 * 60_000

interface Fila {
  id: string
  calendario: string
  uid: string
  recurrencia: number | null
  datos: string
  inicio: number
  fin: number
  rrule: string | null
  mi_respuesta: string | null
  mensaje: string | null
  fecha_correo: number | null
  tipo?: string
  cuenta?: string | null
}

const claveSecreto = (id: string) => `calendario:${id}`

export class Calendario extends EventEmitter {
  private aviso: NodeJS.Timeout | null = null
  private temporizador: NodeJS.Timeout | null = null

  constructor(
    private db: Db,
    private dirExportar: string | null, // null en la demo: no se escribe nada
  ) {
    super()
    db.sql.exec(ESQUEMA)
  }

  arrancar() {
    setTimeout(() => this.actualizar().catch(() => {}), 8000)
    this.temporizador = setInterval(() => this.actualizar().catch(() => {}), CADA)
  }

  parar() {
    if (this.temporizador) clearInterval(this.temporizador)
  }

  /** Avisa a la interfaz y vuelve a exportar, agrupando ráfagas. */
  private cambiado() {
    if (this.aviso) return
    this.aviso = setTimeout(() => {
      this.aviso = null
      this.exportar()
      this.emit('cambios')
    }, 200)
  }

  calendarios(): CalendarioInfo[] {
    return (
      this.db.sql.prepare('SELECT * FROM calendarios ORDER BY tipo DESC, nombre').all() as {
        id: string
        nombre: string
        tipo: 'invitaciones' | 'ical'
        cuenta: string | null
        color: string
        visible: number
        actualizado: number | null
        error: string | null
      }[]
    ).map((c) => ({ ...c, visible: !!c.visible }))
  }

  private colorLibre(tipo?: 'ical'): string {
    const usados = new Set(this.calendarios().map((c) => c.color))
    if (tipo === 'ical' && !usados.has('#d9558f')) return '#d9558f' // los suscritos (festivos…) en rosa
    return COLORES.find((c) => !usados.has(c)) ?? COLORES[this.calendarios().length % COLORES.length]
  }

  /** El calendario de invitaciones de una cuenta (se crea con la primera invitación). */
  asegurarInvitaciones(cuenta: string, nombre: string): string {
    const id = `inv-${cuenta}`
    const ya = this.db.sql.prepare('SELECT nombre FROM calendarios WHERE id = ?').get(id) as { nombre: string } | undefined
    if (!ya) {
      this.db.sql
        .prepare("INSERT INTO calendarios (id, nombre, tipo, cuenta, color) VALUES (?, ?, 'invitaciones', ?, ?)")
        .run(id, nombre, cuenta, this.colorLibre())
    } else if (ya.nombre !== nombre) {
      this.db.sql.prepare('UPDATE calendarios SET nombre = ? WHERE id = ?').run(nombre, id)
    }
    return id
  }

  // ------------------------------------------------------------ invitaciones

  /**
   * Una invitación (o su actualización o cancelación) que llega en un correo. Gana la de SEQUENCE
   * más alto y, a igualdad, la del correo más reciente: así da igual el orden en que se descarguen.
   */
  procesarInvitacion(cuenta: string, nombreCuenta: string, mensaje: string, fechaCorreo: number, ics: string, yo: string) {
    let leido: ReturnType<typeof leerEventos>
    try {
      leido = leerEventos(leerIcs(ics))
    } catch {
      return
    }
    const { metodo, eventos } = leido
    if (!eventos.length) return
    const cal = this.asegurarInvitaciones(cuenta, nombreCuenta)
    // Una respuesta mía (enviada desde aquí o desde otro sitio, como el móvil): se apunta.
    if (metodo === 'REPLY') {
      for (const ev of eventos) {
        const mia = ev.asistentes.find((a) => a.direccion === yo)?.respuesta
        if (!mia) continue
        const id = `${cal}:${ev.uid}:${ev.recurrencia ?? ''}`
        const previa = this.db.sql.prepare('SELECT fecha FROM respuestas_enviadas WHERE clave = ?').get(id) as { fecha: number } | undefined
        if (previa && previa.fecha > fechaCorreo) continue
        this.db.sql.prepare('INSERT OR REPLACE INTO respuestas_enviadas (clave, respuesta, fecha) VALUES (?, ?, ?)').run(id, mia, fechaCorreo)
        this.db.sql.prepare("UPDATE eventos SET mi_respuesta = ? WHERE id = ? AND mi_respuesta <> 'ORGANIZADOR'").run(mia, id)
      }
      return this.cambiado()
    }
    if (!['REQUEST', 'PUBLISH', 'CANCEL', 'ADD'].includes(metodo)) return // COUNTER y demás: no son para mí
    const buscar = this.db.sql.prepare('SELECT * FROM eventos WHERE id = ?')
    const guardar = this.db.sql.prepare(
      `INSERT INTO eventos (id, calendario, uid, recurrencia, datos, inicio, fin, rrule, mi_respuesta, mensaje, fecha_correo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET datos = excluded.datos, inicio = excluded.inicio, fin = excluded.fin, rrule = excluded.rrule,
         mi_respuesta = excluded.mi_respuesta, mensaje = excluded.mensaje, fecha_correo = excluded.fecha_correo`,
    )
    const enlazar = this.db.sql.prepare('INSERT OR REPLACE INTO invitaciones_correo (mensaje, evento) VALUES (?, ?)')
    this.db.transaccion(() => {
      for (const ev of eventos) {
        const id = `${cal}:${ev.uid}:${ev.recurrencia ?? ''}`
        const ya = buscar.get(id) as unknown as Fila | undefined
        enlazar.run(mensaje, id)
        if (ya) {
          const previo = JSON.parse(ya.datos) as EventoIcs
          const masVieja = ev.secuencia < previo.secuencia || (ev.secuencia === previo.secuencia && fechaCorreo < (ya.fecha_correo ?? 0))
          if (masVieja) continue
        }
        let respuesta: string
        if (ev.organizador?.direccion === yo) respuesta = 'ORGANIZADOR'
        else {
          const previo = ya ? (JSON.parse(ya.datos) as EventoIcs) : null
          // Si ya respondí a esta misma versión, se mantiene mi respuesta.
          const enviada = this.db.sql.prepare('SELECT respuesta FROM respuestas_enviadas WHERE clave = ?').get(id) as { respuesta: string } | undefined
          respuesta =
            ya?.mi_respuesta && previo?.secuencia === ev.secuencia && ya.mi_respuesta !== 'NEEDS-ACTION'
              ? ya.mi_respuesta
              : (enviada?.respuesta ?? ev.asistentes.find((a) => a.direccion === yo)?.respuesta ?? 'NEEDS-ACTION')
        }
        guardar.run(id, cal, ev.uid, ev.recurrencia, JSON.stringify(ev), ev.inicio, ev.fin, ev.rrule, respuesta, mensaje, fechaCorreo)
      }
    })
    this.cambiado()
  }

  evento(id: string): { ev: EventoIcs; cuenta: string | null; respuesta: string | null } | null {
    const f = this.db.sql
      .prepare('SELECT e.*, c.cuenta FROM eventos e JOIN calendarios c ON c.id = e.calendario WHERE e.id = ?')
      .get(id) as unknown as Fila | undefined
    return f ? { ev: JSON.parse(f.datos), cuenta: f.cuenta ?? null, respuesta: f.mi_respuesta } : null
  }

  guardarRespuesta(id: string, respuesta: string) {
    this.db.sql.prepare('UPDATE eventos SET mi_respuesta = ? WHERE id = ?').run(respuesta, id)
    this.db.sql.prepare('INSERT OR REPLACE INTO respuestas_enviadas (clave, respuesta, fecha) VALUES (?, ?, ?)').run(id, respuesta, Date.now())
    this.cambiado()
  }

  /** La invitación que trae un correo (en su estado actual), para la tarjeta del lector. */
  invitacionDe(mensaje: string): Instancia | null {
    const f = this.db.sql
      .prepare(
        `SELECT e.*, c.tipo, c.cuenta, c.color FROM invitaciones_correo i JOIN eventos e ON e.id = i.evento
         JOIN calendarios c ON c.id = e.calendario WHERE i.mensaje = ?`,
      )
      .get(mensaje) as unknown as (Fila & { color: string }) | undefined
    if (!f) return null
    const ev = JSON.parse(f.datos) as EventoIcs
    // De una serie, la próxima repetición (o la primera, si ya pasaron todas).
    let inicio = ev.inicio
    if (ev.rrule) inicio = repeticiones(ev.inicio, ev.rrule, ev.exdates, Date.now() - (ev.fin - ev.inicio), Date.now() + 400 * 86_400_000)[0] ?? ev.inicio
    return this.instancia(f, ev, inicio, f.color)
  }

  private instancia(f: Fila, ev: EventoIcs, inicio: number, color: string): Instancia {
    return {
      clave: `${f.id}@${inicio}`,
      id: f.id,
      calendario: f.calendario,
      color,
      titulo: ev.titulo,
      inicio,
      fin: inicio + (ev.fin - ev.inicio),
      todoElDia: ev.todoElDia,
      lugar: ev.lugar,
      descripcion: ev.descripcion,
      enlace: ev.enlace,
      estado: ev.estado,
      miRespuesta: f.mi_respuesta,
      organizador: ev.organizador,
      asistentes: ev.asistentes.length,
      esInvitacion: f.tipo === 'invitaciones',
      mensaje: f.mensaje,
      repite: !!ev.rrule,
    }
  }

  /** Lo que hay que pintar entre dos fechas, con las repeticiones ya desplegadas. */
  instancias(desde: number, hasta: number): Instancia[] {
    const filas = this.db.sql
      .prepare(
        `SELECT e.*, c.tipo, c.cuenta, c.color FROM eventos e JOIN calendarios c ON c.id = e.calendario
         WHERE c.visible = 1 AND ((e.rrule IS NULL AND e.fin >= ? AND e.inicio <= ?) OR e.rrule IS NOT NULL OR e.recurrencia IS NOT NULL)`,
      )
      .all(desde, hasta) as unknown as (Fila & { color: string })[]
    // Excepciones de una serie: sustituyen (o cancelan) esa repetición concreta.
    const excepciones = new Map<string, Set<number>>()
    for (const f of filas) {
      if (f.recurrencia === null) continue
      const k = `${f.calendario}|${f.uid}`
      if (!excepciones.has(k)) excepciones.set(k, new Set())
      excepciones.get(k)!.add(Math.round(f.recurrencia / 60000))
    }
    const out: Instancia[] = []
    for (const f of filas) {
      const ev = JSON.parse(f.datos) as EventoIcs
      if (f.recurrencia !== null) {
        if (ev.estado !== 'cancelado' && f.fin >= desde && f.inicio <= hasta) out.push(this.instancia(f, ev, ev.inicio, f.color))
        continue
      }
      if (!ev.rrule) {
        out.push(this.instancia(f, ev, ev.inicio, f.color))
        continue
      }
      const sustituidas = excepciones.get(`${f.calendario}|${f.uid}`)
      for (const ini of repeticiones(ev.inicio, ev.rrule, ev.exdates, desde - (ev.fin - ev.inicio), hasta)) {
        if (sustituidas?.has(Math.round(ini / 60000))) continue
        out.push(this.instancia(f, ev, ini, f.color))
      }
    }
    return out.sort((a, b) => Number(b.todoElDia) - Number(a.todoElDia) || a.inicio - b.inicio)
  }

  // ------------------------------------------------------------ calendarios suscritos (iCal)

  private async descargar(url: string): Promise<string> {
    const u = url.trim().replace(/^webcals?:\/\//i, 'https://')
    if (!/^https:\/\//i.test(u)) throw new Error('El enlace tiene que empezar por https:// o webcal://')
    const r = await fetch(u, { headers: { 'User-Agent': 'TuxMail' }, signal: AbortSignal.timeout(25_000) })
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`)
    if (Number(r.headers.get('content-length') ?? 0) > MAX_FEED) throw new Error('El calendario es demasiado grande')
    const t = await r.text()
    if (t.length > MAX_FEED) throw new Error('El calendario es demasiado grande')
    if (!t.slice(0, 2000).includes('BEGIN:VCALENDAR')) throw new Error('El enlace no es un calendario iCal')
    return t
  }

  private guardarFeed(id: string, ics: string) {
    const { eventos } = leerEventos(leerIcs(ics))
    const ins = this.db.sql.prepare(
      `INSERT OR REPLACE INTO eventos (id, calendario, uid, recurrencia, datos, inicio, fin, rrule) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    this.db.transaccion(() => {
      this.db.sql.prepare('DELETE FROM eventos WHERE calendario = ?').run(id)
      for (const ev of eventos) {
        ins.run(`${id}:${ev.uid}:${ev.recurrencia ?? ''}`, id, ev.uid, ev.recurrencia, JSON.stringify(ev), ev.inicio, ev.fin, ev.rrule)
      }
      this.db.sql.prepare('UPDATE calendarios SET actualizado = ?, error = NULL WHERE id = ?').run(Date.now(), id)
    })
    return eventos.length
  }

  /** Un calendario de ejemplo ya descargado (modo demo). */
  sembrarFeed(nombre: string, ics: string) {
    const id = `ical-${nombre.toLowerCase()}`
    this.db.sql.prepare("INSERT OR IGNORE INTO calendarios (id, nombre, tipo, color) VALUES (?, ?, 'ical', ?)").run(id, nombre, this.colorLibre('ical'))
    this.guardarFeed(id, ics)
  }

  /** Suscribirse a un calendario por su enlace iCal (se comprueba antes de guardarlo). */
  async suscribir(nombre: string, url: string): Promise<CalendarioInfo> {
    const ics = await this.descargar(url)
    const id = `ical-${randomBytes(4).toString('hex')}`
    this.db.sql
      .prepare("INSERT INTO calendarios (id, nombre, tipo, color) VALUES (?, ?, 'ical', ?)")
      .run(id, nombre.trim() || 'Calendario', this.colorLibre('ical'))
    await guardarSecreto(claveSecreto(id), url.trim())
    this.guardarFeed(id, ics)
    this.cambiado()
    return this.calendarios().find((c) => c.id === id)!
  }

  async actualizar(soloId?: string) {
    for (const c of this.calendarios().filter((x) => x.tipo === 'ical' && (!soloId || x.id === soloId))) {
      try {
        this.guardarFeed(c.id, await this.descargar(await secreto(claveSecreto(c.id))))
      } catch (e) {
        // El mensaje nunca lleva el enlace: suele ser secreto.
        this.db.sql.prepare('UPDATE calendarios SET error = ? WHERE id = ?').run((e as Error).message.replace(/https?:\/\/\S+/g, '…'), c.id)
      }
    }
    this.cambiado()
  }

  async quitar(id: string) {
    const c = this.calendarios().find((x) => x.id === id)
    if (!c) return
    this.db.sql.prepare('DELETE FROM eventos WHERE calendario = ?').run(id)
    this.db.sql.prepare('DELETE FROM calendarios WHERE id = ?').run(id)
    if (c.tipo === 'ical') await borrarSecreto(claveSecreto(id))
    this.cambiado()
  }

  cambiarColor(id: string, color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return
    this.db.sql.prepare('UPDATE calendarios SET color = ? WHERE id = ?').run(color, id)
    this.emit('cambios')
  }

  mostrar(id: string, visible: boolean) {
    this.db.sql.prepare('UPDATE calendarios SET visible = ? WHERE id = ?').run(+visible, id)
    this.emit('cambios')
  }

  borrarCuenta(cuenta: string) {
    this.db.sql.prepare("DELETE FROM invitaciones_correo WHERE evento IN (SELECT id FROM eventos WHERE calendario = ?)").run(`inv-${cuenta}`)
    this.db.sql.prepare('DELETE FROM eventos WHERE calendario = ?').run(`inv-${cuenta}`)
    this.db.sql.prepare('DELETE FROM calendarios WHERE id = ?').run(`inv-${cuenta}`)
    this.cambiado()
  }

  // ------------------------------------------------------------ exportar

  /**
   * Las reuniones (invitaciones no canceladas ni rechazadas) en un .ics local, para que otros
   * calendarios del escritorio las enseñen. Los calendarios suscritos no: esos ya los tiene cada uno.
   */
  exportar() {
    if (!this.dirExportar) return
    const filas = this.db.sql
      .prepare(
        `SELECT e.datos, e.mi_respuesta FROM eventos e JOIN calendarios c ON c.id = e.calendario
         WHERE c.tipo = 'invitaciones' AND (e.mi_respuesta IS NULL OR e.mi_respuesta <> 'DECLINED')`,
      )
      .all() as { datos: string }[]
    const lineas = filas
      .map((f) => JSON.parse(f.datos) as EventoIcs)
      .filter((e) => e.estado !== 'cancelado')
      .flatMap((e) => eventoExportado(e))
    try {
      mkdirSync(this.dirExportar, { recursive: true })
      const ruta = join(this.dirExportar, 'calendario.ics')
      writeFileSync(ruta + '.tmp', envolver(['X-WR-CALNAME:TuxMail', ...lineas]), { mode: 0o600 })
      renameSync(ruta + '.tmp', ruta)
    } catch (e) {
      console.error('[calendario] no se pudo exportar:', (e as Error).message)
    }
  }
}

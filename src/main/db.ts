// Caché local en SQLite (node:sqlite, sin módulos nativos). La interfaz siempre lee de aquí.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { Buzon, Carpeta, Cuerpo, Direccion, Mensaje, RolCarpeta } from '@shared/tipos'

const ESQUEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -32000;
PRAGMA mmap_size = 268435456;

CREATE TABLE IF NOT EXISTS carpetas (
  cuenta TEXT NOT NULL,
  ruta TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  uidvalidity TEXT,
  modseq TEXT,
  uidnext INTEGER,
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cuenta, ruta)
);

CREATE TABLE IF NOT EXISTS mensajes (
  id TEXT PRIMARY KEY,
  cuenta TEXT NOT NULL,
  carpeta TEXT NOT NULL,
  uid INTEGER NOT NULL,
  msgid TEXT,
  en_respuesta TEXT,
  referencias TEXT,
  hilo TEXT NOT NULL,
  de_nombre TEXT NOT NULL DEFAULT '',
  de_dir TEXT NOT NULL DEFAULT '',
  para TEXT NOT NULL DEFAULT '[]',
  cc TEXT NOT NULL DEFAULT '[]',
  asunto TEXT NOT NULL DEFAULT '',
  vista TEXT NOT NULL DEFAULT '',
  fecha INTEGER NOT NULL,
  leido INTEGER NOT NULL DEFAULT 0,
  marcado INTEGER NOT NULL DEFAULT 0,
  respondido INTEGER NOT NULL DEFAULT 0,
  adjuntos INTEGER NOT NULL DEFAULT 0,
  parte_texto TEXT,
  FOREIGN KEY (cuenta, carpeta) REFERENCES carpetas(cuenta, ruta) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS mensajes_uid ON mensajes(cuenta, carpeta, uid);
CREATE INDEX IF NOT EXISTS mensajes_fecha ON mensajes(cuenta, carpeta, fecha DESC);
CREATE INDEX IF NOT EXISTS mensajes_hilo ON mensajes(cuenta, hilo);
CREATE INDEX IF NOT EXISTS mensajes_hilo_fecha ON mensajes(cuenta, hilo, fecha DESC);
CREATE INDEX IF NOT EXISTS mensajes_msgid ON mensajes(cuenta, msgid);

CREATE TABLE IF NOT EXISTS cuerpos (
  id TEXT PRIMARY KEY REFERENCES mensajes(id) ON DELETE CASCADE,
  html TEXT,
  texto TEXT,
  adjuntos TEXT NOT NULL DEFAULT '[]',
  remoto INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS buscar USING fts5(
  id UNINDEXED, de, asunto, texto,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Correos traducidos al español (el documento entero, para volver a abrirlos al momento).
CREATE TABLE IF NOT EXISTS traducciones (
  id TEXT PRIMARY KEY,
  html TEXT NOT NULL
);

-- Imágenes remotas de los correos: la URL de cada suma (tuxmail://remoto/<suma>).
-- estado: 0 sin bajar, 1 en caché, 2 no se pudo o no es imagen (no se reintenta).
CREATE TABLE IF NOT EXISTS remotos (
  suma TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  tipo TEXT,
  estado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contactos (
  direccion TEXT PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  veces INTEGER NOT NULL DEFAULT 0,
  ultima INTEGER NOT NULL DEFAULT 0
);
`

interface FilaMensaje {
  id: string
  cuenta: string
  carpeta: string
  hilo: string
  de_nombre: string
  de_dir: string
  para: string
  cc: string
  asunto: string
  vista: string
  fecha: number
  leido: number
  marcado: number
  respondido: number
  adjuntos: number
  en_hilo?: number
}

export interface NuevoMensaje {
  cuenta: string
  carpeta: string
  uid: number
  msgid: string | null
  enRespuesta: string | null
  referencias: string[]
  hilo: string
  de: Direccion
  para: Direccion[]
  cc: Direccion[]
  asunto: string
  vista: string
  fecha: number
  leido: boolean
  marcado: boolean
  respondido: boolean
  adjuntos: number
  parteTexto: string | null
  baja?: string | null
  lista?: string | null
}

export const idMensaje = (cuenta: string, carpeta: string, uid: number) => `${cuenta}\u0000${carpeta}\u0000${uid}`

// Roles que no cuentan en las vistas que juntan cuentas (en Gmail, All Mail repite todo).
const FUERA_DE_VISTAS = `('all')`

export class Db {
  sql: DatabaseSync

  constructor(ruta: string) {
    this.sql = new DatabaseSync(ruta)
    this.sql.exec(ESQUEMA)
    // Migraciones de columnas añadidas después (SQLite no tiene ADD COLUMN IF NOT EXISTS).
    const columnas = new Set((this.sql.prepare('PRAGMA table_info(mensajes)').all() as { name: string }[]).map((c) => c.name))
    // baja: cómo darse de baja (JSON de List-Unsubscribe; '' = no tiene; NULL = aún no se ha mirado)
    if (!columnas.has('baja')) this.sql.exec('ALTER TABLE mensajes ADD COLUMN baja TEXT')
    if (!columnas.has('lista')) this.sql.exec('ALTER TABLE mensajes ADD COLUMN lista TEXT') // List-Id
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bajas (
      clave TEXT PRIMARY KEY,   -- remitente o lista
      fecha INTEGER NOT NULL,
      metodo TEXT NOT NULL      -- un-clic | correo | web
    )`)
  }

  transaccion<T>(fn: () => T): T {
    this.sql.exec('BEGIN')
    try {
      const r = fn()
      this.sql.exec('COMMIT')
      return r
    } catch (e) {
      this.sql.exec('ROLLBACK')
      throw e
    }
  }

  // ------------------------------------------------------------ carpetas

  carpetas(): Carpeta[] {
    const filas = this.sql
      .prepare(
        `SELECT c.cuenta, c.ruta, c.nombre, c.rol, c.total,
                (SELECT COUNT(*) FROM mensajes m WHERE m.cuenta = c.cuenta AND m.carpeta = c.ruta AND m.leido = 0) AS no_leidos
         FROM carpetas c`,
      )
      .all() as { cuenta: string; ruta: string; nombre: string; rol: RolCarpeta; total: number; no_leidos: number }[]
    return filas.map((f) => ({
      id: `${f.cuenta}\u0000${f.ruta}`,
      cuenta: f.cuenta,
      ruta: f.ruta,
      nombre: f.nombre,
      rol: f.rol,
      total: f.total,
      noLeidos: f.no_leidos,
    }))
  }

  carpeta(cuenta: string, ruta: string) {
    return this.sql.prepare('SELECT * FROM carpetas WHERE cuenta = ? AND ruta = ?').get(cuenta, ruta) as
      | { cuenta: string; ruta: string; rol: RolCarpeta; uidvalidity: string | null; modseq: string | null; uidnext: number | null; total: number }
      | undefined
  }

  rutaPorRol(cuenta: string, rol: RolCarpeta): string | undefined {
    const f = this.sql.prepare('SELECT ruta FROM carpetas WHERE cuenta = ? AND rol = ?').get(cuenta, rol) as
      | { ruta: string }
      | undefined
    return f?.ruta
  }

  guardarCarpetas(cuenta: string, lista: { ruta: string; nombre: string; rol: RolCarpeta }[]) {
    this.transaccion(() => {
      const rutas = new Set(lista.map((c) => c.ruta))
      for (const vieja of this.sql.prepare('SELECT ruta FROM carpetas WHERE cuenta = ?').all(cuenta) as { ruta: string }[]) {
        if (!rutas.has(vieja.ruta)) this.borrarCarpeta(cuenta, vieja.ruta)
      }
      const ins = this.sql.prepare(
        `INSERT INTO carpetas (cuenta, ruta, nombre, rol) VALUES (?, ?, ?, ?)
         ON CONFLICT (cuenta, ruta) DO UPDATE SET nombre = excluded.nombre, rol = excluded.rol`,
      )
      for (const c of lista) ins.run(cuenta, c.ruta, c.nombre, c.rol)
    })
  }

  borrarCarpeta(cuenta: string, ruta: string) {
    this.sql.prepare(`DELETE FROM buscar WHERE id IN (SELECT id FROM mensajes WHERE cuenta = ? AND carpeta = ?)`).run(cuenta, ruta)
    this.sql.prepare('DELETE FROM carpetas WHERE cuenta = ? AND ruta = ?').run(cuenta, ruta)
  }

  estadoCarpeta(cuenta: string, ruta: string, e: { uidvalidity?: string; modseq?: string | null; uidnext?: number; total?: number }) {
    this.sql
      .prepare(
        `UPDATE carpetas SET uidvalidity = coalesce(?, uidvalidity), modseq = ?, uidnext = coalesce(?, uidnext),
         total = coalesce(?, total) WHERE cuenta = ? AND ruta = ?`,
      )
      .run(e.uidvalidity ?? null, e.modseq ?? null, e.uidnext ?? null, e.total ?? null, cuenta, ruta)
  }

  vaciarCarpeta(cuenta: string, ruta: string) {
    this.sql.prepare(`DELETE FROM buscar WHERE id IN (SELECT id FROM mensajes WHERE cuenta = ? AND carpeta = ?)`).run(cuenta, ruta)
    this.sql.prepare('DELETE FROM mensajes WHERE cuenta = ? AND carpeta = ?').run(cuenta, ruta)
  }

  // ------------------------------------------------------------ mensajes

  uids(cuenta: string, carpeta: string): number[] {
    return (this.sql.prepare('SELECT uid FROM mensajes WHERE cuenta = ? AND carpeta = ?').all(cuenta, carpeta) as { uid: number }[]).map(
      (f) => f.uid,
    )
  }

  /** Hilo de un mensaje nuevo: el de su padre si ya lo tenemos, si no la raíz de References. */
  hiloPara(cuenta: string, msgid: string | null, enRespuesta: string | null, referencias: string[]): string {
    const candidatos = [enRespuesta, ...[...referencias].reverse()].filter(Boolean) as string[]
    const buscar = this.sql.prepare('SELECT hilo FROM mensajes WHERE cuenta = ? AND msgid = ? LIMIT 1')
    for (const c of candidatos) {
      const f = buscar.get(cuenta, c) as { hilo: string } | undefined
      if (f) return f.hilo
    }
    return referencias[0] ?? enRespuesta ?? msgid ?? `${cuenta}-${Math.random()}`
  }

  guardarMensajes(lista: NuevoMensaje[]) {
    if (!lista.length) return
    this.transaccion(() => {
      const ins = this.sql.prepare(
        `INSERT INTO mensajes (id, cuenta, carpeta, uid, msgid, en_respuesta, referencias, hilo, de_nombre, de_dir,
           para, cc, asunto, vista, fecha, leido, marcado, respondido, adjuntos, parte_texto, baja, lista)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET leido = excluded.leido, marcado = excluded.marcado,
           respondido = excluded.respondido,
           vista = CASE WHEN excluded.vista <> '' THEN excluded.vista ELSE mensajes.vista END`,
      )
      const fts = this.sql.prepare('INSERT INTO buscar (id, de, asunto, texto) VALUES (?, ?, ?, ?)')
      const existe = this.sql.prepare('SELECT 1 FROM mensajes WHERE id = ?')
      const contacto = this.sql.prepare(
        `INSERT INTO contactos (direccion, nombre, veces, ultima) VALUES (?, ?, 1, ?)
         ON CONFLICT (direccion) DO UPDATE SET veces = veces + 1, ultima = max(ultima, excluded.ultima),
           nombre = CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE contactos.nombre END`,
      )
      for (const m of lista) {
        const id = idMensaje(m.cuenta, m.carpeta, m.uid)
        const nuevo = !existe.get(id)
        ins.run(
          id, m.cuenta, m.carpeta, m.uid, m.msgid, m.enRespuesta, JSON.stringify(m.referencias), m.hilo,
          m.de.nombre, m.de.direccion, JSON.stringify(m.para), JSON.stringify(m.cc), m.asunto, m.vista, m.fecha,
          +m.leido, +m.marcado, +m.respondido, m.adjuntos, m.parteTexto, m.baja ?? null, m.lista ?? null,
        )
        if (nuevo) {
          fts.run(id, `${m.de.nombre} ${m.de.direccion}`, m.asunto, m.vista)
          if (m.de.direccion) contacto.run(m.de.direccion.toLowerCase(), m.de.nombre, m.fecha)
        }
      }
    })
  }

  vistaPrevia(id: string, vista: string) {
    this.sql.prepare('UPDATE mensajes SET vista = ? WHERE id = ?').run(vista, id)
    this.sql.prepare('UPDATE buscar SET texto = ? WHERE id = ?').run(vista, id)
  }

  sinVista(cuenta: string, carpeta: string, limite: number) {
    return this.sql
      .prepare(
        `SELECT id, uid, parte_texto FROM mensajes WHERE cuenta = ? AND carpeta = ? AND vista = '' AND parte_texto IS NOT NULL
         ORDER BY fecha DESC LIMIT ?`,
      )
      .all(cuenta, carpeta, limite) as { id: string; uid: number; parte_texto: string }[]
  }

  flags(id: string, f: { leido?: boolean; marcado?: boolean; respondido?: boolean }) {
    const sets: string[] = []
    const vals: SQLInputValue[] = []
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined) continue
      sets.push(`${k} = ?`)
      vals.push(+v)
    }
    if (sets.length) this.sql.prepare(`UPDATE mensajes SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
  }

  borrarMensajes(ids: string[]) {
    const del = this.sql.prepare('DELETE FROM mensajes WHERE id = ?')
    const delFts = this.sql.prepare('DELETE FROM buscar WHERE id = ?')
    this.transaccion(() => ids.forEach((id) => (del.run(id), delFts.run(id))))
  }

  /** Mueve en la caché, con el UID nuevo si el servidor lo dio (UIDPLUS). */
  moverMensaje(id: string, carpeta: string, uid: number) {
    const nuevo = this.sql.prepare('SELECT cuenta FROM mensajes WHERE id = ?').get(id) as { cuenta: string } | undefined
    if (!nuevo) return null
    const nid = idMensaje(nuevo.cuenta, carpeta, uid)
    this.sql.prepare('UPDATE mensajes SET id = ?, carpeta = ?, uid = ? WHERE id = ?').run(nid, carpeta, uid, id)
    this.sql.prepare('UPDATE buscar SET id = ? WHERE id = ?').run(nid, id)
    this.sql.prepare('UPDATE cuerpos SET id = ? WHERE id = ?').run(nid, id)
    this.sql.prepare('UPDATE OR REPLACE traducciones SET id = ? WHERE id = ?').run(nid, id)
    return nid
  }

  /** Cabeceras para responder: Message-ID y References del mensaje. */
  cabeceras(id: string) {
    const f = this.sql.prepare('SELECT msgid, referencias, en_respuesta FROM mensajes WHERE id = ?').get(id) as
      | { msgid: string | null; referencias: string | null; en_respuesta: string | null }
      | undefined
    return f ? { msgid: f.msgid, referencias: JSON.parse(f.referencias || '[]') as string[], enRespuesta: f.en_respuesta } : null
  }

  ubicacion(id: string) {
    return this.sql.prepare('SELECT cuenta, carpeta, uid, leido, marcado, respondido, msgid FROM mensajes WHERE id = ?').get(id) as
      | { cuenta: string; carpeta: string; uid: number; leido: number; marcado: number; respondido: number; msgid: string | null }
      | undefined
  }

  // ------------------------------------------------------------ consultas para la interfaz

  private filtroBuzon(b: Buzon): [string, SQLInputValue[]] {
    switch (b.tipo) {
      case 'carpeta': {
        const [cuenta, ruta] = b.carpeta.split('\u0000')
        return ['m.cuenta = ? AND m.carpeta = ?', [cuenta, ruta]]
      }
      case 'todas':
        return ['c.rol = ?', [b.rol]]
      case 'marcados':
        return [`m.marcado = 1 AND c.rol NOT IN ('trash', 'junk') AND c.rol NOT IN ${FUERA_DE_VISTAS}`, []]
      case 'hoy': {
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        return [`c.rol = 'inbox' AND m.fecha >= ?`, [hoy.getTime()]]
      }
    }
  }

  /**
   * Una fila por conversación, como Mail: el mensaje más reciente del hilo dentro del buzón,
   * y cuántos mensajes tiene el hilo en toda la cuenta (incluidos los enviados).
   */
  lista(b: Buzon, busqueda: string, limite = 50_000): Mensaje[] {
    const [donde, vals] = this.filtroBuzon(b)
    let extra = ''
    const args: SQLInputValue[] = [...vals]
    if (busqueda.trim()) {
      const q = busqueda
        .trim()
        .split(/\s+/)
        .map((t) => `"${t.replace(/"/g, '""')}"*`)
        .join(' ')
      extra = ' AND m.id IN (SELECT id FROM buscar WHERE buscar MATCH ?)'
      args.push(q)
    }
    args.push(limite)
    // Solo las columnas que pinta la fila (para y cc no hacen falta en la lista): un 40 % menos por IPC.
    const filas = this.sql
      .prepare(
        `WITH sel AS (
           SELECT m.id, m.cuenta, m.carpeta, m.hilo, m.de_nombre, m.de_dir, m.asunto, m.vista, m.fecha, m.leido,
                  m.marcado, m.respondido, m.adjuntos,
                  row_number() OVER (PARTITION BY m.cuenta, m.hilo ORDER BY m.fecha DESC) AS rn,
                  max(1 - m.leido) OVER (PARTITION BY m.cuenta, m.hilo) AS hilo_no_leido
           FROM mensajes m JOIN carpetas c ON c.cuenta = m.cuenta AND c.ruta = m.carpeta
           WHERE ${donde}${extra}
         )
         SELECT sel.*, '[]' AS para, '[]' AS cc, CASE WHEN hilo_no_leido = 1 THEN 0 ELSE 1 END AS leido_hilo,
           (SELECT COUNT(DISTINCT coalesce(x.msgid, x.id)) FROM mensajes x JOIN carpetas cx ON cx.cuenta = x.cuenta AND cx.ruta = x.carpeta
            WHERE x.cuenta = sel.cuenta AND x.hilo = sel.hilo AND cx.rol NOT IN ('trash', 'junk', 'all')) AS en_hilo
         FROM sel WHERE rn = 1 ORDER BY fecha DESC LIMIT ?`,
      )
      .all(...args) as unknown as (FilaMensaje & { leido_hilo: number })[]
    return filas.map((f) => aMensaje({ ...f, leido: f.leido_hilo }))
  }

  /** Todos los mensajes de un hilo, del más antiguo al más nuevo, sin repetir (Gmail duplica por etiquetas). */
  hilo(cuenta: string, hilo: string): Mensaje[] {
    const filas = this.sql
      .prepare(
        `SELECT m.* FROM mensajes m JOIN carpetas c ON c.cuenta = m.cuenta AND c.ruta = m.carpeta
         WHERE m.cuenta = ? AND m.hilo = ? AND c.rol NOT IN ('all')
         ORDER BY m.fecha ASC`,
      )
      .all(cuenta, hilo) as unknown as FilaMensaje[]
    const vistos = new Set<string>()
    const out: Mensaje[] = []
    for (const f of filas) {
      const clave = (f as unknown as { msgid: string | null }).msgid ?? f.id
      if (vistos.has(clave)) continue
      vistos.add(clave)
      out.push(aMensaje(f))
    }
    return out
  }

  mensaje(id: string): Mensaje | null {
    const f = this.sql.prepare('SELECT * FROM mensajes WHERE id = ?').get(id) as unknown as FilaMensaje | undefined
    return f ? aMensaje(f) : null
  }

  contar(b: Buzon, soloNoLeidos: boolean): number {
    const [donde, vals] = this.filtroBuzon(b)
    const f = this.sql
      .prepare(
        `SELECT COUNT(DISTINCT m.cuenta || m.hilo) AS n FROM mensajes m JOIN carpetas c ON c.cuenta = m.cuenta AND c.ruta = m.carpeta
         WHERE ${donde}${soloNoLeidos ? ' AND m.leido = 0' : ''}`,
      )
      .get(...vals) as { n: number }
    return f.n
  }

  // ------------------------------------------------------------ cuerpos

  cuerpo(id: string): Cuerpo | null {
    const f = this.sql.prepare('SELECT * FROM cuerpos WHERE id = ?').get(id) as
      | { html: string | null; texto: string | null; adjuntos: string; remoto: number }
      | undefined
    if (!f) return null
    const t = this.sql.prepare('SELECT html FROM traducciones WHERE id = ?').get(id) as { html: string } | undefined
    return { html: f.html, texto: f.texto, adjuntos: JSON.parse(f.adjuntos), remotoBloqueado: !!f.remoto, traduccion: t?.html ?? null }
  }

  guardarTraduccion(id: string, html: string | null) {
    if (html === null) this.sql.prepare('DELETE FROM traducciones WHERE id = ?').run(id)
    else this.sql.prepare('INSERT OR REPLACE INTO traducciones (id, html) VALUES (?, ?)').run(id, html)
  }

  guardarCuerpo(id: string, c: Cuerpo) {
    this.sql
      .prepare(
        `INSERT INTO cuerpos (id, html, texto, adjuntos, remoto) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET html = excluded.html, texto = excluded.texto, adjuntos = excluded.adjuntos, remoto = excluded.remoto`,
      )
      .run(id, c.html, c.texto, JSON.stringify(c.adjuntos), +c.remotoBloqueado)
    if (c.texto) this.sql.prepare('UPDATE buscar SET texto = ? WHERE id = ?').run(c.texto.slice(0, 20000), id)
  }

  /** Mensajes sin cuerpo guardado de una carpeta, del más nuevo al más antiguo (para la precarga). */
  sinCuerpo(cuenta: string, carpeta: string, desde: number, limite: number) {
    return this.sql
      .prepare(
        `SELECT m.id, m.uid, m.fecha FROM mensajes m LEFT JOIN cuerpos c ON c.id = m.id
         WHERE m.cuenta = ? AND m.carpeta = ? AND m.fecha >= ? AND m.uid > 0 AND c.id IS NULL
         ORDER BY m.fecha DESC LIMIT ?`,
      )
      .all(cuenta, carpeta, desde, limite) as { id: string; uid: number; fecha: number }[]
  }

  idsDeRemitente(cuenta: string, direccion: string): string[] {
    return (
      this.sql
        .prepare(
          `SELECT m.id FROM mensajes m JOIN carpetas c ON c.cuenta = m.cuenta AND c.ruta = m.carpeta
           WHERE m.cuenta = ? AND lower(m.de_dir) = lower(?) AND c.rol NOT IN ('junk', 'trash', 'all', 'sent', 'drafts')`,
        )
        .all(cuenta, direccion) as { id: string }[]
    ).map((f) => f.id)
  }

  tieneCuerpo(id: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM cuerpos WHERE id = ?').get(id)
  }

  /** Estado de lectura de cada hilo (para parchear la lista sin volver a pedirla entera). */
  hilosLeidos(pares: { cuenta: string; hilo: string }[]): { cuenta: string; hilo: string; leido: boolean }[] {
    const q = this.sql.prepare(
      `SELECT EXISTS (SELECT 1 FROM mensajes m JOIN carpetas c ON c.cuenta = m.cuenta AND c.ruta = m.carpeta
         WHERE m.cuenta = ? AND m.hilo = ? AND m.leido = 0 AND c.rol NOT IN ('trash', 'junk', 'all')) AS hay`,
    )
    return pares.map((p) => ({ ...p, leido: !(q.get(p.cuenta, p.hilo) as { hay: number }).hay }))
  }

  // ------------------------------------------------------------ imágenes remotas

  apuntarRemota(suma: string, url: string) {
    this.sql.prepare('INSERT OR IGNORE INTO remotos (suma, url) VALUES (?, ?)').run(suma, url)
  }

  remota(suma: string) {
    return this.sql.prepare('SELECT url, tipo, estado FROM remotos WHERE suma = ?').get(suma) as
      | { url: string; tipo: string | null; estado: number }
      | undefined
  }

  estadoRemota(suma: string, estado: number, tipo: string) {
    this.sql.prepare('UPDATE remotos SET estado = ?, tipo = ? WHERE suma = ?').run(estado, tipo, suma)
  }

  // ------------------------------------------------------------ suscripciones (boletines)

  /** Mensajes de una carpeta a los que aún no se les han mirado las cabeceras de baja. */
  sinBaja(cuenta: string, carpeta: string, limite: number) {
    return (
      this.sql
        .prepare('SELECT uid FROM mensajes WHERE cuenta = ? AND carpeta = ? AND baja IS NULL AND uid > 0 ORDER BY fecha DESC LIMIT ?')
        .all(cuenta, carpeta, limite) as { uid: number }[]
    ).map((f) => f.uid)
  }

  guardarBaja(id: string, baja: string, lista: string | null) {
    this.sql.prepare('UPDATE mensajes SET baja = ?, lista = coalesce(?, lista) WHERE id = ?').run(baja, lista, id)
  }

  /**
   * Remitentes con boletines: agrupados por lista (List-Id) o por dirección, con cuántos correos hay,
   * cuántos sin leer y cómo darse de baja (el del correo más reciente).
   */
  suscripciones() {
    return this.sql
      .prepare(
        `WITH b AS (
           SELECT m.id, m.cuenta, m.de_nombre, m.de_dir, m.asunto, m.baja, m.fecha, m.leido, c.rol,
                  coalesce(nullif(m.lista, ''), lower(m.de_dir)) AS clave
           FROM mensajes m JOIN carpetas c ON c.cuenta = m.cuenta AND c.ruta = m.carpeta
           WHERE m.baja IS NOT NULL AND m.baja <> '' AND c.rol NOT IN ('sent', 'drafts', 'all')
         ),
         -- Cifras de cada remitente en una sola pasada.
         g AS (
           SELECT cuenta, clave, COUNT(*) AS total, SUM(leido = 0) AS sin_leer,
                  SUM(rol NOT IN ('trash', 'junk')) AS a_la_vista
           FROM b GROUP BY cuenta, clave
         ),
         -- Y su correo más reciente (nombre, dirección y cómo darse de baja).
         u AS (
           SELECT * FROM (SELECT b.*, row_number() OVER (PARTITION BY cuenta, clave ORDER BY fecha DESC) AS rn FROM b) WHERE rn = 1
         )
         SELECT u.clave, u.cuenta, u.de_nombre AS nombre, u.de_dir AS direccion, u.asunto, u.baja, u.id AS ultimo, u.fecha AS ultima,
                g.total, g.sin_leer, g.a_la_vista, d.fecha AS baja_fecha, d.metodo AS baja_metodo
         FROM u JOIN g ON g.cuenta = u.cuenta AND g.clave = u.clave
         LEFT JOIN bajas d ON d.clave = u.cuenta || '|' || u.clave
         ORDER BY total DESC, ultima DESC`,
      )
      .all() as {
      clave: string
      cuenta: string
      nombre: string
      direccion: string
      asunto: string
      baja: string
      ultimo: string
      ultima: number
      total: number
      sin_leer: number
      a_la_vista: number
      baja_fecha: number | null
      baja_metodo: string | null
    }[]
  }

  /** Los correos de una suscripción que aún están a la vista (para archivarlos o tirarlos de una vez). */
  idsDeSuscripcion(cuenta: string, clave: string): string[] {
    return (
      this.sql
        .prepare(
          `SELECT m.id FROM mensajes m JOIN carpetas c ON c.cuenta = m.cuenta AND c.ruta = m.carpeta
           WHERE m.cuenta = ? AND coalesce(nullif(m.lista, ''), lower(m.de_dir)) = ? AND m.baja <> ''
             AND c.rol NOT IN ('sent', 'drafts', 'all', 'trash', 'junk')`,
        )
        .all(cuenta, clave) as { id: string }[]
    ).map((f) => f.id)
  }

  apuntarBaja(clave: string, metodo: string) {
    this.sql.prepare('INSERT OR REPLACE INTO bajas (clave, fecha, metodo) VALUES (?, ?, ?)').run(clave, Date.now(), metodo)
  }

  /** Cómo darse de baja de un mensaje concreto (para el botón del lector). */
  bajaDe(id: string) {
    return this.sql.prepare("SELECT cuenta, baja, coalesce(nullif(lista, ''), lower(de_dir)) AS clave FROM mensajes WHERE id = ?").get(id) as
      | { cuenta: string; baja: string | null; clave: string }
      | undefined
  }

  /** Cuerpos guardados con una invitación adjunta que aún no se ha leído para el calendario. */
  cuerposConCalendario() {
    return this.sql
      .prepare(
        `SELECT c.id, c.adjuntos, m.cuenta FROM cuerpos c JOIN mensajes m ON m.id = c.id
         WHERE (c.adjuntos LIKE '%calendar%' OR c.adjuntos LIKE '%.ics%')
           AND c.id NOT IN (SELECT mensaje FROM invitaciones_correo)`,
      )
      .all() as { id: string; adjuntos: string; cuenta: string }[]
  }

  /** Borra de la caché todo lo de una cuenta (al quitarla de TuxMail). */
  borrarCuenta(cuenta: string) {
    this.transaccion(() => {
      this.sql.prepare('DELETE FROM buscar WHERE id IN (SELECT id FROM mensajes WHERE cuenta = ?)').run(cuenta)
      this.sql.prepare('DELETE FROM traducciones WHERE id IN (SELECT id FROM mensajes WHERE cuenta = ?)').run(cuenta)
      this.sql.prepare('DELETE FROM mensajes WHERE cuenta = ?').run(cuenta)
      this.sql.prepare('DELETE FROM carpetas WHERE cuenta = ?').run(cuenta)
    })
  }

  cerrar() {
    try {
      this.sql.exec('PRAGMA optimize')
      this.sql.close()
    } catch {
      /* ya cerrada */
    }
  }

  /** Las direcciones a las que escribo suben en el autocompletado. */
  usarContactos(lista: Direccion[]) {
    const q = this.sql.prepare(
      `INSERT INTO contactos (direccion, nombre, veces, ultima) VALUES (?, ?, 3, ?)
       ON CONFLICT (direccion) DO UPDATE SET veces = veces + 3, ultima = excluded.ultima,
         nombre = CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE contactos.nombre END`,
    )
    for (const d of lista) if (d.direccion) q.run(d.direccion.toLowerCase(), d.nombre, Date.now())
  }

  contactos(prefijo: string, limite = 8): Direccion[] {
    const q = `%${prefijo.toLowerCase()}%`
    return (
      this.sql
        .prepare('SELECT direccion, nombre FROM contactos WHERE direccion LIKE ? OR lower(nombre) LIKE ? ORDER BY veces DESC, ultima DESC LIMIT ?')
        .all(q, q, limite) as { direccion: string; nombre: string }[]
    ).map((f) => ({ direccion: f.direccion, nombre: f.nombre }))
  }
}

function aMensaje(f: FilaMensaje): Mensaje {
  return {
    id: f.id,
    cuenta: f.cuenta,
    carpeta: `${f.cuenta}\u0000${f.carpeta}`,
    hilo: f.hilo,
    de: { nombre: f.de_nombre, direccion: f.de_dir },
    para: JSON.parse(f.para),
    cc: JSON.parse(f.cc),
    asunto: f.asunto,
    vistaPrevia: f.vista,
    fecha: f.fecha,
    leido: !!f.leido,
    marcado: !!f.marcado,
    respondido: !!f.respondido,
    adjuntos: f.adjuntos,
    enHilo: f.en_hilo ?? 1,
    baja: !!(f as unknown as { baja?: string | null }).baja,
  }
}

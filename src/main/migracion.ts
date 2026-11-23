// NimboMail se llamaba TuxMail. Al arrancar por primera vez con el nombre nuevo se mueven sus carpetas
// (~/.config, ~/.cache y ~/.local/share), se renombra la base de datos y se reescriben las URLs
// tuxmail:// que guarda la caché. Las contraseñas del llavero se mueven al leerlas (secreto() en cuentas.ts).
import { existsSync, readdirSync, readFileSync, readlinkSync, renameSync, rmdirSync, rmSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const NOMBRE_ANTERIOR = 'tuxmail'
const NOMBRE = 'nimbomail'

const CONFIG = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
const BASES = [CONFIG, join(homedir(), '.cache'), join(homedir(), '.local', 'share')]

/** ¿Sigue abierta TuxMail? Electron deja en su carpeta SingletonLock → «equipo-pid». */
function anteriorAbierta(): boolean {
  let destino: string
  try {
    destino = readlinkSync(join(CONFIG, NOMBRE_ANTERIOR, 'SingletonLock'))
  } catch {
    return false
  }
  const m = destino.match(/^(.*)-(\d+)$/)
  if (!m || m[1] !== hostname()) return false
  try {
    // El pid puede haberse reutilizado: solo cuenta si sigue siendo TuxMail (o Electron, en desarrollo).
    return /tuxmail|electron/i.test(readFileSync(`/proc/${m[2]}/cmdline`, 'utf8'))
  } catch {
    return false
  }
}

/** Reescribe tuxmail:// → nimbomail:// en lo que guarda URLs de la app (cuerpos, adjuntos, traducciones). */
function reescribirUrls(ruta: string) {
  const db = new DatabaseSync(ruta)
  try {
    const tablas = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name))
    const de = `${NOMBRE_ANTERIOR}://`
    const a = `${NOMBRE}://`
    db.exec('BEGIN')
    if (tablas.has('cuerpos'))
      db.prepare(
        `UPDATE cuerpos SET html = replace(html, ?1, ?2), adjuntos = replace(adjuntos, ?1, ?2)
         WHERE instr(html, ?1) > 0 OR instr(adjuntos, ?1) > 0`,
      ).run(de, a)
    // Las traducciones guardan el documento entero, con su CSP «img-src … tuxmail:»: también sin las //.
    if (tablas.has('traducciones'))
      db.prepare('UPDATE traducciones SET html = replace(html, ?1, ?2) WHERE instr(html, ?1) > 0').run(`${NOMBRE_ANTERIOR}:`, `${NOMBRE}:`)
    db.exec('COMMIT')
  } finally {
    db.close()
  }
}

/**
 * Mueve el contenido de `vieja` a `nueva` entrada a entrada, sin pisar lo que ya haya: Electron puede
 * haber creado la carpeta nueva antes de llegar aquí (Crashpad…). Los Singleton* son de la instancia vieja.
 */
function fusionar(vieja: string, nueva: string) {
  if (!existsSync(vieja)) return
  if (!existsSync(nueva)) return renameSync(vieja, nueva)
  for (const e of readdirSync(vieja)) {
    if (e.startsWith('Singleton')) rmSync(join(vieja, e), { force: true }) // restos: TuxMail ya no está abierta
    else if (!existsSync(join(nueva, e))) renameSync(join(vieja, e), join(nueva, e))
  }
  try {
    rmdirSync(vieja) // solo si ha quedado vacía
  } catch {}
}

/**
 * Pasa los datos de TuxMail a NimboMail si hace falta. Devuelve false (sin tocar nada) si TuxMail sigue
 * abierta: moverle las carpetas en marcha la dejaría escribiendo en una ruta que ya no existe.
 */
export function migrarDeTuxMail(): boolean {
  if (!BASES.some((b) => existsSync(join(b, NOMBRE_ANTERIOR)))) return true
  if (anteriorAbierta()) return false
  for (const base of BASES) fusionar(join(base, NOMBRE_ANTERIOR), join(base, NOMBRE))

  // Primero se reescribe y después se renombra: si se corta a medias, el siguiente arranque lo repite.
  const config = join(CONFIG, NOMBRE)
  const dbVieja = join(config, `${NOMBRE_ANTERIOR}.db`)
  const db = join(config, `${NOMBRE}.db`)
  if (existsSync(dbVieja) && !existsSync(db)) {
    reescribirUrls(dbVieja)
    for (const sufijo of ['-wal', '-shm', '']) if (existsSync(dbVieja + sufijo)) renameSync(dbVieja + sufijo, db + sufijo)
  }
  return true
}

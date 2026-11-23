// Copiar, guardar y abrir lo que hay en un correo: texto, imágenes y adjuntos.
// Los archivos se copian como archivos de verdad (text/uri-list + x-special/gnome-copied-files),
// así que se pegan en Nautilus, en Discord, en Chrome o en otro correo.
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { app, BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage, shell } from 'electron'
import { rutaAdjunto } from './adjuntos'
import { DIR_REMOTO, type Remotas } from './remoto'

const DIR_TEMPORAL = join(homedir(), '.cache', 'nimbomail', 'portapapeles')
// Formatos del sistema tal cual (Electron 45: clipboard asíncrono con ClipboardItem).
const crudo = (f: string) => `electron application/osclipboard;format="${f}"`

/** Respaldo con wl-copy si Electron no pudo escribir (en Wayland hace falta el foco). */
function wlCopy(tipo: string, datos: Buffer): Promise<void> {
  return new Promise((ok, ko) => {
    const p = spawn('wl-copy', ['--type', tipo], { stdio: ['pipe', 'ignore', 'ignore'] })
    p.on('error', ko)
    p.on('spawn', () => {
      p.stdin.end(datos)
      ok()
    })
  })
}
const limpio = (n: string) => n.replace(/[/\\\0]/g, '_').slice(0, 180) || 'archivo'

const EXTENSIONES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
}

export class Portapapeles {
  constructor(private remotas: Remotas) {}

  /** Bytes de un recurso del correo: data:, nimbomail://adjunto/… o nimbomail://remoto/… */
  async leer(url: string): Promise<{ datos: Buffer; nombre: string; tipo: string; ruta?: string } | null> {
    const data = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
    if (data) {
      const tipo = data[1] || 'application/octet-stream'
      const datos = data[2] ? Buffer.from(data[3], 'base64') : Buffer.from(decodeURIComponent(data[3]))
      return { datos, tipo, nombre: `imagen.${EXTENSIONES[tipo] ?? 'bin'}` }
    }
    const adj = url.match(/^nimbomail:\/\/adjunto\/([0-9a-f]{20})\/(\d+)$/)
    if (adj) {
      const r = await rutaAdjunto(adj[1], adj[2])
      return r ? { datos: await readFile(r.ruta), nombre: r.nombre, tipo: '', ruta: r.ruta } : null
    }
    const rem = url.match(/^nimbomail:\/\/remoto\/([0-9a-f]{32})$/)
    if (rem && (await this.remotas.descargar(rem[1]))) {
      const ruta = join(DIR_REMOTO, rem[1])
      const tipo = this.remotas.tipo(rem[1]) ?? 'image/png'
      return { datos: await readFile(ruta), tipo, nombre: `imagen.${EXTENSIONES[tipo] ?? 'png'}`, ruta }
    }
    return null
  }

  async copiarTexto(texto: string) {
    await clipboard.writeText(String(texto))
  }

  async copiarImagen(url: string) {
    const r = await this.leer(url)
    if (!r) throw new Error('No se pudo leer la imagen')
    // Siempre como PNG, que es lo que entiende cualquier app al pegar.
    const img = nativeImage.createFromBuffer(r.datos)
    if (img.isEmpty()) throw new Error('Formato de imagen no compatible')
    const png = img.toPNG()
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
    if (!(await clipboard.has('image/png'))) await wlCopy('image/png', png)
  }

  /** Una copia con su nombre de verdad en una carpeta temporal (los de la caché llevan prefijo). */
  private async conNombre(url: string, nombre?: string): Promise<string> {
    const r = await this.leer(url)
    if (!r) throw new Error('No se pudo leer el archivo')
    const dir = join(DIR_TEMPORAL, String(Date.now()))
    await mkdir(dir, { recursive: true })
    const destino = join(dir, limpio(nombre || r.nombre))
    if (r.ruta && existsSync(r.ruta)) await copyFile(r.ruta, destino)
    else await writeFile(destino, r.datos)
    return destino
  }

  async copiarArchivo(url: string, nombre?: string) {
    const ruta = await this.conNombre(url, nombre)
    const uri = pathToFileURL(ruta).toString()
    await clipboard.write([
      new ClipboardItem({
        [crudo('text/uri-list')]: new Blob([uri + '\r\n']),
        [crudo('x-special/gnome-copied-files')]: new Blob([`copy\n${uri}`]),
      }),
    ])
    if (!(await clipboard.has('text/uri-list'))) await wlCopy('text/uri-list', Buffer.from(uri + '\r\n'))
  }

  async guardarComo(url: string, nombre?: string): Promise<boolean> {
    const r = await this.leer(url)
    if (!r) throw new Error('No se pudo leer el archivo')
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showSaveDialog(win, { defaultPath: join(app.getPath('downloads'), basename(limpio(nombre || r.nombre))) })
    if (res.canceled || !res.filePath) return false
    await writeFile(res.filePath, r.datos)
    return true
  }

  /** Abre con la aplicación predeterminada (para editar fuera de NimboMail). */
  async abrir(url: string, nombre?: string) {
    const error = await shell.openPath(await this.conNombre(url, nombre))
    if (error) throw new Error(error)
  }
}

import { enableCompileCache } from 'node:module'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import type { Borrador } from '@shared/tipos'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Servicio } from './servicio'
import { rutaAdjunto } from './adjuntos'
import { modeloListo, prepararTraductor, servirTraductor } from './traductor'

// Caché de compilación de V8 para el código del principal: arranques más rápidos.
enableCompileCache?.()

// El app_id de Wayland sale del nombre del .desktop: así Hyprland (y el icono de waybar) ven «tuxmail».
process.env.CHROME_DESKTOP = 'tuxmail.desktop'
app.setName('tuxmail')
app.commandLine.appendSwitch('ozone-platform-hint', 'auto')

const demo = process.argv.includes('--demo')
// CORREO_CAPTURA=/ruta.png: renderiza oculta, guarda una captura y sale (para revisar el diseño).
const captura = process.env.CORREO_CAPTURA
// Las capturas usan su propia carpeta de datos para no chocar con una TuxMail abierta.
if (captura) app.setPath('userData', join(app.getPath('temp'), 'tuxmail-captura'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'tuxmail', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

const servicio = new Servicio(app.getPath('userData'), demo)
const portapapeles = servicio.portapapeles

// Métodos que la interfaz puede llamar. Nada más pasa por IPC.
const API = {
  datos: () => servicio.datos(),
  lista: (buzon: Parameters<Servicio['lista']>[0], busqueda: string) => servicio.lista(buzon, busqueda),
  contadores: () => servicio.contadores(),
  hilo: (id: string) => servicio.hilo(id),
  cuerpo: (id: string) => servicio.cuerpo(id),
  precargar: (ids: string[]) => servicio.precargar(ids),
  traductorListo: () => modeloListo(),
  prepararTraductor: () => prepararTraductor(),
  guardarTraduccion: (id: string, html: string) => servicio.guardarTraduccion(id, html),
  borrarTraduccion: (id: string) => servicio.borrarTraduccion(id),
  copiarTexto: (texto: string) => portapapeles.copiarTexto(texto),
  copiarImagen: (url: string) => portapapeles.copiarImagen(url),
  copiarArchivo: (url: string, nombre?: string) => portapapeles.copiarArchivo(url, nombre),
  guardarComo: (url: string, nombre?: string) => portapapeles.guardarComo(url, nombre),
  abrirArchivo: (url: string, nombre?: string) => portapapeles.abrir(url, nombre),
  buscarWeb: (texto: string) => shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(String(texto).slice(0, 500))}`),
  remitenteASpam: (cuenta: string, direccion: string) => servicio.remitenteASpam(cuenta, direccion),
  prepararRespuesta: (id: string, tipo: 'responder' | 'responderTodos' | 'reenviar') => servicio.prepararRespuesta(id, tipo),
  enviar: (b: Borrador) => servicio.enviar(b),
  guardarBorrador: (b: Borrador) => servicio.guardarBorrador(b),
  descartarBorrador: (id: string) => servicio.descartarBorrador(id),
  abrirBorrador: (id: string) => servicio.abrirBorrador(id),
  archivosDeUris: (uris: string[]) => servicio.archivosDeUris(uris),
  detectarCuenta: (email: string) => servicio.detectarCuenta(email),
  oauthDisponibles: () => servicio.oauthDisponibles(),
  entrarConOAuth: (id: 'microsoft' | 'google', email: string, s: Parameters<Servicio['entrarConOAuth']>[2]) => servicio.entrarConOAuth(id, email, s),
  probarCuenta: (s: Parameters<Servicio['probarCuenta']>[0], clave: string) => servicio.probarCuenta(s, clave),
  anadirCuenta: (d: Parameters<Servicio['anadirCuenta']>[0]) => servicio.anadirCuenta(d),
  quitarCuenta: (id: string) => servicio.quitarCuenta(id),
  cambiarClave: (id: string, clave: string) => servicio.cambiarClave(id, clave),
  volverAEntrar: (id: string) => servicio.volverAEntrar(id),
  sincronizar: () => servicio.sincronizar(),
  calendarios: () => servicio.calendario.calendarios(),
  eventos: (desde: number, hasta: number) => servicio.calendario.instancias(desde, hasta),
  invitacionDe: (mensaje: string) => servicio.calendario.invitacionDe(mensaje),
  responderInvitacion: (id: string, partstat: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED') => servicio.responderInvitacion(id, partstat),
  suscribirCalendario: (nombre: string, url: string) => servicio.calendario.suscribir(nombre, url),
  quitarCalendario: (id: string) => servicio.calendario.quitar(id),
  mostrarCalendario: (id: string, visible: boolean) => servicio.calendario.mostrar(id, visible),
  actualizarCalendarios: () => servicio.calendario.actualizar(),
  elegirArchivos: async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], title: 'Adjuntar archivos' })
    return r.canceled ? [] : servicio.archivosDeUris(r.filePaths.map((p) => pathToFileURL(p).toString()))
  },
  contactos: (q: string) => servicio.contactos(q),
  marcar: (ids: string[], cambio: { leido?: boolean; marcado?: boolean }, deshacible?: boolean) =>
    servicio.marcar(ids, cambio, deshacible),
  mover: (ids: string[], destino: Parameters<Servicio['mover']>[1]) => servicio.mover(ids, destino),
  deshacer: () => servicio.deshacerUltimo(),
  crearCarpeta: (cuenta: string, nombre: string) => servicio.crearCarpeta(cuenta, nombre),
  renombrarCarpeta: (cuenta: string, ruta: string, nueva: string) => servicio.renombrarCarpeta(cuenta, ruta, nueva),
  borrarCarpeta: (cuenta: string, ruta: string) => servicio.borrarCarpeta(cuenta, ruta),
  abrirEnlace: (url: string) => {
    if (typeof url === 'string' && /^(https?|mailto):/.test(url)) shell.openExternal(url)
  },
}
export type ApiPrincipal = typeof API

function crearVentana(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 820,
    minHeight: 520,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'TuxMail',
    icon: join(import.meta.dirname, '../../resources/tuxmail.png'),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      plugins: true, // visor de PDF de Chromium para la vista rápida
      additionalArguments: [
        ...(demo ? ['--niebla-demo'] : []),
        ...(process.env.CORREO_VISTA ? [`--niebla-vista=${process.env.CORREO_VISTA}`] : []),
        ...(process.env.CORREO_SEL ? [`--niebla-sel=${process.env.CORREO_SEL}`] : []),
        ...(process.env.CORREO_ACENTO ? [`--niebla-acento=${process.env.CORREO_ACENTO}`] : []),
      ],
    },
  })

  if (captura) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message))
    win.webContents.on('render-process-gone', (_e, d) => console.log('[renderer] caído:', d.reason))
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        // CORREO_BAJAR=1: abre los mensajes plegados del hilo, baja el lector hasta el final y
        // escribe en la consola cuánto mide cada correo y cuánto texto queda fuera de las citas.
        if (process.env.CORREO_BAJAR) {
          await win.webContents.executeJavaScript(`document.querySelectorAll('.tarjeta:not(.abierta) .cabecera').forEach((c) => c.click())`)
          await new Promise((r) => setTimeout(r, 3000))
          await win.webContents.executeJavaScript(`[document.querySelector('.lector'), ...document.querySelectorAll('.lector *')].filter((e) => e && e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)).forEach((e) => e.scrollTo(0, 1e9))`)
          const marcos = await win.webContents.executeJavaScript(`[...document.querySelectorAll('.lector iframe')].map((f) => { const d = f.contentDocument; const c = d.body.cloneNode(true); c.querySelectorAll('details.tm-cita').forEach((x) => x.remove()); return 'alto=' + f.style.height + ' citas=' + d.querySelectorAll('details.tm-cita').length + ' texto-visible=' + c.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60).length + ' imagenes=' + d.images.length + ' cargadas=' + [...d.images].filter((i) => i.complete && i.naturalWidth > 0).length + ' origenes=' + [...new Set([...d.images].map((i) => i.src.split(':')[0]))].join('/') }).join(' || ')`)
          console.log('[captura] correos:', marcos)
          win.webContents.invalidate()
          await new Promise((r) => setTimeout(r, 500))
        }
        // CORREO_TRADUCIR=1: pulsa «Traducir» en el correo abierto y escribe cómo queda.
        if (process.env.CORREO_TRADUCIR) {
          const r = await win.webContents.executeJavaScript(`(async () => {
            const boton = document.querySelector('.aviso-barra.traducir button')
            if (!boton) return 'sin barra de traducir (¿no lo detecta como inglés?)'
            const t0 = performance.now()
            if (boton.textContent === 'Traducir') boton.click() // si ya estaba traducido, se lee tal cual
            for (;;) {
              await new Promise((r) => setTimeout(r, 100))
              const barra = document.querySelector('.aviso-barra.traducir span')?.textContent ?? ''
              if (/Traducido|No se pudo/.test(barra) || performance.now() - t0 > 120000) {
                const d = document.querySelector('.lector .tarjeta.abierta iframe')?.contentDocument
                const txt = (d?.body?.textContent ?? document.querySelector('.lector .texto')?.textContent ?? '').replace(/\\s+/g, ' ').slice(0, 700)
                return Math.round(performance.now() - t0) + ' ms · ' + barra + ' · iframes=' + document.querySelectorAll('.lector iframe').length + ' · ' + d?.URL + '\\n' + txt
              }
            }
          })()`)
          console.log('[captura] traducción:', r)
        }
        // CORREO_MEDIR=1: abre las 12 primeras conversaciones una a una y mide cuánto tarda cada
        // una en verse (desde el clic hasta que el correo está pintado en su iframe).
        if (process.env.CORREO_MEDIR) {
          const tiempos = await win.webContents.executeJavaScript(`(async () => {
            const filas = () => [...document.querySelectorAll('.fila')]
            const out = []
            for (let i = 0; i < 12; i++) {
              const f = filas()[i]
              if (!f) break
              const viejo = document.querySelector('.lector')
              const t0 = performance.now()
              f.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
              for (;;) {
                await new Promise((r) => setTimeout(r, 4))
                const lector = document.querySelector('.lector')
                if (performance.now() - t0 > 8000) break
                if (!lector || lector === viejo) continue // aún es la conversación anterior
                const fr = lector.querySelector('.tarjeta.abierta iframe, .tarjeta.abierta .texto')
                const d = fr?.tagName === 'IFRAME' ? fr.contentDocument : null
                if (fr && (fr.tagName !== 'IFRAME' || (d?.URL === 'about:srcdoc' && d.body?.childElementCount))) break
                if (performance.now() - t0 > 8000) break
              }
              if (performance.now() - t0 > 8000) { out.push('>8000'); continue }
              out.push(Math.round(performance.now() - t0))
              await new Promise((r) => setTimeout(r, 300))
            }
            return out.join(' ')
          })()`)
          console.log('[captura] ms por conversación:', tiempos)
        }
        // CORREO_JS='expresión': la evalúa en la interfaz (puede ser async) y escribe el resultado.
        if (process.env.CORREO_JS) {
          const r = await win.webContents.executeJavaScript(`(async () => ${process.env.CORREO_JS})()`).catch((e: Error) => 'ERROR ' + e.message)
          console.log('[captura] js:', typeof r === 'string' ? r : JSON.stringify(r, null, 1))
          await new Promise((r) => setTimeout(r, 800))
        }
        // CORREO_REDACTAR=1: abre «Responder» (Ctrl+R) sobre el correo seleccionado, sin escribir nada.
        if (process.env.CORREO_REDACTAR) {
          await win.webContents.executeJavaScript(
            `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true }))`,
          )
          await new Promise((r) => setTimeout(r, 2500))
        }
        // CORREO_MENU=fila|correo: clic derecho simulado (en una fila, o en un texto seleccionado del correo).
        if (process.env.CORREO_MENU) {
          await win.webContents.executeJavaScript(`(() => {
            if (${JSON.stringify(process.env.CORREO_MENU)} === 'fila') {
              const f = document.querySelectorAll('.fila')[2]
              const r = f.getBoundingClientRect()
              f.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 120, clientY: r.top + 30 }))
              return
            }
            const d = document.querySelector('.lector .tarjeta.abierta iframe').contentDocument
            const p = [...d.querySelectorAll('p, div, td')].find((x) => x.textContent.trim().length > 60 && !x.querySelector('p, div, td'))
            const rango = d.createRange()
            rango.selectNodeContents(p)
            d.getSelection().removeAllRanges()
            d.getSelection().addRange(rango)
            const r = p.getBoundingClientRect()
            p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 80, clientY: r.top + 10 }))
          })()`)
          await new Promise((r) => setTimeout(r, 1500))
        }
        const img = await win.webContents.capturePage()
        const { writeFile } = await import('node:fs/promises')
        await writeFile(captura, img.toPNG())
        app.quit()
      }, Number(process.env.CORREO_ESPERA ?? 1500))
    })
  } else {
    win.once('ready-to-show', () => win.show())
  }

  // Nada de abrir enlaces dentro de la app: van al navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      if (/^(https?|mailto):/.test(url)) shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
  return win
}

ipcMain.handle('tuxmail', async (_e, metodo: keyof typeof API, ...args: unknown[]) => {
  const fn = API[metodo] as ((...a: unknown[]) => unknown) | undefined
  if (!fn) throw new Error(`Método desconocido: ${String(metodo)}`)
  return fn(...args)
})

const aTodas = (canal: string, ...args: unknown[]) =>
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(canal, ...args))
servicio.on('cambios', () => aTodas('tuxmail:cambios'))
servicio.on('parche', (p: unknown) => aTodas('tuxmail:parche', p))
servicio.on('calendario', () => aTodas('tuxmail:calendario'))
servicio.on('error', (texto: string) => aTodas('tuxmail:error', texto))

app.whenReady().then(() => {
  // tuxmail://adjunto/<carpeta>/<índice> → archivo de la caché de adjuntos.
  // tuxmail://remoto/<suma> → imagen remota de un correo, de la caché (o descargada ahora por el principal).
  protocol.handle('tuxmail', async (req) => {
    const url = new URL(req.url)
    const [carpeta, indice] = url.pathname.replace(/^\//, '').split('/')
    if (url.hostname === 'remoto') return servicio.remotas.servir(carpeta)
    if (url.hostname === 'traductor') return servirTraductor(url.pathname)
    if (url.hostname !== 'adjunto') return new Response('No encontrado', { status: 404 })
    const r = await rutaAdjunto(carpeta, indice)
    if (!r) return new Response('No encontrado', { status: 404 })
    return net.fetch(pathToFileURL(r.ruta).toString())
  })

  crearVentana()
  servicio.arrancar()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => servicio.parar())

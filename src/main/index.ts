import { enableCompileCache } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, shell, Tray } from 'electron'
import type { Borrador } from '@shared/tipos'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Servicio } from './servicio'
import { rutaAdjunto } from './adjuntos'
import { migrarDeTuxMail } from './migracion'
import { estadoIdioma, idiomas, iniciarIdioma, ponerIdioma, t } from './idioma'
import { modeloListo, prepararTraductor, servirTraductor } from './traductor'

// Caché de compilación de V8 para el código del principal: arranques más rápidos.
enableCompileCache?.()

// El app_id de Wayland sale del nombre del .desktop: así Hyprland (y el icono de waybar) ven «nimbomail».
process.env.CHROME_DESKTOP = 'nimbomail.desktop'
app.setName('nimbomail')
app.commandLine.appendSwitch('ozone-platform-hint', 'auto')

const demo = process.argv.includes('--demo')
// CORREO_CAPTURA=/ruta.png: renderiza oculta, guarda una captura y sale (para revisar el diseño).
const captura = process.env.CORREO_CAPTURA
// Las capturas usan su propia carpeta de datos para no chocar con una NimboMail abierta.
if (captura) app.setPath('userData', join(app.getPath('temp'), 'nimbomail-captura'))

protocol.registerSchemesAsPrivileged([
  { scheme: 'nimbomail', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

// Antes se llamaba TuxMail: la primera vez se traen sus datos (antes de crear el candado de instancia única).
if (!demo && !captura && !migrarDeTuxMail()) {
  dialog.showErrorBox(t().principal.migracion.titulo, t().principal.migracion.cuerpo)
  app.exit(1)
  process.exit(1)
}

// Idioma (preferencia de Ajustes, o el del sistema). Chromium lo usa en los campos de fecha y hora,
// así que se fija al arrancar: si se cambia en marcha, esos campos lo cogen al volver a abrir la app.
iniciarIdioma(app.getPath('userData'))
app.commandLine.appendSwitch('lang', estadoIdioma().locale)

// Una sola NimboMail: si se vuelve a lanzar, se trae al frente la que ya está abierta.
if (!captura && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const servicio = new Servicio(app.getPath('userData'), demo)
let saliendo = false // true al salir de verdad (Salir, Ctrl+Q): si no, cerrar la ventana la oculta
let bandeja: Tray | null = null
const ICONO = join(import.meta.dirname, '../../resources/nimbomail.png')

const ventana = () => BrowserWindow.getAllWindows()[0] as BrowserWindow | undefined
function mostrar() {
  const w = ventana() ?? crearVentana()
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}
// mailto: (enlaces de correo del navegador u otras apps): «Mensaje nuevo» con el destinatario puesto.
const mailtoDe = (argv: string[]) => argv.find((a) => /^mailto:/i.test(a))
function abrirMailto(url: string) {
  mostrar()
  const w = ventana()
  if (!w) return
  const enviar = () => w.webContents.send('nimbomail:accion', url)
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => setTimeout(enviar, 400))
  else enviar()
}
app.on('second-instance', (_e, argv) => {
  const m = mailtoDe(argv)
  if (m) abrirMailto(m)
  else mostrar()
})
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
  suscripciones: () => servicio.suscripciones(),
  darseDeBaja: (cuenta: string, clave: string) => servicio.darseDeBajaClave(cuenta, clave),
  darseDeBajaDe: (id: string) => servicio.darseDeBajaDe(id),
  apuntarBaja: (cuenta: string, clave: string, metodo: string) => servicio.apuntarBaja(cuenta, clave, metodo),
  limpiarSuscripcion: (cuenta: string, clave: string, destino: 'trash' | 'archive' | 'junk') => servicio.limpiarSuscripcion(cuenta, clave, destino),
  calendarios: () => servicio.calendario.calendarios(),
  eventos: (desde: number, hasta: number) => servicio.calendario.instancias(desde, hasta),
  invitacionDe: (mensaje: string) => servicio.calendario.invitacionDe(mensaje),
  responderInvitacion: (id: string, partstat: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED') => servicio.responderInvitacion(id, partstat),
  suscribirCalendario: (nombre: string, url: string) => servicio.calendario.suscribir(nombre, url),
  quitarCalendario: (id: string) => servicio.calendario.quitar(id),
  mostrarCalendario: (id: string, visible: boolean) => servicio.calendario.mostrar(id, visible),
  colorCalendario: (id: string, color: string) => servicio.calendario.cambiarColor(id, color),
  guardarEvento: (d: Parameters<Servicio['calendario']['guardarEvento']>[0]) => servicio.calendario.guardarEvento(d),
  borrarEvento: (id: string) => servicio.calendario.borrarEvento(id),
  ponerAvisos: (id: string, minutos: number[]) => servicio.calendario.ponerAvisos(id, minutos),
  avisoReuniones: () => servicio.calendario.avisoReuniones(),
  ponerAvisoReuniones: (minutos: number) => servicio.calendario.ponerAvisoReuniones(minutos),
  actualizarCalendarios: () => servicio.calendario.actualizar(),
  elegirArchivos: async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], title: t().principal.adjuntarArchivos })
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
  cerrarVentana: () => ventana()?.close(), // con bandeja, la oculta
  salir: () => {
    saliendo = true
    app.quit()
  },
  ponerIdioma: (p: Parameters<typeof ponerIdioma>[0]) => ponerIdioma(p),
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
    title: 'NimboMail',
    icon: join(import.meta.dirname, '../../resources/nimbomail.png'),
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
            if (/^(Traducir|Translate)$/.test(boton.textContent)) boton.click() // si ya estaba traducido, se lee tal cual
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
    // Con --hidden (o --oculto, el nombre antiguo; arranque con la sesión) se queda solo en la bandeja.
    win.once('ready-to-show', () => !process.argv.some((a) => a === '--hidden' || a === '--oculto') && win.show())
    // Cerrar la ventana no cierra NimboMail: sigue en la bandeja para el correo nuevo y los avisos.
    win.on('close', (e) => {
      if (saliendo || !bandeja) return
      e.preventDefault()
      win.hide()
      avisarBandeja()
    })
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

ipcMain.handle('nimbomail', async (_e, metodo: keyof typeof API, ...args: unknown[]) => {
  const fn = API[metodo] as ((...a: unknown[]) => unknown) | undefined
  if (!fn) throw new Error(`Método desconocido: ${String(metodo)}`)
  return fn(...args)
})

const aTodas = (canal: string, ...args: unknown[]) =>
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(canal, ...args))

// El preload pide el idioma de forma síncrona para que la interfaz salga ya en su idioma.
ipcMain.on('nimbomail:idioma', (e) => {
  e.returnValue = estadoIdioma()
})
idiomas.on('cambio', (estado) => {
  aTodas('nimbomail:idioma', estado)
  // Los nombres de las carpetas especiales y de «Mis eventos» se traducen al leerlos: que se vuelvan a pedir.
  aTodas('nimbomail:cambios')
  aTodas('nimbomail:calendario')
  menuBandeja()
  actualizarBandeja()
})
servicio.on('cambios', () => aTodas('nimbomail:cambios'))
servicio.on('parche', (p: unknown) => aTodas('nimbomail:parche', p))
servicio.on('calendario', () => aTodas('nimbomail:calendario'))

// Avisos del calendario: notificación del sistema (sale en la isla). Al pulsarla, el calendario en ese día.
servicio.calendario.on('aviso', (a: { titulo: string; cuerpo: string; inicio: number }) => {
  if (captura) return console.log('[captura] aviso:', a.titulo, '·', a.cuerpo) // en pruebas, al registro
  if (!Notification.isSupported()) return
  const n = new Notification({ title: a.titulo, body: a.cuerpo, icon: join(import.meta.dirname, '../../resources/nimbomail.png') })
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('nimbomail:ir-a-dia', a.inicio)
  })
  n.show()
})
servicio.on('error', (texto: string) => aTodas('nimbomail:error', texto))

app.whenReady().then(() => {
  // nimbomail://adjunto/<carpeta>/<índice> → archivo de la caché de adjuntos.
  // nimbomail://remoto/<suma> → imagen remota de un correo, de la caché (o descargada ahora por el principal).
  protocol.handle('nimbomail', async (req) => {
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
  if (!captura) crearBandeja()
  const mailto = mailtoDe(process.argv)
  if (mailto) abrirMailto(mailto)
  servicio.arrancar()
  app.on('activate', () => mostrar())
})

/** Icono en la bandeja del sistema (StatusNotifierItem: sale en la waybar como el de Slack o Vesktop). */
function crearBandeja() {
  try {
    bandeja = new Tray(nativeImage.createFromPath(ICONO).resize({ width: 64, height: 64 }))
  } catch (e) {
    console.error('[bandeja] no se pudo crear:', (e as Error).message)
    return
  }
  bandeja.setToolTip('NimboMail')
  menuBandeja()
  // Clic: abre la ventana, o la oculta si ya está delante.
  bandeja.on('click', () => {
    const w = ventana()
    if (w?.isVisible() && w.isFocused()) w.hide()
    else mostrar()
  })
  actualizarBandeja()
}

/** El menú del icono (se rehace al cambiar de idioma). */
function menuBandeja() {
  if (!bandeja) return
  const tb = t().principal.bandeja
  const accion = (a: string) => {
    mostrar()
    ventana()?.webContents.send('nimbomail:accion', a)
  }
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: tb.abrir, click: () => mostrar() },
      { label: tb.obtenerCorreo, click: () => servicio.sincronizar().catch(() => {}) },
      { label: tb.mensajeNuevo, click: () => accion('redactar') },
      { type: 'separator' },
      {
        label: tb.salir,
        click: () => {
          saliendo = true
          app.quit()
        },
      },
    ]),
  )
}

// El número de no leídos, al pasar el ratón por el icono.
let avisoBandeja: NodeJS.Timeout | null = null
function actualizarBandeja() {
  if (!bandeja || avisoBandeja) return
  avisoBandeja = setTimeout(() => {
    avisoBandeja = null
    const n = servicio.contadores()['todas:inbox'] ?? 0
    bandeja?.setToolTip(n ? t().principal.bandeja.sinLeer(n) : 'NimboMail')
  }, 500)
}
servicio.on('cambios', actualizarBandeja)
servicio.on('parche', actualizarBandeja)

/** La primera vez que se cierra la ventana, se explica que NimboMail sigue en la bandeja. */
function avisarBandeja() {
  const marca = join(app.getPath('userData'), '.bandeja-avisada')
  if (existsSync(marca) || !Notification.isSupported()) return
  writeFileSync(marca, '')
  new Notification({
    title: t().principal.bandeja.sigueTitulo,
    body: t().principal.bandeja.sigueCuerpo,
    icon: ICONO,
  }).show()
}

app.on('window-all-closed', () => {
  if (!bandeja || saliendo) app.quit() // con bandeja, NimboMail sigue en marcha
})
app.on('before-quit', () => {
  saliendo = true
  servicio.parar()
})

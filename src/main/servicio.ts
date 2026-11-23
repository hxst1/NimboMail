// Une base de datos y motores IMAP. Las acciones se aplican al momento en la caché
// (la interfaz no espera a la red) y después en el servidor; si fallan, se revierten.
import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simpleParser, type AddressObject } from 'mailparser'
import type { AdjuntoBorrador, Borrador, Buzon, Cuerpo, Datos, DatosRespuesta, Direccion, EstadoCuenta, Mensaje, RolCarpeta, Suscripcion } from '@shared/tipos'
import { shell } from 'electron'
import type { InfoBaja } from './baja'
import { borrarSecreto, escribirCuentas, guardarSecreto, leerCuentas, SinClave, type ConfigCuenta, type TipoAuth } from './cuentas'
import { detectar, probar, type Servidores } from './autoconfig'
import { iniciarSesion, oauthDisponible, type IdOAuth } from './oauth'
import { Db, idMensaje } from './db'
import { Motor, type EventoMotor } from './motor'
import { Remotas } from './remoto'
import { leerAdjunto, ponerDescargador } from './adjuntos'
import { Calendario } from './calendario'
import { respuesta as respuestaIcs } from './ics'
import { Portapapeles } from './portapapeles'
import { Smtp } from './smtp'
import * as demo from './demo'

type Deshacer =
  | { tipo: 'flags'; ids: string[]; previo: Map<string, { leido: boolean; marcado: boolean }> }
  | { tipo: 'mover'; movidos: { id: string; origen: string }[] }

export type Destino = { rol: RolCarpeta } | { ruta: string }

/** Cambio de flags para la lista: se parchea la fila sin volver a pedir la lista entera. */
export interface Parche {
  hilos: { cuenta: string; hilo: string; leido: boolean }[]
  marcados: { id: string; marcado: boolean }[]
}

export class Servicio extends EventEmitter {
  private db: Db
  readonly remotas: Remotas
  readonly portapapeles: Portapapeles
  readonly calendario: Calendario
  private smtp: Smtp
  private cuentas: ConfigCuenta[] = []
  private motores = new Map<string, Motor>()
  private estados = new Map<string, EstadoCuenta>()
  private deshacer: Deshacer[] = []
  private aviso: NodeJS.Timeout | null = null
  private tmp = -1

  constructor(
    dirDatos: string,
    readonly demo: boolean,
  ) {
    super()
    mkdirSync(dirDatos, { recursive: true })
    this.db = new Db(demo ? ':memory:' : join(dirDatos, 'nimbomail.db'))
    this.remotas = new Remotas(this.db)
    this.portapapeles = new Portapapeles(this.remotas)
    this.smtp = new Smtp(this.portapapeles)
    this.calendario = new Calendario(this.db, demo ? null : join(homedir(), '.local', 'share', 'nimbomail'))
    this.calendario.on('cambios', () => this.emit('calendario'))
    if (demo) {
      demo_sembrar(this.db)
      demo_calendario(this.calendario)
    }
    // Adjuntos de correos grandes que aún no están en disco: los baja el motor de su cuenta.
    ponerDescargador((id, parte) => {
      const m = this.motores.get(id.split('\u0000')[0])
      if (!m) throw new Error('Cuenta no disponible')
      return m.descargarParte(id, parte)
    })
  }

  async arrancar() {
    if (this.demo) return
    this.cuentas = leerCuentas()
    for (const c of this.cuentas) this.arrancarMotor(c)
    this.calendario.arrancar()
    setTimeout(() => this.invitacionesGuardadas().catch(() => {}), 3000)
  }

  /** Invitaciones de correos que ya estaban en la caché (descargados antes de tener calendario). */
  private async invitacionesGuardadas() {
    for (const f of this.db.cuerposConCalendario()) {
      for (const a of JSON.parse(f.adjuntos) as { nombre: string; tipo: string; url: string }[]) {
        if (!/text\/calendar|application\/ics/i.test(a.tipo) && !/\.ics$/i.test(a.nombre)) continue
        const r = await leerAdjunto(a.url).catch(() => null)
        if (r) this.alEvento(f.cuenta, { tipo: 'invitacion', id: f.id, ics: r.datos.toString('utf8') })
      }
    }
  }

  private arrancarMotor(c: ConfigCuenta) {
    this.motores.get(c.id)?.parar()
    const m = new Motor(c, this.db, this.remotas)
    m.on('evento', (e: EventoMotor) => this.alEvento(c.id, e))
    this.motores.set(c.id, m)
    m.arrancar().catch(() => {})
  }

  /** «Obtener correo nuevo»: repasa todas las carpetas ya (y reconecta las cuentas caídas). */
  async sincronizar() {
    if (this.demo) return new Promise((r) => setTimeout(r, 600))
    await Promise.all(
      this.cuentas.map(async (c) => {
        const estado = this.estados.get(c.id)?.estado
        if (estado === 'error' || estado === 'sin-clave') return this.arrancarMotor(c)
        await this.motores.get(c.id)?.sincronizarTodo()
        this.motores.get(c.id)?.precargar()
      }),
    )
    this.cambios()
  }

  // ------------------------------------------------------------ alta y baja de cuentas

  detectarCuenta(email: string) {
    return detectar(email)
  }

  oauthDisponibles(): Record<IdOAuth, boolean> {
    return { microsoft: oauthDisponible('microsoft'), google: oauthDisponible('google') }
  }

  // Token de renovación entre el inicio de sesión y «Añadir»: solo en memoria.
  private oauthPendiente = new Map<string, string>()

  /** Abre el navegador para entrar con Microsoft (o Google) y prueba la conexión con el token. */
  async entrarConOAuth(id: IdOAuth, email: string, s: Servidores) {
    const t = await iniciarSesion(id, email)
    if (!t.renovacion) throw new Error('El proveedor no dio permiso para seguir conectado')
    this.oauthPendiente.set(email.toLowerCase(), t.renovacion)
    return probar(s, { accessToken: t.acceso })
  }

  probarCuenta(s: Servidores, clave: string) {
    return probar(s, { pass: clave })
  }

  async anadirCuenta(d: { nombre: string; etiqueta: string; direccion: string; servidores: Servidores; auth: TipoAuth; clave?: string }) {
    const direccion = d.direccion.trim().toLowerCase()
    if (this.cuentas.some((c) => c.direccion === direccion)) throw new Error('Esa cuenta ya está en NimboMail')
    const valor = d.auth === 'clave' ? d.clave : this.oauthPendiente.get(direccion)
    if (!valor) throw new Error(d.auth === 'clave' ? 'Falta la contraseña' : 'Hay que iniciar sesión primero')
    await guardarSecreto(direccion, valor)
    this.oauthPendiente.delete(direccion)
    // id corto y estable a partir del nombre de la cuenta («Trabajo» → «trabajo», «trabajo-2»…)
    const base = d.etiqueta.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cuenta'
    let id = base
    for (let n = 2; this.cuentas.some((c) => c.id === id); n++) id = `${base}-${n}`
    const c: ConfigCuenta = {
      id,
      nombre: d.nombre.trim(),
      etiqueta: d.etiqueta.trim() || direccion,
      direccion,
      usuario: d.servidores.usuario || direccion,
      imap: d.servidores.imap,
      puerto: d.servidores.puerto,
      tlsNombre: d.servidores.tlsNombre,
      smtp: d.servidores.smtp,
      smtpPuerto: d.servidores.smtpPuerto,
      auth: d.auth,
      gmail: d.servidores.imap.endsWith('gmail.com'),
    }
    this.cuentas = [...this.cuentas, c]
    escribirCuentas(this.cuentas)
    this.arrancarMotor(c)
    this.cambios()
    return id
  }

  /** Quita la cuenta de NimboMail: su configuración, su contraseña y su caché local (nada del servidor). */
  async quitarCuenta(id: string) {
    const c = this.cuentas.find((x) => x.id === id)
    if (!c) return
    this.motores.get(id)?.parar()
    this.motores.delete(id)
    this.estados.delete(id)
    this.cuentas = this.cuentas.filter((x) => x.id !== id)
    escribirCuentas(this.cuentas)
    await borrarSecreto(c.direccion)
    this.db.borrarCuenta(id)
    this.calendario.borrarCuenta(id)
    this.cambios()
  }

  async cambiarClave(id: string, clave: string) {
    const c = this.cuentas.find((x) => x.id === id)
    if (!c) throw new Error('Cuenta no encontrada')
    const r = await probar({ imap: c.imap, puerto: c.puerto, smtp: c.smtp, smtpPuerto: c.smtpPuerto, usuario: c.usuario, tlsNombre: c.tlsNombre }, { pass: clave })
    if (!r.ok && r.motivo === 'clave') return r
    await guardarSecreto(c.direccion, clave)
    this.arrancarMotor(c)
    return r
  }

  /** Vuelve a iniciar sesión (OAuth caducado o revocado). */
  async volverAEntrar(id: string) {
    const c = this.cuentas.find((x) => x.id === id)
    if (!c || c.auth === 'clave') throw new Error('Esta cuenta usa contraseña')
    const t = await iniciarSesion(c.auth, c.direccion)
    if (t.renovacion) await guardarSecreto(c.direccion, t.renovacion)
    this.arrancarMotor(c)
  }

  parar() {
    this.motores.forEach((m) => m.parar())
    this.calendario.parar()
    this.db.cerrar()
  }

  private alEvento(cuenta: string, e: EventoMotor) {
    if (e.tipo === 'cambios') return this.cambios()
    if (e.tipo === 'invitacion') {
      const m = this.db.mensaje(e.id)
      const c = this.cuentas.find((x) => x.id === cuenta)
      if (m && c) this.calendario.procesarInvitacion(cuenta, c.etiqueta, e.id, m.fecha, e.ics, c.direccion.toLowerCase())
      return
    }
    if (e.tipo === 'nuevos') return this.emit('nuevos', e.ids.map((id) => this.db.mensaje(id)).filter(Boolean))
    if (e.tipo === 'estado') {
      const sinClave = e.detalle?.includes('Falta la contraseña')
      this.estados.set(cuenta, { id: cuenta, estado: sinClave ? 'sin-clave' : e.estado, detalle: e.detalle })
      this.cambios()
    }
  }

  /** Avisa a la interfaz, agrupando ráfagas (la sincronización inicial emite mucho). */
  private cambios() {
    if (this.aviso) return
    this.aviso = setTimeout(() => {
      this.aviso = null
      this.emit('cambios')
    }, 120)
  }

  // ------------------------------------------------------------ lectura

  datos(): Datos {
    const cuentas = this.demo
      ? demo.cuentas
      : this.cuentas.map((c) => ({ id: c.id, nombre: c.etiqueta, direccion: c.direccion, remitente: c.nombre, auth: c.auth }))
    return { cuentas, carpetas: this.db.carpetas(), estados: [...this.estados.values()] }
  }

  lista(buzon: Buzon, busqueda: string): Mensaje[] {
    return this.db.lista(buzon, busqueda)
  }

  contadores(): Record<string, number> {
    const r: Record<string, number> = {
      'todas:inbox': this.db.contar({ tipo: 'todas', rol: 'inbox' }, true),
      marcados: this.db.contar({ tipo: 'marcados' }, false),
      hoy: this.db.contar({ tipo: 'hoy' }, true),
    }
    return r
  }

  hilo(id: string): Mensaje[] {
    const m = this.db.mensaje(id)
    return m ? this.db.hilo(m.cuenta, m.hilo) : []
  }

  async cuerpo(id: string): Promise<Cuerpo> {
    const m = this.db.mensaje(id)
    if (!m) throw new Error('Mensaje no encontrado')
    if (this.demo) return demo.cuerpoDemo(m)
    const motor = this.motores.get(m.cuenta)
    if (!motor) throw new Error('Cuenta no disponible')
    return motor.cuerpo(id)
  }

  /** Precarga en caliente: los vecinos de la selección, detrás de lo que se abre. */
  precargar(ids: string[]) {
    if (this.demo) return
    const porCuenta = new Map<string, string[]>()
    for (const id of ids.slice(0, 20)) {
      const c = id.split('\u0000')[0]
      porCuenta.set(c, [...(porCuenta.get(c) ?? []), id])
    }
    for (const [c, lista] of porCuenta) this.motores.get(c)?.precargarIds(lista)
  }

  /** Avisa a la interfaz de un cambio de flags sin pedirle que recargue la lista. */
  private parchear(ids: string[], cambio: { leido?: boolean; marcado?: boolean }) {
    const pares = new Map<string, { cuenta: string; hilo: string }>()
    const marcados: Parche['marcados'] = []
    for (const id of ids) {
      const m = this.db.mensaje(id)
      if (!m) continue
      pares.set(`${m.cuenta}\u0000${m.hilo}`, { cuenta: m.cuenta, hilo: m.hilo })
      if (cambio.marcado !== undefined) marcados.push({ id, marcado: m.marcado })
    }
    const parche: Parche = { hilos: cambio.leido !== undefined ? this.db.hilosLeidos([...pares.values()]) : [], marcados }
    this.emit('parche', parche)
  }

  /** Todo lo de un remitente en esa cuenta (fuera de spam y papelera) → spam. Se puede deshacer. */
  async remitenteASpam(cuenta: string, direccion: string) {
    const ids = this.db.idsDeRemitente(cuenta, direccion)
    if (ids.length) await this.mover(ids, { rol: 'junk' })
    return ids.length
  }

  // ------------------------------------------------------------ redactar

  private config(cuenta: string) {
    const c = this.cuentas.find((x) => x.id === cuenta)
    if (!c) throw new Error('Cuenta no disponible')
    return c
  }

  /** Destinatarios, asunto, cabeceras de hilo y cabecera de la cita para responder o reenviar. */
  async prepararRespuesta(id: string, tipo: 'responder' | 'responderTodos' | 'reenviar'): Promise<DatosRespuesta> {
    const m = this.db.mensaje(id)
    const cab = this.db.cabeceras(id)
    if (!m || !cab) throw new Error('Mensaje no encontrado')
    const yo = (this.cuentas.find((c) => c.id === m.cuenta)?.direccion ?? '').toLowerCase()
    const mio = m.de.direccion.toLowerCase() === yo
    const sinRepetir = (l: Direccion[], fuera: string[] = []) => {
      const vistos = new Set(fuera.map((x) => x.toLowerCase()))
      return l.filter((d) => d.direccion && !vistos.has(d.direccion.toLowerCase()) && vistos.add(d.direccion.toLowerCase()))
    }
    let para: Direccion[] = []
    let cc: Direccion[] = []
    if (tipo !== 'reenviar') {
      // Respondiendo a algo que mandé yo: a los mismos destinatarios.
      para = mio ? sinRepetir(m.para, [yo]) : [m.de]
      if (tipo === 'responderTodos') cc = sinRepetir(mio ? m.cc : [...m.para, ...m.cc], [yo, ...para.map((d) => d.direccion)])
    }
    const base = m.asunto.replace(/^((re|rv|fw|fwd|reenviado)\s*:\s*)+/i, '')
    const fecha = new Date(m.fecha).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const quien = m.de.nombre ? `${m.de.nombre} <${m.de.direccion}>` : m.de.direccion
    const lista = (l: Direccion[]) => l.map((d) => (d.nombre ? `${d.nombre} <${d.direccion}>` : d.direccion)).join(', ')
    const cuerpo = tipo === 'reenviar' ? await this.cuerpo(id).catch(() => null) : null
    return {
      cuenta: m.cuenta,
      para,
      cc,
      asunto: `${tipo === 'reenviar' ? 'Fwd' : 'Re'}: ${base}`,
      enRespuestaA: tipo === 'reenviar' ? null : cab.msgid,
      referencias: tipo === 'reenviar' ? [] : [...cab.referencias, ...(cab.msgid ? [cab.msgid] : [])].slice(-20),
      respondeA: id,
      cabeceraCita:
        tipo === 'reenviar'
          ? `---------- Mensaje reenviado ----------\nDe: ${quien}\nFecha: ${fecha}\nAsunto: ${m.asunto}\nPara: ${lista(m.para)}${m.cc.length ? `\nCC: ${lista(m.cc)}` : ''}`
          : `El ${fecha}, ${quien} escribió:`,
      adjuntos: cuerpo?.adjuntos.filter((a) => !a.inline) ?? [],
    }
  }

  /** Las imágenes de la caché de NimboMail no significan nada fuera: vuelven a su URL original. */
  private paraFuera(b: Borrador): Borrador {
    const html = b.html.replace(/nimbomail:\/\/remoto\/([0-9a-f]{32})/g, (_m, s: string) => this.db.remota(s)?.url ?? '')
    return { ...b, html }
  }

  async enviar(original: Borrador) {
    const b = this.paraFuera(original)
    const c = this.config(b.cuenta)
    const motor = this.motores.get(b.cuenta)
    const ids = this.smtp.nuevosIds(c)
    await this.smtp.enviar(c, b, ids)
    // Gmail guarda sola la copia en Enviados; la mayoría de servidores IMAP, no.
    if (!c.gmail && motor) {
      const ruta = this.db.rutaPorRol(b.cuenta, 'sent')
      if (ruta) {
        const raw = await this.smtp.construir(c, b, ids)
        await motor.anexar(ruta, raw, ['\\Seen']).catch((e) => this.fallo('Enviado, pero no se pudo guardar en Enviados', e))
      }
    }
    if (b.respondeA) motor?.marcarRespondido(b.respondeA).catch(() => {})
    if (b.borradorId) this.descartarBorrador(b.borradorId).catch(() => {})
    this.db.usarContactos([...b.para, ...b.cc, ...b.cco])
    this.cambios()
  }

  /** Guarda (o sustituye) el borrador en la carpeta Borradores del servidor. Devuelve su id. */
  async guardarBorrador(original: Borrador): Promise<string | null> {
    const b = this.paraFuera(original)
    const c = this.config(b.cuenta)
    const motor = this.motores.get(b.cuenta)
    const ruta = this.db.rutaPorRol(b.cuenta, 'drafts')
    if (!motor || !ruta) throw new Error('La cuenta no tiene carpeta de borradores')
    const raw = await this.smtp.construir(c, b, this.smtp.nuevosIds(c))
    const uid = await motor.anexar(ruta, raw, ['\\Draft', '\\Seen'])
    if (b.borradorId) await this.descartarBorrador(b.borradorId).catch(() => {})
    return uid ? idMensaje(b.cuenta, ruta, uid) : null
  }

  async descartarBorrador(id: string) {
    const u = this.db.ubicacion(id)
    if (!u) return
    this.db.borrarMensajes([id])
    this.cambios()
    await this.motores.get(u.cuenta)?.borrarUid(u.carpeta, u.uid)
  }

  /** Un borrador guardado (por ejemplo, uno que escribió Claude), listo para la ventana de redactar. */
  async abrirBorrador(id: string): Promise<Borrador> {
    const u = this.db.ubicacion(id)
    const motor = u && this.motores.get(u.cuenta)
    if (!u || !motor) throw new Error('Borrador no disponible')
    const p = await simpleParser(await motor.fuente(id))
    const dirs = (a?: AddressObject | AddressObject[]) =>
      (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => ({ nombre: v.name ?? '', direccion: v.address ?? '' }))
    const dir = join(homedir(), '.cache', 'nimbomail', 'borradores', String(Date.now()))
    const adjuntos: AdjuntoBorrador[] = []
    for (const a of p.attachments.filter((x) => !x.related)) {
      await mkdir(dir, { recursive: true })
      const ruta = join(dir, (a.filename ?? 'adjunto').replace(/[/\\\0]/g, '_'))
      await writeFile(ruta, a.content)
      adjuntos.push({ nombre: a.filename ?? 'adjunto', tamano: a.size, tipo: a.contentType, ruta })
    }
    const refs = p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : []
    return {
      cuenta: u.cuenta,
      para: dirs(p.to),
      cc: dirs(p.cc),
      cco: dirs(p.bcc),
      asunto: p.subject ?? '',
      html: typeof p.html === 'string' ? p.html : (p.textAsHtml ?? ''),
      enRespuestaA: p.inReplyTo ?? null,
      referencias: refs,
      borradorId: id,
      adjuntos,
    }
  }

  /** Archivos pegados desde el gestor de archivos (text/uri-list con file://). */
  async archivosDeUris(uris: string[]): Promise<AdjuntoBorrador[]> {
    const out: AdjuntoBorrador[] = []
    for (const u of uris) {
      if (!/^file:\/\//.test(u)) continue
      const ruta = fileURLToPath(u)
      const s = await stat(ruta).catch(() => null)
      if (s?.isFile()) out.push({ nombre: ruta.split('/').pop() ?? 'archivo', tamano: s.size, ruta })
    }
    return out
  }

  // ------------------------------------------------------------ suscripciones (boletines)

  suscripciones(): Suscripcion[] {
    return this.db.suscripciones().map((f) => {
      const info = JSON.parse(f.baja) as InfoBaja
      return {
        clave: f.clave,
        cuenta: f.cuenta,
        nombre: f.nombre,
        direccion: f.direccion,
        asunto: f.asunto,
        ultimo: f.ultimo,
        ultima: f.ultima,
        total: f.total,
        sinLeer: f.sin_leer,
        aLaVista: f.a_la_vista,
        metodo: info.unClic ? 'un-clic' : info.correo ? 'correo' : 'web',
        bajaFecha: f.baja_fecha,
        bajaMetodo: f.baja_metodo,
      }
    })
  }

  /**
   * Darse de baja: de un clic si el remitente lo admite (RFC 8058, sin abrir nada), si no con el
   * correo de baja desde la cuenta que lo recibe y, como último recurso, abriendo su página.
   */
  async darseDeBaja(cuenta: string, clave: string, info: InfoBaja): Promise<'un-clic' | 'correo' | 'web'> {
    let metodo: 'un-clic' | 'correo' | 'web' | null = null
    if (info.unClic && info.web[0] && !this.demo) {
      try {
        const r = await fetch(info.web[0], {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64)' },
          body: 'List-Unsubscribe=One-Click',
          credentials: 'omit',
          redirect: 'follow',
          signal: AbortSignal.timeout(20_000),
        })
        if (r.ok) metodo = 'un-clic'
      } catch {
        /* se prueba por correo */
      }
    }
    if (!metodo && info.correo && !this.demo) {
      const u = new URL(info.correo)
      const c = this.config(cuenta)
      await this.smtp.enviarTexto(c, {
        para: decodeURIComponent(u.pathname),
        asunto: u.searchParams.get('subject') || 'unsubscribe',
        texto: u.searchParams.get('body') || 'unsubscribe',
      })
      metodo = 'correo'
    }
    if (!metodo && this.demo) metodo = info.unClic ? 'un-clic' : info.correo ? 'correo' : 'web'
    if (!metodo) {
      const web = info.web[0]
      if (!web) throw new Error('Este remitente no ofrece forma de darse de baja')
      await shell.openExternal(web)
      metodo = 'web'
    }
    this.db.apuntarBaja(`${cuenta}|${clave}`, metodo)
    this.cambios()
    return metodo
  }

  async darseDeBajaDe(id: string) {
    const b = this.db.bajaDe(id)
    if (!b?.baja) throw new Error('Este correo no ofrece forma de darse de baja')
    return this.darseDeBaja(b.cuenta, b.clave, JSON.parse(b.baja) as InfoBaja)
  }

  async darseDeBajaClave(cuenta: string, clave: string) {
    const s = this.db.suscripciones().find((x) => x.cuenta === cuenta && x.clave === clave)
    if (!s) throw new Error('Suscripción no encontrada')
    return this.darseDeBaja(cuenta, clave, JSON.parse(s.baja) as InfoBaja)
  }

  /** Apunta una baja sin contactar con nadie (otras campañas del mismo boletín ya dado de baja). */
  apuntarBaja(cuenta: string, clave: string, metodo: string) {
    this.db.apuntarBaja(`${cuenta}|${clave}`, metodo)
    this.cambios()
  }

  /** Todos los correos de una suscripción a la papelera, al archivo o a spam (se puede deshacer). */
  async limpiarSuscripcion(cuenta: string, clave: string, destino: 'trash' | 'archive' | 'junk') {
    const ids = this.db.idsDeSuscripcion(cuenta, clave)
    if (ids.length) await this.mover(ids, { rol: destino })
    return ids.length
  }

  // ------------------------------------------------------------ calendario

  /** Aceptar, quizá o rechazar: responde al organizador (iMIP) y lo apunta. */
  async responderInvitacion(id: string, partstat: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED') {
    const e = this.calendario.evento(id)
    if (!e) throw new Error('Invitación no encontrada')
    if (!this.demo && e.ev.organizador?.direccion && e.cuenta) {
      const c = this.config(e.cuenta)
      const quien = c.nombre || c.direccion
      const verbo = { ACCEPTED: ['Aceptado', 'ha aceptado'], TENTATIVE: ['Quizá', 'quizá asista a'], DECLINED: ['Rechazado', 'ha rechazado'] }[partstat]
      await this.smtp.enviarIcal(c, {
        para: { nombre: e.ev.organizador.nombre, direccion: e.ev.organizador.direccion },
        asunto: `${verbo[0]}: ${e.ev.titulo}`,
        texto: `${quien} ${verbo[1]} la invitación «${e.ev.titulo}».`,
        ical: respuestaIcs(e.ev, { nombre: c.nombre, direccion: c.direccion }, partstat),
      })
    }
    this.calendario.guardarRespuesta(id, partstat)
  }

  guardarTraduccion(id: string, html: string) {
    this.db.guardarTraduccion(id, html)
  }

  borrarTraduccion(id: string) {
    this.db.guardarTraduccion(id, null)
  }

  contactos(q: string): Direccion[] {
    return this.db.contactos(q)
  }

  // ------------------------------------------------------------ acciones

  async marcar(ids: string[], cambio: { leido?: boolean; marcado?: boolean }, deshacible = true) {
    const previo = new Map<string, { leido: boolean; marcado: boolean }>()
    for (const id of ids) {
      const u = this.db.ubicacion(id)
      if (u) previo.set(id, { leido: !!u.leido, marcado: !!u.marcado })
      this.db.flags(id, cambio)
    }
    if (deshacible) this.apilar({ tipo: 'flags', ids, previo })
    this.parchear(ids, cambio)
    if (this.demo) return
    await Promise.all(
      ids.map(async (id) => {
        const u = this.db.ubicacion(id)
        try {
          await this.motores.get(u?.cuenta ?? '')?.flags(id, cambio)
        } catch (err) {
          const p = previo.get(id)
          if (p) this.db.flags(id, p)
          this.fallo('No se pudo cambiar el mensaje', err)
        }
      }),
    )
  }

  private rutaDestino(cuenta: string, d: Destino): string | undefined {
    return 'ruta' in d ? d.ruta : this.db.rutaPorRol(cuenta, d.rol)
  }

  async mover(ids: string[], destino: Destino, deshacible = true) {
    const movidos: { id: string; origen: string }[] = []
    const trabajos: Promise<void>[] = []
    for (const id of ids) {
      const u = this.db.ubicacion(id)
      if (!u) continue
      const ruta = this.rutaDestino(u.cuenta, destino)
      if (!ruta || ruta === u.carpeta) continue
      // Al momento en la caché, con un UID provisional negativo hasta que el servidor dé el real.
      const provisional = this.db.moverMensaje(id, ruta, this.tmp--)
      if (!provisional) continue
      const entrada = { id: provisional, origen: u.carpeta }
      movidos.push(entrada)
      if (this.demo) continue
      const motor = this.motores.get(u.cuenta)
      trabajos.push(
        (async () => {
          try {
            const nuevoUid = await motor!.mover(u.carpeta, u.uid, ruta)
            if (nuevoUid) {
              try {
                entrada.id = this.db.moverMensaje(provisional, ruta, nuevoUid) ?? entrada.id
              } catch {
                this.db.borrarMensajes([provisional]) // ya lo trajo la sincronización del destino
              }
            } else {
              this.db.borrarMensajes([provisional])
              motor!.sincronizarCarpeta(ruta).catch(() => {})
            }
          } catch (err) {
            // Vuelve a su sitio con su UID de siempre.
            this.db.moverMensaje(provisional, u.carpeta, u.uid)
            movidos.splice(movidos.indexOf(entrada), 1)
            this.fallo('No se pudo mover el mensaje', err)
          }
          this.cambios()
        })(),
      )
    }
    if (deshacible && movidos.length) this.apilar({ tipo: 'mover', movidos })
    this.cambios()
    await Promise.all(trabajos)
  }

  async deshacerUltimo() {
    const d = this.deshacer.pop()
    if (!d) return
    if (d.tipo === 'flags') {
      for (const [id, p] of d.previo) await this.marcar([id], p, false)
    } else {
      for (const m of d.movidos) await this.mover([m.id], { ruta: m.origen }, false)
    }
  }

  private apilar(d: Deshacer) {
    this.deshacer = [...this.deshacer.slice(-30), d]
  }

  private fallo(texto: string, err: unknown) {
    const detalle = err instanceof SinClave ? err.message : (err as Error)?.message
    console.error(texto, detalle)
    this.emit('error', `${texto}: ${detalle}`)
    this.cambios()
  }

  // ------------------------------------------------------------ carpetas

  async crearCarpeta(cuenta: string, nombre: string) {
    if (this.demo) {
      this.db.guardarCarpetas(cuenta, [...this.db.carpetas().filter((c) => c.cuenta === cuenta), { ruta: nombre, nombre, rol: 'normal' as const }])
      return this.cambios()
    }
    await this.motores.get(cuenta)?.crearCarpeta(nombre)
  }

  async renombrarCarpeta(cuenta: string, ruta: string, nueva: string) {
    if (this.demo) return
    await this.motores.get(cuenta)?.renombrarCarpeta(ruta, nueva)
  }

  async borrarCarpeta(cuenta: string, ruta: string) {
    if (this.demo) {
      this.db.borrarCarpeta(cuenta, ruta)
      return this.cambios()
    }
    await this.motores.get(cuenta)?.borrarCarpeta(ruta)
  }
}

const demo_sembrar = (db: Db) => demo.sembrar(db)
const demo_calendario = (c: Calendario) => demo.sembrarCalendario(c)

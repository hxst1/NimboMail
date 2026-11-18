// Motor IMAP de una cuenta: sincroniza carpetas y mensajes a SQLite, escucha IDLE y ejecuta acciones.
import { EventEmitter } from 'node:events'
import { ImapFlow, type FetchMessageObject, type ListResponse } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { Cuerpo, RolCarpeta } from '@shared/tipos'
import { credencialesImap, opcionesTls, type ConfigCuenta } from './cuentas'
import { idMensaje, type Db, type NuevoMensaje } from './db'
import { contarAdjuntos, decodificarParte, parteTexto, vistaPrevia, type NodoEstructura } from './texto'
import { apuntarAdjuntos, guardarAdjuntos, type AdjuntoPendiente } from './adjuntos'
import { tieneRemotas, type Remotas } from './remoto'

const MAX_POR_CARPETA = 5000 // mensajes más recientes que se guardan de cada carpeta
const LOTE = 250
const CADA_CUANTO = 5 * 60_000 // repaso completo de carpetas
const GRANDE = 2 * 1024 * 1024 // por encima, solo se baja el texto y los adjuntos van bajo demanda
const DIAS_PRECARGA = 90 // cuerpos que se bajan en segundo plano (como Mailspring)
const DIAS_IMAGENES = 30 // imágenes remotas que se bajan con la precarga de lo ya existente
const LOTE_PRECARGA = 30
const DIA = 86_400_000
// Carpetas que se precargan, por orden (spam y papelera, no).
const PRECARGA: RolCarpeta[] = ['inbox', 'sent', 'drafts', 'archive', 'normal']

const NOMBRES: Partial<Record<RolCarpeta, string>> = {
  inbox: 'Bandeja de entrada',
  drafts: 'Borradores',
  sent: 'Enviados',
  junk: 'Spam',
  trash: 'Papelera',
  archive: 'Archivo',
  all: 'Todo el correo',
}

function rolDe(m: ListResponse, gmail: boolean): RolCarpeta | null {
  const su = m.specialUse
  if (m.path.toUpperCase() === 'INBOX' || su === '\\Inbox') return 'inbox'
  if (su === '\\Drafts') return 'drafts'
  if (su === '\\Sent') return 'sent'
  if (su === '\\Junk') return 'junk'
  if (su === '\\Trash') return 'trash'
  if (su === '\\Archive') return 'archive'
  if (su === '\\All') return 'all'
  // En Gmail «Destacados» ya es nuestra vista Marcados, e «Importantes» se queda como carpeta normal.
  if (gmail && su === '\\Flagged') return null
  if (m.flags.has('\\Noselect')) return null
  return 'normal'
}

export type EventoMotor =
  | { tipo: 'cambios' }
  | { tipo: 'estado'; estado: 'conectando' | 'listo' | 'error'; detalle?: string }
  | { tipo: 'nuevos'; ids: string[] } // mensajes nuevos en INBOX (para avisos y reglas)
  | { tipo: 'invitacion'; id: string; ics: string } // un correo con una invitación de calendario (iMIP)

type Prioridad = 'alta' | 'baja'

export class Motor extends EventEmitter {
  private cli: ImapFlow | null = null // sincronización y precarga
  private idle: ImapFlow | null = null // IDLE sobre INBOX
  private lectora: ImapFlow | null = null // solo lo que pide el usuario: abrir correos y adjuntos
  private conectandoLectora: Promise<ImapFlow> | null = null
  private colaAlta: string[] = []
  private colaBaja: string[] = []
  private esperando = new Map<string, { ok: (c: Cuerpo) => void; ko: (e: Error) => void }[]>()
  private leyendo = false
  private precargando = false
  private otraVuelta = false
  private saltar = new Set<string>() // grandes o con error: solo bajo demanda
  private temporizador: NodeJS.Timeout | null = null
  private pendientes = new Map<string, NodeJS.Timeout>()
  private sincronizando = new Set<string>()
  private parado = false
  private reintento = 2000
  private primeraVez = true

  constructor(
    readonly cuenta: ConfigCuenta,
    private db: Db,
    private remotas: Remotas,
  ) {
    super()
  }

  private emitir(e: EventoMotor) {
    this.emit('evento', e)
  }

  private async crearCliente(): Promise<ImapFlow> {
    const cli = new ImapFlow({
      host: this.cuenta.imap,
      port: this.cuenta.puerto,
      secure: this.cuenta.puerto !== 143 && this.cuenta.puerto !== 1143,
      auth: await credencialesImap(this.cuenta),
      tls: opcionesTls(this.cuenta),
      logger: false,
      emitLogs: false,
    })
    cli.on('error', (err: Error) => console.error(`[${this.cuenta.id}] imap:`, err.message))
    await cli.connect()
    return cli
  }

  async arrancar() {
    this.parado = false
    this.emitir({ tipo: 'estado', estado: 'conectando' })
    try {
      this.cli = await this.crearCliente()
      this.cli.on('close', () => this.reconectar())
      this.reintento = 2000
      this.emitir({ tipo: 'estado', estado: 'listo' })
      await this.sincronizarTodo()
      await this.escucharInbox()
      this.precargar()
      this.temporizador = setInterval(
        () => this.sincronizarTodo().then(() => this.precargar(), () => {}),
        CADA_CUANTO,
      )
    } catch (err) {
      this.emitir({ tipo: 'estado', estado: 'error', detalle: (err as Error).message })
      this.reconectar()
    }
  }

  private reconectar() {
    if (this.parado) return
    this.limpiar()
    setTimeout(() => this.arrancar(), this.reintento)
    this.reintento = Math.min(this.reintento * 2, 120_000)
  }

  private limpiar() {
    if (this.temporizador) clearInterval(this.temporizador)
    this.temporizador = null
    this.cli?.removeAllListeners('close')
    this.idle?.removeAllListeners('close')
    this.lectora?.removeAllListeners('close')
    this.cli?.close()
    this.idle?.close()
    this.lectora?.close()
    this.cli = this.idle = this.lectora = null
  }

  parar() {
    this.parado = true
    this.limpiar()
  }

  /** Conexión aparte que se queda en IDLE sobre INBOX: el correo nuevo llega al momento. */
  private async escucharInbox() {
    const inbox = this.db.rutaPorRol(this.cuenta.id, 'inbox') ?? 'INBOX'
    const idle = await this.crearCliente()
    this.idle = idle
    await idle.mailboxOpen(inbox, { readOnly: true })
    const avisar = () => this.programar(inbox)
    idle.on('exists', avisar)
    idle.on('expunge', avisar)
    idle.on('flags', avisar)
    idle.on('close', () => this.reconectar())
  }

  /** Agrupa ráfagas de eventos en una sola sincronización. */
  private programar(ruta: string, ms = 400) {
    clearTimeout(this.pendientes.get(ruta))
    this.pendientes.set(
      ruta,
      setTimeout(() => {
        this.pendientes.delete(ruta)
        this.sincronizarCarpeta(ruta).catch((e) => console.error(`[${this.cuenta.id}] sync ${ruta}:`, e.message))
      }, ms),
    )
  }

  async sincronizarTodo() {
    const cli = this.cli
    if (!cli) return
    const lista = await cli.list()
    const carpetas = lista
      .map((m) => ({ m, rol: rolDe(m, this.cuenta.gmail) }))
      .filter((x): x is { m: ListResponse; rol: RolCarpeta } => x.rol !== null)
      .map(({ m, rol }) => ({
        ruta: m.path,
        rol,
        nombre: (rol !== 'normal' && NOMBRES[rol]) || m.name.replace(/^\[Gmail\]\/?/, ''),
      }))
    this.db.guardarCarpetas(this.cuenta.id, carpetas)
    this.emitir({ tipo: 'cambios' })

    // INBOX primero; en Gmail «Todo el correo» lo último porque es lo más grande.
    const orden: RolCarpeta[] = ['inbox', 'sent', 'drafts', 'archive', 'normal', 'junk', 'trash', 'all']
    carpetas.sort((a, b) => orden.indexOf(a.rol) - orden.indexOf(b.rol))
    for (const c of carpetas) {
      try {
        await this.sincronizarCarpeta(c.ruta)
      } catch (e) {
        console.error(`[${this.cuenta.id}] sync ${c.ruta}:`, (e as Error).message)
      }
    }
    this.primeraVez = false
  }

  async sincronizarCarpeta(ruta: string) {
    const cli = this.cli
    if (!cli || this.sincronizando.has(ruta)) return
    this.sincronizando.add(ruta)
    const cuenta = this.cuenta.id
    const t0 = Date.now()
    let nuevos: number[] = []
    let cambiado = false // solo se avisa a la interfaz si algo cambió de verdad
    try {
      const lock = await cli.getMailboxLock(ruta)
      try {
        const mb = cli.mailbox
        if (!mb) return
        const guardada = this.db.carpeta(cuenta, ruta)
        if (!guardada) return
        const validez = String(mb.uidValidity)
        if (guardada.uidvalidity && guardada.uidvalidity !== validez) this.db.vaciarCarpeta(cuenta, ruta)

        // 1. Qué UIDs hay en el servidor (los más recientes) y cuáles ya tenemos.
        const enServidor = mb.exists ? ((await cli.search({ all: true }, { uid: true })) || []) : []
        enServidor.sort((a, b) => b - a)
        const quedan = new Set(enServidor.slice(0, MAX_POR_CARPETA))
        const locales = new Set(this.db.uids(cuenta, ruta))
        const borrados = [...locales].filter((u) => !quedan.has(u))
        if (borrados.length) this.db.borrarMensajes(borrados.map((u) => idMensaje(cuenta, ruta, u)))
        if (borrados.length) cambiado = true
        nuevos = [...quedan].filter((u) => !locales.has(u)).sort((a, b) => b - a)

        // 2. Cambios de flags en lo que ya teníamos (CONDSTORE si se puede).
        const modseq = guardada.modseq && guardada.uidvalidity === validez ? BigInt(guardada.modseq) : null
        if (locales.size && mb.exists) {
          const opciones = modseq && mb.highestModseq ? { uid: true, changedSince: modseq } : { uid: true }
          for await (const m of cli.fetch('1:*', { uid: true, flags: true }, opciones)) {
            if (!locales.has(m.uid)) continue
            const id = idMensaje(cuenta, ruta, m.uid)
            const f = flagsDe(m)
            const antes = this.db.ubicacion(id)
            if (antes && !!antes.leido === f.leido && !!antes.marcado === f.marcado && !!antes.respondido === f.respondido) continue
            this.db.flags(id, f)
            cambiado = true
          }
        }

        // 3. Cabeceras de los nuevos, de más reciente a más antiguo, por lotes.
        for (let i = 0; i < nuevos.length; i += LOTE) {
          const lote = nuevos.slice(i, i + LOTE)
          const filas: NuevoMensaje[] = []
          for await (const m of cli.fetch(
            lote,
            { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true, threadId: this.cuenta.gmail, headers: ['references'] },
            { uid: true },
          )) {
            filas.push(this.aFila(m, ruta))
          }
          this.db.guardarMensajes(filas)
          this.emitir({ tipo: 'cambios' })
        }

        this.db.estadoCarpeta(cuenta, ruta, {
          uidvalidity: validez,
          modseq: mb.highestModseq ? String(mb.highestModseq) : null,
          uidnext: mb.uidNext,
          total: mb.exists,
        })

        // 4. Vistas previas: un trocito de la parte de texto, agrupando por número de parte.
        await this.rellenarVistas(cli, ruta)
      } finally {
        lock.release()
      }
    } finally {
      this.sincronizando.delete(ruta)
    }
    if (cambiado || nuevos.length) this.emitir({ tipo: 'cambios' })
    if (nuevos.length || process.env.TUXMAIL_LOG) console.log(`[${cuenta}] ${ruta}: ${nuevos.length} nuevos en ${Date.now() - t0} ms`)
    const guardada = this.db.carpeta(cuenta, ruta)
    if (nuevos.length && guardada?.rol === 'inbox' && !this.primeraVez) {
      const ids = nuevos.map((u) => idMensaje(cuenta, ruta, u))
      // El correo nuevo se baja ya, imágenes incluidas: cuando lo abras estará listo.
      ids.slice(0, LOTE_PRECARGA).forEach((id) => this.pedirCuerpo(id, 'baja').catch(() => {}))
      this.emitir({ tipo: 'nuevos', ids })
    }
  }

  private aFila(m: FetchMessageObject, ruta: string): NuevoMensaje {
    const env = m.envelope ?? {}
    const refs = m.headers ? (m.headers.toString('latin1').match(/<[^>]+>/g) ?? []) : []
    const msgid = env.messageId ?? null
    const enRespuesta = env.inReplyTo?.match(/<[^>]+>/)?.[0] ?? null
    const estructura = m.bodyStructure as NodoEstructura | undefined
    const parte = estructura ? parteTexto(estructura) : null
    const dir = (a?: { name?: string; address?: string }[]) =>
      (a ?? []).map((x) => ({ nombre: (x.name ?? '').replace(/^\s*['"]+|['"]+\s*$/g, '').trim(), direccion: x.address ?? '' }))
    const de = dir(env.from)[0] ?? { nombre: '', direccion: '' }
    const hilo = this.cuenta.gmail && m.threadId ? `gm:${m.threadId}` : this.db.hiloPara(this.cuenta.id, msgid, enRespuesta, refs)
    const f = flagsDe(m)
    return {
      cuenta: this.cuenta.id,
      carpeta: ruta,
      uid: m.uid,
      msgid,
      enRespuesta,
      referencias: refs,
      hilo,
      de,
      para: dir(env.to),
      cc: dir(env.cc),
      asunto: env.subject ?? '',
      vista: '',
      fecha: (env.date ?? m.internalDate ?? new Date()).valueOf() as number,
      leido: f.leido,
      marcado: f.marcado,
      respondido: f.respondido,
      adjuntos: estructura ? contarAdjuntos(estructura) : 0,
      parteTexto: parte ? JSON.stringify(parte) : null,
    }
  }

  private async rellenarVistas(cli: ImapFlow, ruta: string) {
    for (;;) {
      const faltan = this.db.sinVista(this.cuenta.id, ruta, 400)
      if (!faltan.length) return
      const porParte = new Map<string, typeof faltan>()
      for (const f of faltan) {
        const p = JSON.parse(f.parte_texto).parte as string
        porParte.set(p, [...(porParte.get(p) ?? []), f])
      }
      for (const [parte, filas] of porParte) {
        const info = new Map(filas.map((f) => [f.uid, f]))
        const grandes: typeof filas = []
        for await (const m of cli.fetch(
          filas.map((f) => f.uid),
          { uid: true, bodyParts: [{ key: parte, maxLength: 3072 }] },
          { uid: true },
        )) {
          const fila = info.get(m.uid)
          if (!fila) continue
          const p = JSON.parse(fila.parte_texto) as { tipo: string; codificacion: string; charset: string }
          const datos = m.bodyParts?.get(parte) ?? m.bodyParts?.values().next().value
          const texto = datos ? vistaPrevia(decodificarParte(datos, p.codificacion, p.charset), p.tipo === 'text/html') : ''
          // Sin texto en el trozo, pero el trozo venía lleno: se pide uno mayor al acabar el lote
          // (no se puede lanzar otro comando con este FETCH aún abierto en la misma conexión).
          if (!texto && datos && datos.length >= 3000) grandes.push(fila)
          else this.db.vistaPrevia(fila.id, texto || ' ')
        }
        for (const fila of grandes) {
          const p = JSON.parse(fila.parte_texto) as { tipo: string; codificacion: string; charset: string }
          this.db.vistaPrevia(fila.id, (await this.vistaGrande(cli, fila.uid, parte, p)) || ' ')
        }
      }
      this.emitir({ tipo: 'cambios' })
    }
  }

  /** Algunos HTML traen kilos de <style> antes del texto: se pide un trozo mayor. */
  private async vistaGrande(cli: ImapFlow, uid: number, parte: string, p: { tipo: string; codificacion: string; charset: string }) {
    const m = await cli.fetchOne(String(uid), { uid: true, bodyParts: [{ key: parte, maxLength: 48_000 }] }, { uid: true })
    const datos = m ? (m.bodyParts?.get(parte) ?? m.bodyParts?.values().next().value) : undefined
    return datos ? vistaPrevia(decodificarParte(datos, p.codificacion, p.charset), p.tipo === 'text/html') : ''
  }

  // ------------------------------------------------------------ cuerpos y acciones

  /** El cuerpo de un mensaje: de la caché si está; si no, por la lectora, antes que nada. */
  async cuerpo(id: string): Promise<Cuerpo> {
    const guardado = this.db.cuerpo(id)
    if (guardado) {
      // Cuerpos guardados antes de las imágenes en caché: se reescriben una vez.
      if (guardado.html && tieneRemotas(guardado.html)) {
        const r = this.remotas.reescribir(guardado.html)
        guardado.html = r.html
        this.db.guardarCuerpo(id, guardado)
        this.remotas.precargar(r.sumas)
      }
      return guardado
    }
    return this.pedirCuerpo(id, 'alta')
  }

  /** Precarga en caliente (los vecinos de la selección): sin prisa, detrás de lo que se abre. */
  precargarIds(ids: string[]) {
    for (const id of ids) if (!this.db.tieneCuerpo(id)) this.pedirCuerpo(id, 'baja').catch(() => {})
  }

  private pedirCuerpo(id: string, prioridad: Prioridad): Promise<Cuerpo> {
    const guardado = this.db.cuerpo(id)
    if (guardado) return Promise.resolve(guardado)
    return new Promise((ok, ko) => {
      const lista = this.esperando.get(id)
      if (lista) lista.push({ ok, ko })
      else this.esperando.set(id, [{ ok, ko }])
      if (prioridad === 'alta') {
        // Lo que abre el usuario pasa delante de todo lo demás.
        this.colaBaja = this.colaBaja.filter((x) => x !== id)
        this.colaAlta = [id, ...this.colaAlta.filter((x) => x !== id)]
      } else if (!this.colaAlta.includes(id) && !this.colaBaja.includes(id)) {
        this.colaBaja.push(id)
        // Los vecinos de selecciones viejas ya no interesan: fuera los más antiguos.
        for (const viejo of this.colaBaja.splice(0, Math.max(0, this.colaBaja.length - 60))) {
          this.esperando.get(viejo)?.forEach((e) => e.ko(new Error('Precarga descartada')))
          this.esperando.delete(viejo)
        }
      }
      this.leer()
    })
  }

  private async leer() {
    if (this.leyendo) return
    this.leyendo = true
    try {
      for (;;) {
        const id = this.colaAlta.shift() ?? this.colaBaja.shift()
        if (!id) return
        const esperan = this.esperando.get(id) ?? []
        this.esperando.delete(id)
        if (!esperan.length && this.db.tieneCuerpo(id)) continue
        try {
          const c = this.db.cuerpo(id) ?? (await this.descargarCuerpo(await this.obtenerLectora(), id, true))
          esperan.forEach((e) => e.ok(c))
        } catch (err) {
          esperan.forEach((e) => e.ko(err as Error))
        }
      }
    } finally {
      this.leyendo = false
    }
  }

  private obtenerLectora(): Promise<ImapFlow> {
    if (this.lectora?.usable) return Promise.resolve(this.lectora)
    if (!this.conectandoLectora) {
      this.conectandoLectora = this.crearCliente()
        .then((c) => {
          this.lectora = c
          c.on('close', () => {
            if (this.lectora === c) this.lectora = null
          })
          return c
        })
        .finally(() => {
          this.conectandoLectora = null
        })
    }
    return this.conectandoLectora
  }

  /** Baja, procesa y guarda el cuerpo de un mensaje. */
  private async descargarCuerpo(cli: ImapFlow, id: string, imagenes: boolean): Promise<Cuerpo> {
    const u = this.db.ubicacion(id)
    if (!u) throw new Error('Mensaje no disponible')
    const lock = await cli.getMailboxLock(u.carpeta)
    let fuente: Buffer | undefined
    let grande: { estructura: NodoEstructura; partes: Record<string, Buffer>; textos: Record<string, string> } | undefined
    try {
      const info = await cli.fetchOne(String(u.uid), { uid: true, size: true, bodyStructure: true }, { uid: true })
      if (!info) throw new Error('El mensaje ya no está en el servidor')
      if ((info.size ?? 0) <= GRANDE || !info.bodyStructure) {
        const m = await cli.fetchOne(String(u.uid), { uid: true, source: true }, { uid: true })
        fuente = m ? m.source : undefined
      } else {
        grande = await this.bajarPartes(cli, u.uid, info.bodyStructure as NodoEstructura)
      }
    } finally {
      lock.release()
    }
    let cuerpo: Cuerpo
    if (fuente) cuerpo = await this.cuerpoDeFuente(id, fuente)
    else if (grande) cuerpo = await this.cuerpoDePartes(id, grande)
    else throw new Error('No se pudo descargar el mensaje')
    if (cuerpo.html) {
      const r = this.remotas.reescribir(cuerpo.html)
      cuerpo.html = r.html
      if (imagenes) this.remotas.precargar(r.sumas)
    }
    this.db.guardarCuerpo(id, cuerpo)
    return cuerpo
  }

  private async cuerpoDeFuente(id: string, fuente: Buffer): Promise<Cuerpo> {
    const parsed = await simpleParser(fuente)
    // Invitaciones de calendario (Meet, Teams, Zoom…): van en una parte text/calendar.
    for (const a of parsed.attachments) {
      if (/text\/calendar|application\/ics/i.test(a.contentType) || /\.ics$/i.test(a.filename ?? '')) {
        this.emitir({ tipo: 'invitacion', id, ics: a.content.toString('utf8') })
      }
    }
    return {
      html: typeof parsed.html === 'string' ? parsed.html : null,
      texto: parsed.text ?? null,
      adjuntos: await guardarAdjuntos(id, parsed.attachments),
      remotoBloqueado: false,
    }
  }

  /** Correos grandes: el texto, el HTML y las imágenes incrustadas; los adjuntos, solo apuntados. */
  private async bajarPartes(cli: ImapFlow, uid: number, estructura: NodoEstructura) {
    const c = clasificar(estructura)
    const textos: Record<string, string> = {}
    for (const n of [c.html, c.texto]) {
      if (!n) continue
      const parte = n.part ?? '1'
      const d = await cli.download(String(uid), parte, { uid: true }) // convierte el texto a UTF-8
      if ('content' in d && d.content) textos[parte] = (await leerFlujo(d.content)).toString('utf8')
    }
    const incrustadas = c.incrustadas.filter((n) => (n.size ?? 0) < GRANDE).map((n) => n.part ?? '1')
    const partes: Record<string, Buffer> = {}
    if (incrustadas.length) {
      const r = await cli.downloadMany(String(uid), incrustadas, { uid: true })
      for (const [k, v] of Object.entries(r ?? {})) if (v && (v as { content?: Buffer }).content) partes[k] = (v as { content: Buffer }).content
    }
    return { estructura, partes, textos }
  }

  private async cuerpoDePartes(
    id: string,
    g: { estructura: NodoEstructura; partes: Record<string, Buffer>; textos: Record<string, string> },
  ): Promise<Cuerpo> {
    const c = clasificar(g.estructura)
    let html = c.html ? (g.textos[c.html.part ?? '1'] ?? null) : null
    if (html) {
      // cid: → data: con las imágenes incrustadas, como hace mailparser.
      const porCid = new Map(c.incrustadas.filter((n) => n.id).map((n) => [n.id!.replace(/[<>]/g, ''), n]))
      html = html.replace(/cid:([^"'\s)>]+)/gi, (m, cid: string) => {
        const n = porCid.get(cid)
        const datos = n ? g.partes[n.part ?? '1'] : undefined
        return datos ? `data:${n!.type};base64,${datos.toString('base64')}` : m
      })
    }
    const pendientes: AdjuntoPendiente[] = c.adjuntos.map((n) => ({
      parte: n.part ?? '1',
      nombre: n.dispositionParameters?.filename ?? n.parameters?.name ?? '',
      tipo: n.type,
      tamano: n.size ?? 0,
    }))
    return {
      html,
      texto: c.texto ? (g.textos[c.texto.part ?? '1'] ?? null) : null,
      adjuntos: await apuntarAdjuntos(id, pendientes),
      remotoBloqueado: false,
    }
  }

  /** Un adjunto de un correo grande, cuando se pide (por la lectora). */
  async descargarParte(id: string, parte: string): Promise<Buffer> {
    const u = this.db.ubicacion(id)
    if (!u) throw new Error('Mensaje no disponible')
    const cli = await this.obtenerLectora()
    const lock = await cli.getMailboxLock(u.carpeta)
    try {
      const d = await cli.download(String(u.uid), parte, { uid: true })
      if (!('content' in d) || !d.content) throw new Error('Adjunto no encontrado')
      return await leerFlujo(d.content)
    } finally {
      lock.release()
    }
  }

  /**
   * Precarga en segundo plano por la conexión de sincronización: los cuerpos de los últimos
   * 90 días, del más nuevo al más antiguo y en lotes de 30, soltando la carpeta entre lote y lote.
   */
  async precargar() {
    if (process.env.TUXMAIL_SIN_PRECARGA) return // para medir la apertura en frío
    if (this.precargando) {
      this.otraVuelta = true
      return
    }
    this.precargando = true
    const t0 = Date.now()
    let total = 0
    try {
      do {
        this.otraVuelta = false
        const desde = Date.now() - DIAS_PRECARGA * DIA
        const carpetas = this.db
          .carpetas()
          .filter((c) => c.cuenta === this.cuenta.id && PRECARGA.includes(c.rol))
          .sort((a, b) => PRECARGA.indexOf(a.rol) - PRECARGA.indexOf(b.rol))
        for (const c of carpetas) {
          for (;;) {
            const cli = this.cli
            if (this.parado || !cli) return
            const lote = this.db.sinCuerpo(this.cuenta.id, c.ruta, desde, LOTE_PRECARGA + this.saltar.size).filter((f) => !this.saltar.has(f.id))
            if (!lote.length) break
            total += await this.precargarLote(cli, c.ruta, lote.slice(0, LOTE_PRECARGA))
            await new Promise((r) => setTimeout(r, 30)) // deja pasar a la sincronización
          }
        }
      } while (this.otraVuelta)
    } catch (e) {
      console.error(`[${this.cuenta.id}] precarga:`, (e as Error).message)
    } finally {
      this.precargando = false
      if (total) console.log(`[${this.cuenta.id}] precarga: ${total} cuerpos en ${Date.now() - t0} ms`)
    }
  }

  private async precargarLote(cli: ImapFlow, ruta: string, filas: { id: string; uid: number; fecha: number }[]) {
    const fuentes = new Map<number, Buffer>()
    const lock = await cli.getMailboxLock(ruta)
    try {
      const tam = new Map<number, number>()
      for await (const m of cli.fetch(filas.map((f) => f.uid), { uid: true, size: true }, { uid: true })) tam.set(m.uid, m.size ?? 0)
      const pequenos = filas.filter((f) => (tam.get(f.uid) ?? Infinity) <= GRANDE)
      for (const f of filas) if (!pequenos.includes(f)) this.saltar.add(f.id)
      // Los UIDs ya están recogidos: el FETCH de las fuentes va aparte, sin comandos dentro del bucle.
      if (pequenos.length) {
        for await (const m of cli.fetch(pequenos.map((f) => f.uid), { uid: true, source: true }, { uid: true })) {
          if (m.source) fuentes.set(m.uid, m.source)
        }
      }
    } finally {
      lock.release()
    }
    let n = 0
    const recientes = Date.now() - DIAS_IMAGENES * DIA
    for (const f of filas) {
      const fuente = fuentes.get(f.uid)
      if (!fuente) {
        this.saltar.add(f.id)
        continue
      }
      try {
        if (this.db.tieneCuerpo(f.id)) continue // lo abrió el usuario mientras tanto
        const c = await this.cuerpoDeFuente(f.id, fuente)
        if (c.html) {
          const r = this.remotas.reescribir(c.html)
          c.html = r.html
          if (f.fecha >= recientes) this.remotas.precargar(r.sumas)
        }
        this.db.guardarCuerpo(f.id, c)
        n++
      } catch {
        this.saltar.add(f.id)
      }
    }
    return n
  }

  // ------------------------------------------------------------ redactar (por la lectora)

  /** Guarda un mensaje en una carpeta (Enviados, Borradores) y devuelve su UID (UIDPLUS). */
  async anexar(ruta: string, raw: Buffer, flags: string[]): Promise<number | null> {
    const cli = await this.obtenerLectora()
    const r = await cli.append(ruta, raw, flags)
    this.programar(ruta, 200)
    return r && typeof r === 'object' && r.uid ? Number(r.uid) : null
  }

  async borrarUid(ruta: string, uid: number) {
    const cli = await this.obtenerLectora()
    const lock = await cli.getMailboxLock(ruta)
    try {
      await cli.messageDelete(String(uid), { uid: true })
    } finally {
      lock.release()
    }
    this.programar(ruta, 200)
  }

  /** El mensaje entero tal cual (para volver a abrir un borrador). */
  async fuente(id: string): Promise<Buffer> {
    const u = this.db.ubicacion(id)
    if (!u) throw new Error('Mensaje no disponible')
    const cli = await this.obtenerLectora()
    const lock = await cli.getMailboxLock(u.carpeta)
    try {
      const m = await cli.fetchOne(String(u.uid), { uid: true, source: true }, { uid: true })
      if (!m || !m.source) throw new Error('El mensaje ya no está en el servidor')
      return m.source
    } finally {
      lock.release()
    }
  }

  async marcarRespondido(id: string) {
    const u = this.db.ubicacion(id)
    if (!u) return
    this.db.flags(id, { respondido: true })
    const cli = await this.obtenerLectora()
    const lock = await cli.getMailboxLock(u.carpeta)
    try {
      await cli.messageFlagsAdd(String(u.uid), ['\\Answered'], { uid: true })
    } finally {
      lock.release()
    }
  }

  async flags(id: string, f: { leido?: boolean; marcado?: boolean }) {
    const u = this.db.ubicacion(id)
    if (!u || !this.cli) return
    const lock = await this.cli.getMailboxLock(u.carpeta)
    try {
      const uid = String(u.uid)
      if (f.leido !== undefined) {
        await (f.leido ? this.cli.messageFlagsAdd(uid, ['\\Seen'], { uid: true }) : this.cli.messageFlagsRemove(uid, ['\\Seen'], { uid: true }))
      }
      if (f.marcado !== undefined) {
        await (f.marcado ? this.cli.messageFlagsAdd(uid, ['\\Flagged'], { uid: true }) : this.cli.messageFlagsRemove(uid, ['\\Flagged'], { uid: true }))
      }
    } finally {
      lock.release()
    }
  }

  /** Mueve en el servidor y devuelve el UID nuevo (UIDPLUS) para seguir el mensaje. */
  async mover(origen: string, uid: number, destino: string): Promise<number | null> {
    if (!this.cli) throw new Error('Sin conexión')
    const lock = await this.cli.getMailboxLock(origen)
    try {
      const r = await this.cli.messageMove(String(uid), destino, { uid: true })
      if (!r) throw new Error('El servidor no movió el mensaje')
      return r.uidMap?.get(uid) ?? null
    } finally {
      lock.release()
    }
  }

  async crearCarpeta(ruta: string) {
    if (!this.cli) throw new Error('Sin conexión')
    await this.cli.mailboxCreate(ruta)
    await this.sincronizarTodo()
  }

  async renombrarCarpeta(ruta: string, nueva: string) {
    if (!this.cli) throw new Error('Sin conexión')
    await this.cli.mailboxRename(ruta, nueva)
    await this.sincronizarTodo()
  }

  async borrarCarpeta(ruta: string) {
    if (!this.cli) throw new Error('Sin conexión')
    await this.cli.mailboxDelete(ruta)
    await this.sincronizarTodo()
  }
}

/** Partes de un mensaje: el texto y el HTML que se leen, las imágenes incrustadas y los adjuntos. */
function clasificar(raiz: NodoEstructura) {
  let html: NodoEstructura | undefined
  let texto: NodoEstructura | undefined
  const incrustadas: NodoEstructura[] = []
  const adjuntos: NodoEstructura[] = []
  const visitar = (n: NodoEstructura) => {
    if (n.childNodes?.length) return n.childNodes.forEach(visitar)
    const nombre = n.dispositionParameters?.filename ?? n.parameters?.name
    const adjunto = n.disposition === 'attachment' || (!!nombre && n.disposition !== 'inline' && !n.type.startsWith('text/'))
    if (!adjunto && n.type === 'text/html' && !html) html = n
    else if (!adjunto && n.type === 'text/plain' && !texto) texto = n
    else if (!adjunto && n.type.startsWith('image/') && n.id) incrustadas.push(n)
    else if (adjunto || nombre || !n.type.startsWith('text/')) adjuntos.push(n)
  }
  visitar(raiz)
  return { html, texto, incrustadas, adjuntos }
}

async function leerFlujo(flujo: NodeJS.ReadableStream): Promise<Buffer> {
  const trozos: Buffer[] = []
  for await (const t of flujo as AsyncIterable<Buffer | string>) trozos.push(typeof t === 'string' ? Buffer.from(t) : t)
  return Buffer.concat(trozos)
}

function flagsDe(m: FetchMessageObject) {
  const f = m.flags ?? new Set<string>()
  return { leido: f.has('\\Seen'), marcado: f.has('\\Flagged'), respondido: f.has('\\Answered') }
}

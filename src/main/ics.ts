// iCalendar (RFC 5545) sin dependencias: lo justo para invitaciones (iMIP) y calendarios suscritos.
// Lee eventos con zona horaria (también los nombres de Windows que manda Outlook/Teams), los que se
// repiten (RRULE con EXDATE y excepciones RECURRENCE-ID) y construye respuestas METHOD:REPLY.

export interface Prop {
  nombre: string
  params: Record<string, string>
  valor: string
  linea: string // la línea original (desplegada), para copiarla tal cual en una respuesta
}

export interface Bloque {
  tipo: string
  props: Prop[]
  hijos: Bloque[]
}

const prop = (b: Bloque, n: string) => b.props.find((p) => p.nombre === n)
const props = (b: Bloque, n: string) => b.props.filter((p) => p.nombre === n)

function leerLinea(linea: string): Prop | null {
  // NOMBRE;PARAM=valor;PARAM="con:dos puntos":VALOR — el primer «:» fuera de comillas separa.
  let comillas = false
  let corte = -1
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') comillas = !comillas
    else if (c === ':' && !comillas) {
      corte = i
      break
    }
  }
  if (corte < 0) return null
  const cabeza = linea.slice(0, corte)
  const partes = cabeza.match(/(?:[^;"]+|"[^"]*")+/g) ?? []
  const params: Record<string, string> = {}
  for (const p of partes.slice(1)) {
    const i = p.indexOf('=')
    if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, '')
  }
  return { nombre: (partes[0] ?? '').toUpperCase(), params, valor: linea.slice(corte + 1), linea }
}

export function leerIcs(texto: string): Bloque {
  const lineas = texto.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const raiz: Bloque = { tipo: 'RAIZ', props: [], hijos: [] }
  const pila: Bloque[] = [raiz]
  for (const l of lineas) {
    if (!l.trim()) continue
    const p = leerLinea(l)
    if (!p) continue
    if (p.nombre === 'BEGIN') {
      const b: Bloque = { tipo: p.valor.trim().toUpperCase(), props: [], hijos: [] }
      pila[pila.length - 1].hijos.push(b)
      pila.push(b)
    } else if (p.nombre === 'END') {
      if (pila.length > 1) pila.pop()
    } else {
      pila[pila.length - 1].props.push(p)
    }
  }
  return raiz
}

export const texto = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()

// ------------------------------------------------------------ zonas horarias

const WINDOWS: Record<string, string> = {
  'Romance Standard Time': 'Europe/Paris', 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kyiv', 'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow', 'Turkey Standard Time': 'Europe/Istanbul', 'Morocco Standard Time': 'Africa/Casablanca',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles', 'Atlantic Standard Time': 'America/Halifax', 'SA Pacific Standard Time': 'America/Bogota',
  'Argentina Standard Time': 'America/Buenos_Aires', 'E. South America Standard Time': 'America/Sao_Paulo',
  'Central Standard Time (Mexico)': 'America/Mexico_City', 'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo', 'Singapore Standard Time': 'Asia/Singapore', 'Arabian Standard Time': 'Asia/Dubai',
  'AUS Eastern Standard Time': 'Australia/Sydney', UTC: 'UTC', 'Coordinated Universal Time': 'UTC',
}

const zonaValida = (z: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return true
  } catch {
    return false
  }
}

/** Minutos que la zona va por delante de UTC en ese instante. */
function desfase(zona: string, ms: number): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const v: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') v[p.type] = Number(p.value)
  return (Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - Math.floor(ms / 1000) * 1000) / 60000
}

/** Hora de reloj en una zona → instante UTC. */
function enZona(a: number, m: number, d: number, h: number, mi: number, s: number, zona: string): number {
  const supuesto = Date.UTC(a, m, d, h, mi, s)
  const d1 = desfase(zona, supuesto)
  let r = supuesto - d1 * 60000
  const d2 = desfase(zona, r)
  if (d2 !== d1) r = supuesto - d2 * 60000
  return r
}

export interface Fecha {
  ms: number
  todoElDia: boolean
}

/** Zonas declaradas en el propio archivo (VTIMEZONE): su desfase estándar, por si el nombre no es IANA. */
function desfasesPropios(raiz: Bloque): Record<string, number> {
  const out: Record<string, number> = {}
  for (const z of raiz.hijos.filter((b) => b.tipo === 'VTIMEZONE')) {
    const id = prop(z, 'TZID')?.valor
    const std = z.hijos.find((h) => h.tipo === 'STANDARD') ?? z.hijos[0]
    const off = std && prop(std, 'TZOFFSETTO')?.valor.match(/^([+-])(\d{2})(\d{2})/)
    if (id && off) out[id] = (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3]))
  }
  return out
}

export function leerFecha(p: Prop | undefined, propias: Record<string, number> = {}): Fecha | null {
  if (!p) return null
  const v = p.valor.trim()
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  const [a, mes, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  if (p.params.VALUE === 'DATE' || m[4] === undefined) return { ms: new Date(a, mes, d).getTime(), todoElDia: true }
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)]
  if (m[7]) return { ms: Date.UTC(a, mes, d, h, mi, s), todoElDia: false }
  const tz = p.params.TZID?.replace(/^\//, '')
  if (tz) {
    const iana = zonaValida(tz) ? tz : WINDOWS[tz]
    if (iana && zonaValida(iana)) return { ms: enZona(a, mes, d, h, mi, s, iana), todoElDia: false }
    if (propias[tz] !== undefined) return { ms: Date.UTC(a, mes, d, h, mi, s) - propias[tz] * 60000, todoElDia: false }
  }
  return { ms: new Date(a, mes, d, h, mi, s).getTime(), todoElDia: false } // hora «flotante»: la local
}

function duracion(v: string): number {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return 0
  const n = (i: number) => Number(m[i] ?? 0)
  return (m[1] === '-' ? -1 : 1) * ((((n(2) * 7 + n(3)) * 24 + n(4)) * 60 + n(5)) * 60 + n(6)) * 1000
}

// ------------------------------------------------------------ eventos

export interface Persona {
  nombre: string
  direccion: string
  respuesta?: string // PARTSTAT
}

export interface EventoIcs {
  uid: string
  recurrencia: number | null // RECURRENCE-ID: la repetición que sustituye
  titulo: string
  inicio: number
  fin: number
  todoElDia: boolean
  lugar: string
  descripcion: string
  enlace: string | null // Meet, Teams, Zoom…
  organizador: Persona | null
  asistentes: Persona[]
  estado: 'confirmado' | 'provisional' | 'cancelado'
  secuencia: number
  rrule: string | null
  exdates: number[]
  crudo: { dtstart: string; dtend: string | null; organizador: string | null; recurrencia: string | null } // para responder
}

const persona = (p: Prop): Persona => ({
  nombre: (p.params.CN ?? '').trim(),
  direccion: p.valor.replace(/^mailto:/i, '').trim().toLowerCase(),
  respuesta: p.params.PARTSTAT?.toUpperCase(),
})

const ENLACE = /https:\/\/(?:meet\.google\.com\/[a-z-]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+|teams\.live\.com\/meet\/[^\s"<>]+|[\w.-]*zoom\.us\/[jw]\/[^\s"<>]+|[\w.-]*webex\.com\/[^\s"<>]+|whereby\.com\/[^\s"<>]+|meet\.jit\.si\/[^\s"<>]+)/i

export function leerEventos(raiz: Bloque): { metodo: string; eventos: EventoIcs[] } {
  const cal = raiz.hijos.find((b) => b.tipo === 'VCALENDAR') ?? raiz
  const metodo = (prop(cal, 'METHOD')?.valor ?? 'PUBLISH').trim().toUpperCase()
  const propias = desfasesPropios(cal)
  const eventos: EventoIcs[] = []
  for (const e of cal.hijos.filter((b) => b.tipo === 'VEVENT')) {
    const uid = prop(e, 'UID')?.valor.trim()
    const ini = leerFecha(prop(e, 'DTSTART'), propias)
    if (!uid || !ini) continue
    const finProp = leerFecha(prop(e, 'DTEND'), propias)
    const dur = prop(e, 'DURATION')
    const fin = finProp?.ms ?? (dur ? ini.ms + duracion(dur.valor.trim()) : ini.todoElDia ? ini.ms + 86_400_000 : ini.ms)
    const descripcion = texto(prop(e, 'DESCRIPTION')?.valor ?? '')
    const lugar = texto(prop(e, 'LOCATION')?.valor ?? '')
    const candidatos = [prop(e, 'X-GOOGLE-CONFERENCE')?.valor, prop(e, 'URL')?.valor, lugar, descripcion].filter(Boolean).join(' ')
    const st = prop(e, 'STATUS')?.valor.trim().toUpperCase()
    const org = prop(e, 'ORGANIZER')
    const rec = prop(e, 'RECURRENCE-ID')
    eventos.push({
      uid,
      recurrencia: rec ? (leerFecha(rec, propias)?.ms ?? null) : null,
      titulo: texto(prop(e, 'SUMMARY')?.valor ?? '') || '(Sin título)',
      inicio: ini.ms,
      fin: Math.max(fin, ini.ms),
      todoElDia: ini.todoElDia,
      lugar,
      descripcion,
      enlace: candidatos.match(ENLACE)?.[0] ?? null,
      organizador: org ? persona(org) : null,
      asistentes: props(e, 'ATTENDEE').map(persona),
      estado: st === 'CANCELLED' || metodo === 'CANCEL' ? 'cancelado' : st === 'TENTATIVE' ? 'provisional' : 'confirmado',
      secuencia: Number(prop(e, 'SEQUENCE')?.valor ?? 0) || 0,
      rrule: prop(e, 'RRULE')?.valor.trim() ?? null,
      exdates: props(e, 'EXDATE').flatMap((p) =>
        p.valor.split(',').map((v) => leerFecha({ ...p, valor: v }, propias)?.ms).filter((x): x is number => x !== undefined),
      ),
      crudo: {
        dtstart: prop(e, 'DTSTART')!.linea,
        dtend: prop(e, 'DTEND')?.linea ?? null,
        organizador: org?.linea ?? null,
        recurrencia: rec?.linea ?? null,
      },
    })
  }
  return { metodo, eventos }
}

// ------------------------------------------------------------ repeticiones

const DIAS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/**
 * Inicios de las repeticiones de un evento que caen en [desde, hasta]. Cubre lo habitual en
 * calendarios reales: DAILY, WEEKLY (con BYDAY), MONTHLY (BYMONTHDAY o BYDAY con ordinal) y YEARLY,
 * con INTERVAL, COUNT, UNTIL y EXDATE. Se repite en hora local, conservando la hora de inicio.
 */
export function repeticiones(inicio: number, rrule: string, exdates: number[], desde: number, hasta: number): number[] {
  const r: Record<string, string> = {}
  for (const par of rrule.split(';')) {
    const [k, v] = par.split('=')
    if (k && v) r[k.toUpperCase()] = v
  }
  const freq = r.FREQ
  const intervalo = Math.max(1, Number(r.INTERVAL ?? 1))
  const cuenta = r.COUNT ? Number(r.COUNT) : Infinity
  const hastaRegla = r.UNTIL ? (leerFecha({ nombre: 'UNTIL', params: {}, valor: r.UNTIL, linea: '' })?.ms ?? Infinity) : Infinity
  const fin = Math.min(hasta, hastaRegla === Infinity ? Infinity : hastaRegla + (/T/.test(r.UNTIL ?? '') ? 0 : 86_399_999))
  const excluidas = new Set(exdates.map((x) => Math.round(x / 60000)))
  const base = new Date(inicio)
  const out: number[] = []
  let n = 0
  const anadir = (d: Date) => {
    const ms = d.getTime()
    if (ms < inicio || ms > fin) return ms > fin
    n++
    if (n > cuenta) return true
    if (ms >= desde && !excluidas.has(Math.round(ms / 60000))) out.push(ms)
    return false
  }
  const conHora = (a: number, m: number, d: number) => new Date(a, m, d, base.getHours(), base.getMinutes(), base.getSeconds())
  const byday = (r.BYDAY ?? '').split(',').filter(Boolean)
  for (let paso = 0; paso < 5000; paso++) {
    let parar = false
    if (freq === 'DAILY') {
      parar = anadir(conHora(base.getFullYear(), base.getMonth(), base.getDate() + paso * intervalo))
    } else if (freq === 'WEEKLY') {
      const dias = byday.length ? byday.map((x) => DIAS[x.slice(-2)]).sort() : [base.getDay()]
      // Semanas de lunes a domingo (WKST=MO, lo normal).
      const lunes = conHora(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7) + paso * 7 * intervalo)
      for (const dia of [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
        if (anadir(conHora(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + ((dia + 6) % 7)))) {
          parar = true
          break
        }
      }
    } else if (freq === 'MONTHLY') {
      const a = base.getFullYear()
      const m = base.getMonth() + paso * intervalo
      const candidatos: Date[] = []
      if (r.BYMONTHDAY) {
        for (const x of r.BYMONTHDAY.split(',').map(Number)) {
          const ultimo = new Date(a, m + 1, 0).getDate()
          const dia = x > 0 ? x : ultimo + x + 1
          if (dia >= 1 && dia <= ultimo) candidatos.push(conHora(a, m, dia))
        }
      } else if (byday.length) {
        for (const x of byday) {
          const ord = Number(x.slice(0, -2) || 0)
          const dia = DIAS[x.slice(-2)]
          const delMes: Date[] = []
          for (let d = 1; d <= new Date(a, m + 1, 0).getDate(); d++) if (new Date(a, m, d).getDay() === dia) delMes.push(conHora(a, m, d))
          if (!ord) candidatos.push(...delMes)
          else {
            const elegido = ord > 0 ? delMes[ord - 1] : delMes[delMes.length + ord]
            if (elegido) candidatos.push(elegido)
          }
        }
      } else {
        const d = base.getDate()
        if (d <= new Date(a, m + 1, 0).getDate()) candidatos.push(conHora(a, m, d))
      }
      for (const c of candidatos.sort((x, y) => x.getTime() - y.getTime())) {
        if (anadir(c)) {
          parar = true
          break
        }
      }
    } else if (freq === 'YEARLY') {
      const a = base.getFullYear() + paso * intervalo
      if (base.getDate() <= new Date(a, base.getMonth() + 1, 0).getDate()) parar = anadir(conHora(a, base.getMonth(), base.getDate()))
    } else {
      break
    }
    if (parar) break
  }
  return out
}

// ------------------------------------------------------------ escribir

const escapar = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Pliega a 75 octetos por línea, como pide el estándar. */
function plegar(linea: string): string {
  const b = Buffer.from(linea, 'utf8')
  if (b.length <= 75) return linea
  const trozos: string[] = []
  let actual = ''
  for (const c of linea) {
    if (Buffer.byteLength(actual + c) > (trozos.length ? 74 : 75)) {
      trozos.push(actual)
      actual = ''
    }
    actual += c
  }
  trozos.push(actual)
  return trozos.join('\r\n ')
}

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dia = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export function calendario(lineas: string[], metodo?: string): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NimboMail//NimboMail//ES', 'CALSCALE:GREGORIAN', ...(metodo ? [`METHOD:${metodo}`] : []), ...lineas, 'END:VCALENDAR']
    .map(plegar)
    .join('\r\n') + '\r\n'
}

/** Respuesta a una invitación (iMIP, METHOD:REPLY) con la respuesta de quien la recibe. */
export function respuesta(e: EventoIcs, yo: { nombre: string; direccion: string }, partstat: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'): string {
  return calendario(
    [
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${utc(Date.now())}`,
      `SEQUENCE:${e.secuencia}`,
      ...(e.crudo.recurrencia ? [e.crudo.recurrencia] : []),
      e.crudo.dtstart,
      ...(e.crudo.dtend ? [e.crudo.dtend] : []),
      ...(e.crudo.organizador ? [e.crudo.organizador] : []),
      `ATTENDEE;PARTSTAT=${partstat}${yo.nombre ? `;CN="${yo.nombre.replace(/"/g, '')}"` : ''}:mailto:${yo.direccion}`,
      `SUMMARY:${escapar(e.titulo)}`,
      'END:VEVENT',
    ],
    'REPLY',
  )
}

/** Un evento para exportar (horas en UTC, para que lo entienda cualquier calendario). */
export function eventoExportado(e: Pick<EventoIcs, 'uid' | 'titulo' | 'inicio' | 'fin' | 'todoElDia' | 'lugar' | 'descripcion' | 'enlace' | 'rrule' | 'exdates' | 'recurrencia' | 'estado'>): string[] {
  const t = (ms: number) => (e.todoElDia ? `;VALUE=DATE:${dia(ms)}` : `:${utc(ms)}`)
  const desc = [e.enlace ? `Unirse: ${e.enlace}` : '', e.descripcion].filter(Boolean).join('\n\n')
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(Date.now())}`,
    ...(e.recurrencia ? [`RECURRENCE-ID${t(e.recurrencia)}`] : []),
    `DTSTART${t(e.inicio)}`,
    `DTEND${t(e.fin)}`,
    `SUMMARY:${escapar(e.titulo)}`,
    ...(e.lugar ? [`LOCATION:${escapar(e.lugar)}`] : []),
    ...(desc ? [`DESCRIPTION:${escapar(desc.slice(0, 4000))}`] : []),
    ...(e.enlace ? [`URL:${e.enlace}`] : []),
    ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
    ...e.exdates.map((x) => `EXDATE${t(x)}`),
    ...(e.estado === 'cancelado' ? ['STATUS:CANCELLED'] : []),
    'END:VEVENT',
  ]
}

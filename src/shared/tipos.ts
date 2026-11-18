// Modelo compartido entre el proceso principal y la interfaz.

export type RolCarpeta = 'inbox' | 'drafts' | 'sent' | 'junk' | 'trash' | 'archive' | 'all' | 'normal'

export interface Cuenta {
  id: string
  nombre: string // cómo se muestra: «Gmail», «Trabajo»
  direccion: string
  remitente: string // nombre con el que firma: «Alex»
  auth: 'clave' | 'microsoft' | 'google'
}

export interface Carpeta {
  id: string // `${cuenta}:${ruta}`
  cuenta: string
  ruta: string
  nombre: string
  rol: RolCarpeta
  noLeidos: number
  total: number
}

export interface Direccion {
  nombre: string
  direccion: string
}

export interface Mensaje {
  id: string // `${cuenta}:${carpeta}:${uid}`
  cuenta: string
  carpeta: string // id de carpeta
  hilo: string
  de: Direccion
  para: Direccion[]
  cc: Direccion[]
  asunto: string
  vistaPrevia: string
  fecha: number // ms
  leido: boolean
  marcado: boolean
  respondido: boolean
  adjuntos: number
  enHilo: number // mensajes del hilo (1 si va solo)
  baja?: boolean // es un boletín con forma de darse de baja (List-Unsubscribe)
}

export interface Adjunto {
  nombre: string
  tipo: string
  tamano: number
  url: string // tuxmail://adjunto/… (servido desde la caché local)
  inline: boolean // imagen incrustada en el HTML: no sale como adjunto, sí en el visor
}

export interface EstadoCuenta {
  id: string
  estado: 'conectando' | 'listo' | 'error' | 'sin-clave'
  detalle?: string
}

export interface Datos {
  cuentas: Cuenta[]
  carpetas: Carpeta[]
  estados: EstadoCuenta[]
}

export interface Cuerpo {
  html: string | null
  texto: string | null
  adjuntos: Adjunto[]
  remotoBloqueado: boolean
  traduccion?: string | null // el correo ya traducido al español (HTML), si se tradujo antes
}

// Buzones que aparecen en la barra lateral: carpetas reales o vistas que juntan varias.
export type Buzon =
  | { tipo: 'carpeta'; carpeta: string }
  | { tipo: 'todas'; rol: 'inbox' | 'drafts' | 'sent' }
  | { tipo: 'marcados' }
  | { tipo: 'hoy' }

// ------------------------------------------------------------ redactar

export interface AdjuntoBorrador {
  nombre: string
  tamano: number
  tipo?: string
  ruta?: string // archivo del disco (elegido con el clip, arrastrado o pegado desde el gestor de archivos)
  url?: string // tuxmail://adjunto/… (reenviar)
  datos?: Uint8Array // pegado como datos
}

export interface Borrador {
  cuenta: string
  para: Direccion[]
  cc: Direccion[]
  cco: Direccion[]
  asunto: string
  html: string
  enRespuestaA?: string | null // Message-ID al que responde
  referencias?: string[]
  respondeA?: string | null // id del mensaje respondido, para marcarlo como respondido al enviar
  borradorId?: string | null // borrador guardado en el servidor: se sustituye al guardar y se borra al enviar
  adjuntos: AdjuntoBorrador[]
}

export interface DatosRespuesta {
  cuenta: string
  para: Direccion[]
  cc: Direccion[]
  asunto: string
  enRespuestaA: string | null
  referencias: string[]
  respondeA: string
  cabeceraCita: string // «El martes, 17 nov 2026, 13:39, Jake Nicol <…> escribió:»
  adjuntos: Adjunto[] // los del original, para reenviar
}

// ------------------------------------------------------------ calendario

export interface CalendarioInfo {
  id: string
  nombre: string
  tipo: 'invitaciones' | 'ical' | 'propio'
  cuenta: string | null
  color: string
  visible: boolean
  actualizado: number | null
  error: string | null
}

export interface PersonaEvento {
  nombre: string
  direccion: string
  respuesta?: string
}

/** Un evento listo para pintar (las repeticiones ya desplegadas: una instancia por aparición). */
export interface Instancia {
  clave: string // id + inicio: única por aparición
  id: string // el evento (para responder)
  calendario: string
  color: string
  titulo: string
  inicio: number
  fin: number
  todoElDia: boolean
  lugar: string
  descripcion: string
  enlace: string | null // Meet, Teams, Zoom…
  estado: 'confirmado' | 'provisional' | 'cancelado'
  miRespuesta: string | null // NEEDS-ACTION | ACCEPTED | TENTATIVE | DECLINED | ORGANIZADOR
  organizador: PersonaEvento | null
  asistentes: number
  esInvitacion: boolean
  mensaje: string | null // el correo que la trajo (o del que se creó)
  repite: boolean
  propio: boolean // creado en TuxMail: se puede editar y borrar
  avisos: number[] // minutos antes del inicio
}

/** Los avisos que se pueden elegir, en minutos antes. */
export const AVISOS: { minutos: number; texto: string }[] = [
  { minutos: 0, texto: 'Al empezar' },
  { minutos: 5, texto: '5 minutos' },
  { minutos: 10, texto: '10 minutos' },
  { minutos: 15, texto: '15 minutos' },
  { minutos: 30, texto: '30 minutos' },
  { minutos: 60, texto: '1 hora' },
  { minutos: 120, texto: '2 horas' },
  { minutos: 480, texto: '8 horas' },
  { minutos: 1440, texto: '1 día' },
  { minutos: 2880, texto: '2 días' },
  { minutos: 10080, texto: '1 semana' },
]

// ------------------------------------------------------------ suscripciones

/** Un remitente de boletines (o una lista), con cómo darse de baja. */
export interface Suscripcion {
  clave: string // List-Id o dirección
  cuenta: string
  nombre: string
  direccion: string
  ultimo: string // id del correo más reciente
  ultima: number
  total: number
  sinLeer: number
  aLaVista: number // los que no están en la papelera ni en spam
  metodo: 'un-clic' | 'correo' | 'web' // cómo se daría de baja
  bajaFecha: number | null // cuándo se pidió la baja desde TuxMail
  bajaMetodo: string | null
}

// Correos inventados para `pnpm demo`: sirven para diseñar y capturar sin datos reales.
import type { Carpeta, Cuenta, Cuerpo, Mensaje } from '@shared/tipos'
import type { Db, NuevoMensaje } from './db'
import type { Calendario } from './calendario'

export const cuentas: Cuenta[] = [
  { id: 'personal', nombre: 'Personal', direccion: 'alex@ejemplo.com', remitente: 'Alex', auth: 'clave' },
  { id: 'trabajo', nombre: 'Trabajo', direccion: 'alex@estudio-ejemplo.es', remitente: 'Alex Martín', auth: 'clave' },
]

const carpetasBase: [string, string, Carpeta['rol']][] = [
  ['INBOX', 'Bandeja de entrada', 'inbox'],
  ['Drafts', 'Borradores', 'drafts'],
  ['Sent', 'Enviados', 'sent'],
  ['Junk', 'Spam', 'junk'],
  ['Trash', 'Papelera', 'trash'],
  ['Archive', 'Archivo', 'archive'],
]

export const carpetas: Carpeta[] = cuentas.flatMap((c) => [
  ...carpetasBase.map(([ruta, nombre, rol]) => ({
    id: `${c.id}\u0000${ruta}`,
    cuenta: c.id,
    ruta,
    nombre,
    rol,
    noLeidos: 0,
    total: 0,
  })),
  ...(c.id === 'personal'
    ? [{ id: 'personal\u0000Importantes', cuenta: 'personal', ruta: 'Importantes', nombre: 'Importantes', rol: 'normal' as const, noLeidos: 0, total: 0 }]
    : [
        { id: 'trabajo\u0000Clientes', cuenta: 'trabajo', ruta: 'Clientes', nombre: 'Clientes', rol: 'normal' as const, noLeidos: 0, total: 0 },
        { id: 'trabajo\u0000Facturas', cuenta: 'trabajo', ruta: 'Facturas', nombre: 'Facturas', rol: 'normal' as const, noLeidos: 0, total: 0 },
      ]),
])

const ahora = new Date()
function hace(dias: number, hora: number, min: number): number {
  const d = new Date(ahora)
  d.setDate(d.getDate() - dias)
  d.setHours(hora, min, 0, 0)
  return d.getTime()
}

type Semilla = [
  cuenta: string,
  carpeta: string,
  nombre: string,
  direccion: string,
  asunto: string,
  vista: string,
  fecha: number,
  extra?: Partial<Mensaje>,
]

const semillas: Semilla[] = [
  ['trabajo', 'INBOX', 'Lucía Ferrer', 'lucia@estudioalba.es', 'Nueva home: segunda ronda de cambios',
    'Hemos revisado la propuesta con el equipo y nos encanta la dirección. Solo un par de cosas: el hero se siente algo vacío en móvil y nos gustaría probar la tipografía del titular un punto más grande. ¿Lo vemos el jueves?',
    hace(0, 9, 41), { leido: false, enHilo: 4, adjuntos: 2 }],
  ['personal', 'INBOX', 'Vercel', 'notifications@vercel.com', 'Deployment ready: web-cliente',
    'Your deployment of web-cliente to production is ready. Commit 4f2a91c «arreglar el menú en móvil» by alex. Visit the deployment to see the changes live.',
    hace(0, 9, 12), { leido: false }],
  ['trabajo', 'INBOX', 'Marcos Ibáñez', 'marcos@nortedigital.com', 'Re: Integración del formulario en el editor',
    'Perfecto, entonces vamos con la opción A. Mañana preparo el entorno de staging y os paso las credenciales. Si os viene bien, a las 10:00 hacemos una llamada corta para cerrar los detalles del despliegue.',
    hace(0, 8, 53), { respondido: true, enHilo: 3 }],
  ['personal', 'INBOX', 'Clara Ruiz', 'clara.ruiz@ejemplo.com', 'Cena del sábado 🍝',
    'Al final somos seis. He reservado en el italiano de la plaza a las 21:30. Si alguien no puede que avise antes del viernes, que tienen lista de espera.',
    hace(0, 7, 30), { marcado: true }],
  ['trabajo', 'INBOX', 'GitHub', 'noreply@github.com', '[web-cliente] Pull request #42: galería en móvil',
    'jaime-dev wants to merge 3 commits into main from feat/galeria-movil. La galería ahora carga las imágenes bajo demanda y va fluida en móviles antiguos.',
    hace(1, 22, 4), { leido: false, enHilo: 6 }],
  ['personal', 'INBOX', 'Correos', 'avisos@correos-ejemplo.es', 'Tu envío está en reparto',
    'Tu envío PQ4X2210 saldrá hoy en reparto. Franja estimada de entrega: entre las 10:00 y las 14:00. Puedes cambiar la entrega a una oficina desde la app.',
    hace(1, 18, 20)],
  ['trabajo', 'INBOX', 'Andrea Soler', 'andrea@nortedigital.com', 'Accesos al panel de analítica',
    'Te he dado de alta en el panel con permisos de lectura. Las métricas de la campaña de noviembre ya están cargadas; avísame si ves algo raro en los eventos del formulario.',
    hace(1, 16, 2), { adjuntos: 1 }],
  ['personal', 'INBOX', 'Figma', 'no-reply@figma.com', 'Lucía Ferrer comentó en «Home — v3»',
    '«¿Podemos probar este bloque con más aire entre las tarjetas?» — Responde directamente desde el archivo o desde este correo.',
    hace(1, 12, 47)],
  ['trabajo', 'INBOX', 'Héctor Moreno', 'hector@nortedigital.com', 'Cartel de la campaña',
    'Ya lo veo todo y con tu guía he encontrado dónde subirlo. Intentaré dejarlo en staging esta tarde o mañana a primera hora para que lo reviséis.',
    hace(2, 11, 15), { enHilo: 2 }],
  ['personal', 'INBOX', 'Banco Ejemplo', 'avisos@banco-ejemplo.es', 'Resumen mensual de tu cuenta',
    'Ya tienes disponible el extracto de octubre. Accede a la app para consultar tus movimientos y descargar el documento en PDF.',
    hace(3, 8, 0)],
  ['trabajo', 'INBOX', 'Jaime Ortega', 'jaime@ejemplo.dev', 'Ideas para el taller del viernes',
    'Estuve pensando en el orden de las charlas: si empezamos por la parte práctica la gente llega con más ganas a la de preguntas. ¿Te parece si lo cerramos mañana?',
    hace(4, 19, 33), { marcado: true, leido: false }],
  ['personal', 'INBOX', 'LinkedIn Job Alerts', 'jobalerts-noreply@linkedin.com', '5 ofertas nuevas de «Desarrollador frontend» en Valencia',
    'Nuevas ofertas que coinciden con tus preferencias: Desarrollador frontend (React), Ingeniero de software…',
    hace(2, 8, 15)],
  ['personal', 'INBOX', 'LinkedIn', 'messages-noreply@linkedin.com', 'Marta te ha enviado un mensaje',
    'Hola, he visto tu perfil y me gustaría comentarte un proyecto. ¿Hablamos esta semana?',
    hace(3, 12, 40), { leido: false }],
  ['personal', 'INBOX', 'LinkedIn News', 'newsletters-noreply@e.linkedin.com', 'Las 10 tendencias que marcarán 2027',
    'Los editores de LinkedIn News han seleccionado lo más leído de la semana en tu sector…',
    hace(5, 7, 0), { leido: false }],
  ['personal', 'INBOX', 'Spotify', 'no-reply@spotify.com', 'Tu mezcla de la semana está lista',
    'Hemos preparado 30 canciones nuevas a partir de lo que has escuchado últimamente. Dale al play antes del lunes.',
    hace(6, 10, 0)],
  ['trabajo', 'INBOX', 'Lucía Ferrer', 'lucia@estudioalba.es', 'Presupuesto aprobado',
    'Buenas noticias: dirección ha aprobado el presupuesto tal cual. Os mandamos la orden de compra esta semana y arrancamos el día 24.',
    hace(9, 13, 25), { respondido: true }],
  ['trabajo', 'Sent', 'Lucía Ferrer', 'lucia@estudioalba.es', 'Re: Nueva home: segunda ronda de cambios',
    'Genial, el jueves a las 11 me va perfecto. Te preparo dos variantes del hero para que las comparéis en el móvil.',
    hace(0, 9, 55)],
  ['personal', 'Drafts', 'Clara Ruiz', 'clara.ruiz@ejemplo.com', 'Re: Cena del sábado 🍝',
    'Me apunto, llevo el postre. ¿Alguien sabe si',
    hace(0, 7, 45)],
]

export const mensajes: Mensaje[] = semillas.map(([cuenta, carpeta, nombre, direccion, asunto, vista, fecha, extra], i) => ({
  id: `${cuenta}:${carpeta}:${100 + i}`,
  cuenta,
  carpeta: `${cuenta}:${carpeta}`,
  hilo: `h${i}`,
  de: { nombre, direccion },
  para: [{ nombre: cuentas.find((c) => c.id === cuenta)!.remitente, direccion: cuentas.find((c) => c.id === cuenta)!.direccion }],
  cc: [],
  asunto,
  vistaPrevia: vista,
  fecha,
  leido: true,
  marcado: false,
  respondido: false,
  adjuntos: 0,
  enHilo: 1,
  ...extra,
}))

const html = (cuerpo: string) => `<div style="font-family: Inter, sans-serif">${cuerpo}</div>`

export function cuerpoDe(m: Mensaje): Cuerpo {
  if (m.de.direccion.includes('vercel')) {
    return {
      html: html(`
        <table width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse">
          <tr><td style="padding:24px 0"><img src="https://assets.vercel.com/logo.png" width="32" alt="Vercel"></td></tr>
          <tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">Deployment ready</td></tr>
          <tr><td style="color:#555;line-height:1.6">Your deployment of <b>web-cliente</b> to production is ready.<br>
          Commit <code>4f2a91c</code> «arreglar el menú en móvil».</td></tr>
          <tr><td style="padding:24px 0"><a href="https://vercel.com" style="background:#000;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View deployment</a></td></tr>
        </table>`),
      texto: null,
      adjuntos: [],
      remotoBloqueado: true,
    }
  }
  const parrafos = [m.vistaPrevia, 'Un abrazo,', m.de.nombre.split(' ')[0]]
  return {
    html: null,
    texto: `Hola Alex,\n\n${parrafos.join('\n\n')}`,
    adjuntos: Array.from({ length: m.adjuntos }, (_, i) =>
      i === 0
        ? { nombre: 'propuesta-home-v3.pdf', tipo: 'application/pdf', tamano: 2_480_000, url: '', inline: false }
        : { nombre: 'hero-movil.png', tipo: 'image/png', tamano: 845_000, url: '', inline: false },
    ),
    remotoBloqueado: false,
  }
}

// ---------------------------------------------------------------- sembrar la base de datos de la demo


const respuestasDemo = [
  'Perfecto, lo vemos así entonces. Te confirmo en cuanto lo tenga.',
  'Gracias por el resumen. Una duda: ¿esto afecta también a la versión móvil?',
  'Te paso lo que hablamos ayer para tenerlo por escrito.',
  'Genial, me encaja. Lo dejo listo antes del viernes.',
  'Adjunto la última versión con los cambios que comentamos.',
]

export function sembrar(db: Db) {
  for (const c of cuentas) {
    db.guardarCarpetas(
      c.id,
      carpetas.filter((f) => f.cuenta === c.id).map((f) => ({ ruta: f.ruta, nombre: f.nombre, rol: f.rol })),
    )
  }
  let uid = 1000
  const filas: NuevoMensaje[] = []
  for (const m of mensajes) {
    const ruta = m.carpeta.split(':')[1]
    const yo = cuentas.find((c) => c.id === m.cuenta)!
    filas.push({
      cuenta: m.cuenta, carpeta: ruta, uid: uid++, msgid: `<${m.hilo}@demo>`, enRespuesta: null, referencias: [],
      hilo: m.hilo, de: m.de, para: m.para, cc: [], asunto: m.asunto, vista: m.vistaPrevia, fecha: m.fecha,
      leido: m.leido, marcado: m.marcado, respondido: m.respondido, adjuntos: m.adjuntos, parteTexto: null,
    })
    // Mensajes anteriores del mismo hilo, alternando el remitente y tus respuestas desde Enviados.
    for (let k = 1; k < m.enHilo; k++) {
      const mio = k % 2 === 1
      filas.push({
        cuenta: m.cuenta, carpeta: mio ? 'Sent' : ruta, uid: uid++, msgid: `<${m.hilo}-${k}@demo>`, enRespuesta: null, referencias: [],
        hilo: m.hilo,
        de: mio ? { nombre: yo.remitente, direccion: yo.direccion } : m.de,
        para: mio ? [m.de] : m.para, cc: [],
        asunto: m.asunto.startsWith('Re:') ? m.asunto : `Re: ${m.asunto}`,
        vista: respuestasDemo[(k + m.asunto.length) % respuestasDemo.length],
        fecha: m.fecha - k * 3_600_000 * 5, leido: true, marcado: false, respondido: !mio, adjuntos: 0, parteTexto: null,
      })
    }
  }
  db.guardarMensajes(filas)
  // Boletines de ejemplo (para la vista Suscripciones): cómo darse de baja de cada uno.
  const baja = (unClic: boolean, correo: boolean, web = true) =>
    JSON.stringify({ web: web ? ['https://ejemplo.com/baja'] : [], correo: correo ? 'mailto:baja@ejemplo.com?subject=unsubscribe' : null, unClic })
  const boletines: [string, string][] = [
    ['no-reply@spotify.com', baja(true, false)],
    ['notifications@vercel.com', baja(true, true)],
    ['noreply@github.com', baja(false, true)],
    ['avisos@banco-ejemplo.es', baja(false, false)],
    ['no-reply@figma.com', baja(true, false)],
    ['jobalerts-noreply@linkedin.com', baja(true, false)],
    ['messages-noreply@linkedin.com', baja(true, false)],
    ['newsletters-noreply@e.linkedin.com', baja(true, false)],
    ['comments-noreply@figma.com', baja(true, false)],
  ]
  for (const [dir, b] of boletines) db.sql.prepare('UPDATE mensajes SET baja = ? WHERE lower(de_dir) = ?').run(b, dir)
  db.sql.prepare("UPDATE mensajes SET baja = '' WHERE baja IS NULL").run()
}

export function cuerpoDemo(m: Mensaje): Cuerpo {
  return cuerpoDe(m)
}

// ------------------------------------------------------------ calendario de ejemplo

const ics = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
const diaIcs = (d: Date) => ics(d).slice(0, 8)
const en = (dias: number, h: number, m = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(h, m, 0, 0)
  return d
}

function invitacion(uid: string, titulo: string, ini: Date, min: number, org: [string, string], extra: string[] = []) {
  const fin = new Date(ini.getTime() + min * 60000)
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'METHOD:REQUEST', 'BEGIN:VEVENT', `UID:${uid}`,
    `DTSTART:${ics(ini)}`, `DTEND:${ics(fin)}`, `SUMMARY:${titulo}`, `ORGANIZER;CN=${org[0]}:mailto:${org[1]}`,
    'ATTENDEE;PARTSTAT=NEEDS-ACTION;CN=Alex Martín:mailto:alex@estudio-ejemplo.es', 'SEQUENCE:0', ...extra, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export function sembrarCalendario(c: Calendario) {
  const yo = 'alex@estudio-ejemplo.es'
  const casos: [string, string][] = [
    ['demo-1', invitacion('demo-1', 'Revisión de la nueva home', en(0, 16, 0), 45, ['Lucía Ferrer', 'lucia@estudioalba.es'], ['X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij'])],
    ['demo-2', invitacion('demo-2', 'Llamada de staging', en(1, 10, 0), 30, ['Marcos Ibáñez', 'marcos@nortedigital.com'], ['DESCRIPTION:Unirse: https://teams.microsoft.com/l/meetup-join/ejemplo'])],
    ['demo-3', invitacion('demo-3', 'Daily del equipo', en(-7, 9, 30), 15, ['Andrea Soler', 'andrea@nortedigital.com'], ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'X-GOOGLE-CONFERENCE:https://meet.google.com/xyz-abcd-efg'])],
    ['demo-4', invitacion('demo-4', 'Taller del viernes', en(2, 12, 0), 120, ['Jaime Ortega', 'jaime@ejemplo.dev'], ['LOCATION:Sala grande'])],
    ['demo-5', invitacion('demo-5', 'Cierre de campaña', en(6, 17, 30), 60, ['Héctor Moreno', 'hector@nortedigital.com'])],
  ]
  for (const [i, t] of casos) c.procesarInvitacion('trabajo', 'Trabajo', `demo-correo-${i}`, Date.now(), t, yo)
  c.guardarRespuesta('inv-trabajo:demo-3:', 'ACCEPTED')
  c.guardarRespuesta('inv-trabajo:demo-4:', 'TENTATIVE')
  const fest = (n: number, titulo: string) => {
    const d = en(n, 0)
    return ['BEGIN:VEVENT', `UID:fest-${n}`, `DTSTART;VALUE=DATE:${diaIcs(d)}`, `SUMMARY:${titulo}`, 'END:VEVENT']
  }
  c.guardarEvento({
    titulo: 'Llamar al gestor',
    inicio: en(1, 13, 0).getTime(),
    fin: en(1, 13, 30).getTime(),
    todoElDia: false,
    lugar: '',
    nota: 'Preguntar por la factura de octubre y el modelo 303.',
    avisos: [10, 1440],
  })
  c.sembrarFeed('Festivos', ['BEGIN:VCALENDAR', 'VERSION:2.0', ...fest(9, 'Fiesta local'), ...fest(19, 'Día festivo'), 'END:VCALENDAR'].join('\r\n'))
}

// Correos inventados para `pnpm demo`: sirven para diseñar y capturar sin datos reales.
import type { Carpeta, Cuenta, Cuerpo, Mensaje } from '@shared/tipos'
import type { Db, NuevoMensaje } from './db'
import type { Calendario } from './calendario'

export const cuentas: Cuenta[] = [
  { id: 'personal', nombre: 'Personal', direccion: 'alex@example.com', remitente: 'Alex', auth: 'clave' },
  { id: 'trabajo', nombre: 'Work', direccion: 'alex@example-studio.com', remitente: 'Alex Morgan', auth: 'clave' },
]

const carpetasBase: [string, string, Carpeta['rol']][] = [
  ['INBOX', 'Inbox', 'inbox'],
  ['Drafts', 'Drafts', 'drafts'],
  ['Sent', 'Sent', 'sent'],
  ['Junk', 'Spam', 'junk'],
  ['Trash', 'Trash', 'trash'],
  ['Archive', 'Archive', 'archive'],
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
    ? [{ id: 'personal\u0000Important', cuenta: 'personal', ruta: 'Important', nombre: 'Important', rol: 'normal' as const, noLeidos: 0, total: 0 }]
    : [
        { id: 'trabajo\u0000Clients', cuenta: 'trabajo', ruta: 'Clients', nombre: 'Clients', rol: 'normal' as const, noLeidos: 0, total: 0 },
        { id: 'trabajo\u0000Invoices', cuenta: 'trabajo', ruta: 'Invoices', nombre: 'Invoices', rol: 'normal' as const, noLeidos: 0, total: 0 },
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
  ['trabajo', 'INBOX', 'Sophie Laurent', 'sophie@albastudio.com', 'New homepage: second round of changes',
    'We went through the proposal with the team and we love the direction. Just a couple of things: the hero feels a bit empty on mobile, and we\'d like to try the headline one size bigger. Can we go over it on Thursday?',
    hace(0, 9, 41), { leido: false, enHilo: 4, adjuntos: 2 }],
  ['personal', 'INBOX', 'Vercel', 'notifications@vercel.com', 'Deployment ready: alba-website',
    'Your deployment of alba-website to production is ready. Commit 4f2a91c "fix mobile menu" by alex. Visit the deployment to see the changes live.',
    hace(0, 9, 12), { leido: false }],
  ['trabajo', 'INBOX', 'Mark Jensen', 'mark@northdigital.com', 'Re: Embedding the form in the editor',
    'Perfect, let\'s go with option A then. Tomorrow I\'ll set up the staging environment and send you the credentials. If it works for you, let\'s have a quick call at 10:00 to settle the deployment details.',
    hace(0, 8, 53), { respondido: true, enHilo: 3 }],
  ['personal', 'INBOX', 'Clara Weiss', 'clara.weiss@example.com', 'Saturday dinner 🍝',
    'Looks like there are six of us. I\'ve booked the Italian place on the square for 9:30 pm. If anyone can\'t make it, let me know before Friday — they have a waiting list.',
    hace(0, 7, 30), { marcado: true }],
  ['trabajo', 'INBOX', 'GitHub', 'noreply@github.com', '[alba-website] Pull request #42: mobile gallery',
    'james-dev wants to merge 3 commits into main from feat/mobile-gallery. The gallery now lazy-loads its images and runs smoothly on older phones.',
    hace(1, 22, 4), { leido: false, enHilo: 6 }],
  ['personal', 'INBOX', 'ParcelPoint', 'updates@parcelpoint-example.com', 'Your parcel is out for delivery',
    'Your parcel PQ4X2210 is out for delivery today. Estimated delivery window: between 10:00 am and 2:00 pm. You can redirect it to a pickup point from the app.',
    hace(1, 18, 20)],
  ['trabajo', 'INBOX', 'Andrea Rossi', 'andrea@northdigital.com', 'Access to the analytics dashboard',
    'I\'ve added you to the dashboard with read-only access. The November campaign metrics are already in; let me know if anything looks off in the form events.',
    hace(1, 16, 2), { adjuntos: 1 }],
  ['personal', 'INBOX', 'Figma', 'no-reply@figma.com', 'Sophie Laurent commented on "Home — v3"',
    '"Could we try this block with more breathing room between the cards?" — Reply directly from the file or from this email.',
    hace(1, 12, 47)],
  ['trabajo', 'INBOX', 'Hugo Martins', 'hugo@northdigital.com', 'Campaign poster',
    'I can see everything now, and thanks to your guide I found where to upload it. I\'ll try to get it onto staging this afternoon or first thing tomorrow so you can review it.',
    hace(2, 11, 15), { enHilo: 2 }],
  ['personal', 'INBOX', 'Example Bank', 'alerts@examplebank.com', 'Your monthly account summary',
    'Your October statement is now available. Open the app to check your transactions and download it as a PDF.',
    hace(3, 8, 0)],
  ['trabajo', 'INBOX', 'James Okafor', 'james@example.dev', 'Ideas for Friday\'s workshop',
    'I\'ve been thinking about the order of the talks: if we start with the hands-on part, people will be more engaged by the Q&A. Shall we lock it in tomorrow?',
    hace(4, 19, 33), { marcado: true, leido: false }],
  ['personal', 'INBOX', 'LinkedIn Job Alerts', 'jobalerts-noreply@linkedin.com', '5 new jobs for "Frontend Developer" in Berlin',
    'New jobs matching your preferences: Frontend Developer (React), Software Engineer…',
    hace(2, 8, 15)],
  ['personal', 'INBOX', 'LinkedIn', 'messages-noreply@linkedin.com', 'Maya sent you a message',
    'Hi, I came across your profile and I\'d love to tell you about a project. Do you have time for a chat this week?',
    hace(3, 12, 40), { leido: false }],
  ['personal', 'INBOX', 'LinkedIn News', 'newsletters-noreply@e.linkedin.com', '10 trends that will shape 2027',
    'LinkedIn News editors have picked the most-read stories of the week in your industry…',
    hace(5, 7, 0), { leido: false }],
  ['personal', 'INBOX', 'Spotify', 'no-reply@spotify.com', 'Your Discover Weekly is ready',
    'We\'ve put together 30 new songs based on what you\'ve been listening to lately. Hit play before Monday.',
    hace(6, 10, 0)],
  ['trabajo', 'INBOX', 'Sophie Laurent', 'sophie@albastudio.com', 'Budget approved',
    'Good news: management approved the budget as is. We\'ll send you the purchase order this week and kick off on the 24th.',
    hace(9, 13, 25), { respondido: true }],
  ['trabajo', 'Sent', 'Sophie Laurent', 'sophie@albastudio.com', 'Re: New homepage: second round of changes',
    'Great, Thursday at 11 works perfectly for me. I\'ll prepare two versions of the hero so you can compare them on your phones.',
    hace(0, 9, 55)],
  ['personal', 'Drafts', 'Clara Weiss', 'clara.weiss@example.com', 'Re: Saturday dinner 🍝',
    'Count me in, I\'ll bring dessert. Does anyone know if',
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
          <tr><td style="color:#555;line-height:1.6">Your deployment of <b>alba-website</b> to production is ready.<br>
          Commit <code>4f2a91c</code> "fix mobile menu".</td></tr>
          <tr><td style="padding:24px 0"><a href="https://vercel.com" style="background:#000;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View deployment</a></td></tr>
        </table>`),
      texto: null,
      adjuntos: [],
      remotoBloqueado: true,
    }
  }
  const parrafos = [m.vistaPrevia, 'Best,', m.de.nombre.split(' ')[0]]
  return {
    html: null,
    texto: `Hi Alex,\n\n${parrafos.join('\n\n')}`,
    adjuntos: Array.from({ length: m.adjuntos }, (_, i) =>
      i === 0
        ? { nombre: 'homepage-proposal-v3.pdf', tipo: 'application/pdf', tamano: 2_480_000, url: '', inline: false }
        : { nombre: 'hero-mobile.png', tipo: 'image/png', tamano: 845_000, url: '', inline: false },
    ),
    remotoBloqueado: false,
  }
}

// ---------------------------------------------------------------- sembrar la base de datos de la demo


const respuestasDemo = [
  'Sounds good, let\'s do it that way. I\'ll confirm as soon as I have it.',
  'Thanks for the summary. One question: does this affect the mobile version too?',
  'Here\'s what we discussed yesterday, so we have it in writing.',
  'Great, that works for me. I\'ll have it ready before Friday.',
  'Attached is the latest version with the changes we talked about.',
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
    JSON.stringify({ web: web ? ['https://example.com/unsubscribe'] : [], correo: correo ? 'mailto:unsubscribe@example.com?subject=unsubscribe' : null, unClic })
  const boletines: [string, string][] = [
    ['no-reply@spotify.com', baja(true, false)],
    ['notifications@vercel.com', baja(true, true)],
    ['noreply@github.com', baja(false, true)],
    ['alerts@examplebank.com', baja(false, false)],
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
    'ATTENDEE;PARTSTAT=NEEDS-ACTION;CN=Alex Morgan:mailto:alex@example-studio.com', 'SEQUENCE:0', ...extra, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export function sembrarCalendario(c: Calendario) {
  const yo = 'alex@example-studio.com'
  const casos: [string, string][] = [
    ['demo-1', invitacion('demo-1', 'New homepage review', en(0, 16, 0), 45, ['Sophie Laurent', 'sophie@albastudio.com'], ['X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij'])],
    ['demo-2', invitacion('demo-2', 'Staging call', en(1, 10, 0), 30, ['Mark Jensen', 'mark@northdigital.com'], ['DESCRIPTION:Join: https://teams.microsoft.com/l/meetup-join/example'])],
    ['demo-3', invitacion('demo-3', 'Team stand-up', en(-7, 9, 30), 15, ['Andrea Rossi', 'andrea@northdigital.com'], ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'X-GOOGLE-CONFERENCE:https://meet.google.com/xyz-abcd-efg'])],
    ['demo-4', invitacion('demo-4', 'Friday workshop', en(2, 12, 0), 120, ['James Okafor', 'james@example.dev'], ['LOCATION:Main meeting room'])],
    ['demo-5', invitacion('demo-5', 'Campaign wrap-up', en(6, 17, 30), 60, ['Hugo Martins', 'hugo@northdigital.com'])],
  ]
  for (const [i, t] of casos) c.procesarInvitacion('trabajo', 'Work', `demo-correo-${i}`, Date.now(), t, yo)
  c.guardarRespuesta('inv-trabajo:demo-3:', 'ACCEPTED')
  c.guardarRespuesta('inv-trabajo:demo-4:', 'TENTATIVE')
  const fest = (n: number, titulo: string) => {
    const d = en(n, 0)
    return ['BEGIN:VEVENT', `UID:fest-${n}`, `DTSTART;VALUE=DATE:${diaIcs(d)}`, `SUMMARY:${titulo}`, 'END:VEVENT']
  }
  c.guardarEvento({
    titulo: 'Call the accountant',
    inicio: en(1, 13, 0).getTime(),
    fin: en(1, 13, 30).getTime(),
    todoElDia: false,
    lugar: '',
    nota: 'Ask about the October invoice and the quarterly VAT return.',
    avisos: [10, 1440],
  })
  c.sembrarFeed('Holidays', ['BEGIN:VCALENDAR', 'VERSION:2.0', ...fest(9, 'Local holiday'), ...fest(19, 'Public holiday'), 'END:VCALENDAR'].join('\r\n'))
}

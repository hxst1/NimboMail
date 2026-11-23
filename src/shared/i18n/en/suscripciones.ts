// Suscripciones: boletines agrupados por empresa, darse de baja y limpiar sus correos.
type Destino = 'trash' | 'archive' | 'junk'

export const suscripciones = {
  // Cómo se da de baja cada remitente.
  metodos: {
    unClic: { texto: 'One-Click Unsubscribe', ayuda: 'Unsubscribes instantly, without opening any website (RFC 8058).' },
    correo: { texto: 'Unsubscribe by Email', ayuda: 'NimboMail sends the unsubscribe email from your account.' },
    web: { texto: 'Unsubscribe on Website', ayuda: 'This sender only offers a web page: it will open in your browser.' },
  },
  // Hace cuánto llegó el último.
  hace: {
    hoy: 'today',
    ayer: 'yesterday',
    dias: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),
    meses: (n: number) => (n === 1 ? '1 month ago' : `${n} months ago`),
    anos: (n: number) => (n === 1 ? '1 year ago' : `${n} years ago`),
  },
  campanas: (n: number) => `${n} campaigns of the same newsletter`,
  lista: (id: string) => `List: ${id}`,
  paginaAbierta: (quien: string) => `Opened the unsubscribe page for ${quien}`,
  bajaPedida: (quien: string, porCorreo: boolean) => `Unsubscribe requested from ${quien}${porCorreo ? ' (by email)' : ''}`,
  errorBaja: (quien: string, error: string) => `Couldn't unsubscribe from ${quien}: ${error}`,
  movidos: (n: number, destino: Destino) =>
    `${n === 1 ? '1 email' : `${n} emails`} moved to ${destino === 'trash' ? 'Trash' : destino === 'archive' ? 'Archive' : 'Spam'} · Ctrl+Z to undo`,
  menu: {
    verCorreos: 'Show Emails',
    aPapelera: (n: number) => `Move ${n === 1 ? '1 Email' : `${n} Emails`} to Trash`,
    archivar: (n: number) => `Archive ${n === 1 ? '1 Email' : `${n} Emails`}`,
    aSpam: 'Move All to Spam',
  },
  bajaElegidas: (n: number) => `Unsubscribe requested from ${n === 1 ? '1 email type' : `${n} email types`}`,
  elegirTipo: 'Select this email type',
  ultimo: (asunto: string) => `Latest: "${asunto}"`,
  sinAsunto: '(no subject)',
  correos: (n: number): string => (n === 1 ? 'email' : 'emails'),
  tiposCorreo: (n: number): string => (n === 1 ? 'email type' : 'email types'),
  sinLeer: (porcentaje: number) => `${porcentaje}% unread`,
  ultimoHace: (hace: string) => `latest ${hace}`,
  pedidaEl: (fecha: string) => `Requested on ${fecha}`,
  bajaPedidaChip: 'Unsubscribe Requested',
  unMomento: 'One moment…',
  darseDeBaja: 'Unsubscribe',
  moverAPapelera: 'Move their emails to Trash',
  mas: 'More',
  resumen: (remitentes: number, tipos: number, aLaVista: number) =>
    `${remitentes === 1 ? '1 sender' : `${remitentes} senders`} · ${tipos === 1 ? '1 email type' : `${tipos} email types`} · ${aLaVista === 1 ? '1 of their emails' : `${aLaVista} of their emails`} in view`,
  buscando: 'Looking for newsletters…',
  buscar: 'Search sender or subject',
  ordenar: 'Sort',
  orden: { total: 'Most Emails', recientes: 'Most Recent', sinLeer: 'Most Unread' },
  ocultarDadas: 'Hide Unsubscribed',
  volver: 'Back to mail (Esc)',
  elegidos: (n: number) => (n === 1 ? '1 email type selected' : `${n} email types selected`),
  yaDados: (n: number) => `(${n} already unsubscribed)`,
  bajaDeEstos: (n: number) => (n === 1 ? 'Unsubscribe from This One' : `Unsubscribe from These ${n}`),
  susCorreosAPapelera: 'Move Their Emails to Trash',
  quitarSeleccion: 'Clear Selection',
  nadaConFiltro: 'Nothing matches that filter.',
  vacio:
    "No newsletters detected yet. NimboMail reads each email's unsubscribe header while syncing: if you just updated, it may take a little while.",
  elegirGrupo: 'Select all email types from this sender',
  todoDado: 'All Unsubscribed',
  dadosDe: (dadas: number, total: number) => `${dadas} of ${total} unsubscribed`,
  ocultar: 'Hide',
  verTipos: 'Show Types',
  ayudaGrupo: "Check the ones you don't want to receive. The rest will keep arriving as usual.",
  pie: "Grouped by company: expand each one to choose which email types to stop receiving. One-click and email unsubscribes don't open any website.",
}

// Textos que comparten varias pantallas y el proceso principal.
export const comun = {
  app: 'NimboMail',
  // Nombres de las carpetas especiales (el servidor puede darles otro nombre: se muestra este).
  roles: {
    inbox: 'Inbox',
    drafts: 'Drafts',
    sent: 'Sent',
    junk: 'Spam',
    trash: 'Trash',
    archive: 'Archive',
    all: 'All Mail',
  },
  buzones: {
    todasBandejas: 'All Inboxes',
    todosBorradores: 'All Drafts',
    todosEnviados: 'All Sent',
    marcados: 'Flagged',
    hoy: 'Today',
    calendario: 'Calendar',
    suscripciones: 'Subscriptions',
    favoritos: 'Favorites',
    buzonesInteligentes: 'Smart Mailboxes',
  },
  acciones: {
    cancelar: 'Cancel',
    guardar: 'Save',
    borrar: 'Delete',
    cerrar: 'Close',
    anadir: 'Add',
    quitar: 'Remove',
    deshacer: 'Undo',
    reintentar: 'Try Again',
  },
  ayer: 'Yesterday',
  // Avisos de los eventos: cuánto antes (AVISOS en tipos.ts).
  avisos: {
    alEmpezar: 'At start',
    minutos: (n: number) => (n === 1 ? '1 minute' : `${n} minutes`),
    horas: (n: number) => (n === 1 ? '1 hour' : `${n} hours`),
    dias: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    semanas: (n: number) => (n === 1 ? '1 week' : `${n} weeks`),
  },
}

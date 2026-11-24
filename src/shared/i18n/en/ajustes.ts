// Ventana de Ajustes: General, Barra lateral, Cuentas, Calendario y Acerca de.
export const ajustes = {
  titulo: 'Settings',
  secciones: {
    general: 'General',
    barra: 'Sidebar',
    cuentas: 'Accounts',
    calendario: 'Calendar',
    copia: 'Backup',
    acerca: 'About',
  },
  general: {
    idioma: 'Language',
    idiomaAuto: 'Automatic (System)',
    // Con «Automático» elegido se ve a qué idioma corresponde: «Automatic (English)».
    idiomaAutoCon: (idioma: string) => `Automatic (${idioma})`,
    nombresIdioma: { en: 'English', es: 'Spanish' },
    notaIdioma: 'Date and time fields switch format the next time NimboMail starts.',
    disposicion: 'Layout',
    columnas: 'List and Reader in Columns',
    ancha: 'Wide List',
    traducirSiempre: 'Always translate emails in English',
    notaTraducir: 'Translated on this computer with the Firefox Translations engine. Shortcut: Ctrl+Shift+T.',
  },
  barra: {
    nota: 'Choose what to show. You can also hide a folder by right-clicking it.',
    hoy: 'Today (smart mailbox)',
    suscripciones: 'Subscriptions (newsletters)',
    mostrarTodo: 'Show All Again',
  },
  cuentas: {
    clave: 'password',
    oauth: (proveedor: string) => `sign-in with ${proveedor}`,
    sinClave: 'password missing',
    conectando: 'connecting…',
    sinConexion: 'offline',
    botonClave: 'Password',
    volverAEntrar: 'Sign In Again',
    confirmarQuitar: 'Really Remove?',
    quitarTitulo: 'Remove from NimboMail (mail stays on the server)',
    quitada: (nombre: string) => `"${nombre}" removed from NimboMail`,
    anadir: 'Add Account',
    nota: 'Removing an account deletes its settings, password and local copy of mail from this computer. Nothing on the server is touched.',
  },
  calendario: {
    avisoReuniones: 'Default reminder for meetings (invitations)',
    sinAviso: 'None',
    antes: (aviso: string) => `${aviso} before`,
    notaAvisos: 'Each event can have its own with the bell. Reminders appear as system notifications.',
    sinCalendarios: 'No calendars yet: invitations you receive by email will show up on their own.',
    invitaciones: 'Invitations received by email',
    propio: 'Your events and notes, created in NimboMail',
    ical: 'Subscribed calendar (iCal)',
    error: (error: string) => `error: ${error}`,
    actualizado: (fecha: string) => `updated ${fecha}`,
    color: 'Calendar color',
    colorDe: (color: string) => `Color ${color}`,
    quitarSuscripcion: 'Remove subscription',
    notaColores:
      "Meetings are colored by platform: Google Meet in green, Teams in purple, Zoom in blue and Webex in orange. Everything else uses its calendar's color.",
    notaSuscribir:
      'To subscribe to another calendar, click "+" in Calendar view. Meetings are exported to ~/.local/share/nimbomail/calendario.ics for other desktop calendars.',
  },
  copia: {
    nota: 'Your settings live in ~/.config/nimbomail, so updating or reinstalling NimboMail keeps them. To move them to another computer, or restore them after deleting that folder, export them to a file.',
    incluye:
      'The file has your accounts, language, accent color, layout, sidebar and calendars. Passwords are not included: they stay in the system keyring (on another computer, enter them again in Accounts). It does include the links of subscribed calendars, so keep it somewhere private.',
    exportar: 'Export Settings…',
    importar: 'Import Settings…',
    exportada: (ruta: string) => `Settings saved to ${ruta}`,
    importada: (cuentas: number, calendarios: number) =>
      `Settings imported${cuentas ? ` · ${cuentas} account${cuentas === 1 ? '' : 's'} added` : ''}${calendarios ? ` · ${calendarios} calendar${calendarios === 1 ? '' : 's'} added` : ''}. Reloading…`,
    notaImportar: 'Importing never removes anything: it adds the accounts and calendars you are missing and applies the rest of the settings.',
  },
  acerca: {
    descripcion: 'An email client for Linux: fast, minimal and private. Free software under the GNU GPL v3 or later.',
    codigo: 'Source Code on GitHub',
  },
}

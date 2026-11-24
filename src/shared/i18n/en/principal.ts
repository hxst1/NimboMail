// Proceso principal: bandeja del sistema, notificaciones, diálogos, errores y textos de los correos que
// se envían (citas, reenvíos, respuestas a invitaciones…).
export const principal = {
  bandeja: {
    abrir: 'Open NimboMail',
    obtenerCorreo: 'Get New Mail',
    mensajeNuevo: 'New Message',
    salir: 'Quit NimboMail',
    sinLeer: (n: number) => `NimboMail · ${n} unread`,
    sigueTitulo: 'NimboMail is still in the tray',
    sigueCuerpo: 'So new mail and reminders keep arriving. To quit completely: right-click the icon → Quit, or Ctrl+Q.',
  },
  migracion: {
    titulo: 'Quit TuxMail',
    cuerpo:
      'TuxMail is now called NimboMail. Quit TuxMail completely (Ctrl+Q or from the tray) and open NimboMail again: your accounts and mail will move over automatically.',
  },
  adjuntarArchivos: 'Attach Files',
  // Copia de la configuración (Ajustes → Backup).
  configuracion: {
    exportarTitulo: 'Export NimboMail Settings',
    importarTitulo: 'Import NimboMail Settings',
    nombreArchivo: (fecha: string) => `nimbomail-settings-${fecha}.json`,
    filtro: 'NimboMail settings',
    ilegible: "Couldn't read the file: it isn't a valid settings backup",
    noEsCopia: "This file isn't a NimboMail settings backup",
    masNueva: 'This backup comes from a newer NimboMail: update the app first',
  },
  // Nombre de reserva cuando un archivo no trae el suyo.
  nombres: {
    adjunto: 'attachment',
    archivo: 'file',
    imagen: 'image',
  },
  cuentas: {
    // Primera línea (comentario) de cuentas.toml.
    cabeceraArchivo: "NimboMail accounts. Passwords aren't stored here: they're in the system keyring.",
    yaExiste: 'That account is already in NimboMail',
    faltaClave: 'Password missing',
    faltaClaveDe: (direccion: string) => `Password missing for ${direccion}`,
    iniciarSesionPrimero: 'You need to sign in first',
    usaClave: 'This account uses a password',
    noEncontrada: 'Account not found',
    noDisponible: 'Account not available',
    sinLlavero:
      "No system keyring found to store the password. Install GNOME Keyring, KWallet or KeePassXC (with Secret Service on) and try again",
    llaveroCancelado: 'The keyring was not unlocked',
    noGuardarLlavero: "Couldn't save to the keyring",
  },
  mensajes: {
    noEncontrado: 'Message not found',
    noDisponible: 'Message not available',
    yaNoEsta: 'The message is no longer on the server',
    noDescargar: "Couldn't download the message",
    adjuntoNoEncontrado: 'Attachment not found',
    precargaDescartada: 'Preload discarded',
    sinConexion: 'Offline',
    servidorNoMovio: "The server didn't move the message",
    noCambiar: "Couldn't change the message",
    noMover: "Couldn't move the message",
    enviadoSinCopia: "Sent, but couldn't save it to Sent",
    borradorNoDisponible: 'Draft not available',
    sinCarpetaBorradores: 'The account has no Drafts folder',
    noLeerAdjunto: (nombre: string) => `Couldn't read the attachment "${nombre}"`,
  },
  // Cabeceras de la cita al responder o reenviar (van dentro del correo que se envía).
  citas: {
    respuesta: (fecha: string, quien: string) => `On ${fecha}, ${quien} wrote:`,
    reenvio: (d: { de: string; fecha: string; asunto: string; para: string; cc: string | null }) =>
      `---------- Forwarded message ----------\nFrom: ${d.de}\nDate: ${d.fecha}\nSubject: ${d.asunto}\nTo: ${d.para}${d.cc ? `\nCc: ${d.cc}` : ''}`,
  },
  bajas: {
    remitenteSinBaja: "This sender doesn't offer a way to unsubscribe",
    correoSinBaja: "This email doesn't offer a way to unsubscribe",
    suscripcionNoEncontrada: 'Subscription not found',
  },
  // Respuesta al organizador de una invitación (iMIP): asunto y texto del correo.
  invitaciones: {
    noEncontrada: 'Invitation not found',
    asunto: {
      ACCEPTED: (titulo: string) => `Accepted: ${titulo}`,
      TENTATIVE: (titulo: string) => `Maybe: ${titulo}`,
      DECLINED: (titulo: string) => `Declined: ${titulo}`,
    },
    texto: {
      ACCEPTED: (quien: string, titulo: string) => `${quien} has accepted the invitation "${titulo}".`,
      TENTATIVE: (quien: string, titulo: string) => `${quien} might attend "${titulo}".`,
      DECLINED: (quien: string, titulo: string) => `${quien} has declined the invitation "${titulo}".`,
    },
  },
  calendario: {
    misEventos: 'My Events',
    sinTitulo: '(No Title)',
    soloPropios: 'Only your own events can be deleted',
    enlaceHttps: 'The link must start with https:// or webcal://',
    servidorRespondio: (estado: number) => `The server responded with ${estado}`,
    demasiadoGrande: 'The calendar is too large',
    noEsIcal: "The link isn't an iCal calendar",
  },
  // Notificación de un aviso: «Starts in 10 minutes · 4:00 PM–4:45 PM».
  aviso: {
    todoElDia: 'All day',
    empiezaAhora: 'Starting now',
    empiezaEn: (minutos: number) => (minutos === 1 ? 'Starts in 1 minute' : `Starts in ${minutos} minutes`),
    hoy: 'Today',
    hoyA: (hora: string) => `Today at ${hora}`,
    manana: 'Tomorrow',
    mananaA: (hora: string) => `Tomorrow at ${hora}`,
  },
  autoconfig: {
    direccionNoValida: "That address isn't valid",
    imapNoResponde: "The IMAP server isn't responding",
    // De dónde salió la configuración (se ve junto a los servidores detectados).
    origen: {
      conocido: 'known provider',
      googleMx: 'Google Workspace (from the MX records)',
      microsoftMx: 'Microsoft 365 (from the MX records)',
      mozilla: 'Mozilla database',
      mozillaDe: (dominio: string) => `Mozilla database (${dominio})`,
      autoconfigDe: (dominio: string) => `${dominio} autoconfig`,
      nombresHabituales: 'trying common server names',
      noEncontrada: 'not found: enter it manually',
    },
    ayuda: {
      gmail:
        `Gmail doesn't accept your regular password: it needs an app password. Create one named "NimboMail" and paste the 16 letters here (spaces don't matter). If Google says it isn't available, turn on 2-Step Verification first.`,
      gmailCrear: 'Create App Password',
      gmailDosPasos: '2-Step Verification',
      icloud: 'iCloud needs an app-specific password: create one in your Apple Account, under "Sign-In and Security".',
      icloudAbrir: 'Open Your Apple Account',
      yahoo: 'Yahoo needs an app password: create one in your account security settings.',
      yahooAbrir: 'Open Yahoo Security',
      fastmail: 'Fastmail needs an app password: create one in Settings → Privacy & Security.',
      proton: 'Proton only works with Proton Mail Bridge running: use the password the Bridge gives you.',
      protonDescargar: 'Download Proton Mail Bridge',
      microsoft:
        `This version of NimboMail isn't set up to sign in with Microsoft (see the README). You can try an app password if your account allows it.`,
    },
  },
  oauth: {
    listo: 'Done. You can go back to NimboMail now.',
    fallo: "Couldn't sign in. Go back to NimboMail to try again.",
    proveedorRespondio: (estado: number) => `The provider responded with ${estado}`,
    sinConfigurar: "This version of NimboMail isn't set up to sign in with this provider",
    tiempoAgotado: 'Sign-in timed out',
    respuestaNoValida: 'Invalid response from the provider',
    sinRenovacion: "The provider didn't allow staying signed in",
  },
  traductor: {
    modeloIncompleto: "Mozilla doesn't publish the complete English → Spanish model",
    noDescargar: (estado: number) => `Couldn't download the model (${estado})`,
    sumaNoCoincide: "The downloaded model doesn't match its checksum",
  },
  portapapeles: {
    noLeerImagen: "Couldn't read the image",
    formatoImagen: 'Unsupported image format',
    noLeerArchivo: "Couldn't read the file",
  },
}

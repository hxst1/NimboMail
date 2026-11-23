// Añadir una cuenta (y la bienvenida, y poner la contraseña de una cuenta que ya existe).
export const nuevaCuenta = {
  titulo: {
    clave: (cuenta: string) => `Password for ${cuenta}`,
    bienvenida: 'Welcome to NimboMail',
    nueva: 'Add an Account',
  },
  sub: {
    bienvenida: 'Add your first email account. Works with Gmail, Outlook, iCloud and any IMAP server.',
    nueva: 'Gmail, Outlook, iCloud, Yahoo or any IMAP server.',
  },
  placeholders: {
    nombre: 'Your name (shown to people who get your emails)',
    correo: 'name@example.com',
    etiqueta: 'Account name in NimboMail (Work, Personal…)',
    clave: 'Password',
    claveAplicacion: 'App password',
  },
  continuar: 'Continue',
  continuarCon: (proveedor: string) => `Continue with ${proveedor}`,
  anadir: 'Add Account',
  ajustesServidor: 'Server Settings',
  servidor: {
    puerto: 'Port',
    usuario: 'Username',
    certificadoDe: 'Certificate for',
  },
  ocupado: {
    buscando: 'Looking up your email settings…',
    anadiendo: 'Adding account…',
    comprobando: 'Checking…',
    probando: 'Testing connection…',
    navegador: 'Sign in using the browser window that just opened…',
  },
  errores: {
    direccion: 'Enter a valid email address',
    clave: 'Enter the password',
    servidores: 'Mail servers are missing',
    // Fallos al conectar: «lado» es recibir o enviar.
    ladoImap: 'incoming (IMAP)',
    ladoSmtp: 'outgoing (SMTP)',
    claveGoogle: "Google didn't accept the password. Gmail needs an app password, not your regular one.",
    claveServidor: (lado: string) => `The ${lado} server didn't accept the username or password.`,
    certificado: (lado: string) => `The ${lado} server's certificate doesn't match its name.`,
    conexion: (lado: string, detalle: string) => `Couldn't connect to the ${lado} server: ${detalle}`,
  },
  confiarCertificado: (nombre: string) => `Trust the certificate for ${nombre}`,
  anadirIgualmente: 'Add it anyway (receiving works; sending can be fixed later)',
  anadida: (cuenta: string) => `Account added: ${cuenta}. Downloading mail…`,
  claveGuardada: (cuenta: string) => `Password saved for ${cuenta}`,
  privacidad: 'Passwords are stored in the system keyring, and your mail stays on this computer only.',
}

import type { nuevaCuenta as En } from '../en/nuevaCuenta'

export const nuevaCuenta: typeof En = {
  titulo: {
    clave: (cuenta) => `Contraseña de ${cuenta}`,
    bienvenida: 'Te damos la bienvenida a NimboMail',
    nueva: 'Añadir una cuenta',
  },
  sub: {
    bienvenida: 'Añade tu primera cuenta de correo. Funciona con Gmail, Outlook, iCloud y cualquier servidor IMAP.',
    nueva: 'Gmail, Outlook, iCloud, Yahoo o cualquier servidor IMAP.',
  },
  placeholders: {
    nombre: 'Tu nombre (lo verán al recibir tus correos)',
    correo: 'correo@ejemplo.com',
    etiqueta: 'Nombre de la cuenta en NimboMail (Trabajo, Personal…)',
    clave: 'Contraseña',
    claveAplicacion: 'Contraseña de aplicación',
  },
  continuar: 'Continuar',
  continuarCon: (proveedor) => `Continuar con ${proveedor}`,
  anadir: 'Añadir cuenta',
  ajustesServidor: 'Ajustes del servidor',
  servidor: {
    puerto: 'Puerto',
    usuario: 'Usuario',
    certificadoDe: 'Certificado de',
  },
  ocupado: {
    buscando: 'Buscando la configuración de tu correo…',
    anadiendo: 'Añadiendo la cuenta…',
    comprobando: 'Comprobando…',
    probando: 'Probando la conexión…',
    navegador: 'Inicia sesión en el navegador que se ha abierto…',
  },
  errores: {
    direccion: 'Escribe una dirección de correo válida',
    clave: 'Escribe la contraseña',
    servidores: 'Faltan los servidores de correo',
    ladoImap: 'recibir (IMAP)',
    ladoSmtp: 'enviar (SMTP)',
    claveGoogle: 'Google no aceptó la contraseña. Gmail necesita una contraseña de aplicación, no la de siempre.',
    claveServidor: (lado) => `El servidor para ${lado} no aceptó el usuario o la contraseña.`,
    certificado: (lado) => `El certificado del servidor para ${lado} no coincide con su nombre.`,
    conexion: (lado, detalle) => `No se pudo conectar con el servidor para ${lado}: ${detalle}`,
  },
  confiarCertificado: (nombre) => `Confiar en el certificado de ${nombre}`,
  anadirIgualmente: 'Añadirla igualmente (recibir funciona; el envío se puede arreglar después)',
  anadida: (cuenta) => `Cuenta añadida: ${cuenta}. Descargando el correo…`,
  claveGuardada: (cuenta) => `Contraseña guardada para ${cuenta}`,
  privacidad: 'Las contraseñas se guardan en el llavero del sistema y el correo solo se queda en este equipo.',
}

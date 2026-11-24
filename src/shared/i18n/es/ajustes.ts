import type { ajustes as En } from '../en/ajustes'

export const ajustes: typeof En = {
  titulo: 'Ajustes',
  secciones: {
    general: 'General',
    barra: 'Barra lateral',
    cuentas: 'Cuentas',
    calendario: 'Calendario',
    copia: 'Copia de seguridad',
    acerca: 'Acerca de',
  },
  general: {
    idioma: 'Idioma',
    idiomaAuto: 'Automático (sistema)',
    idiomaAutoCon: (idioma) => `Automático (${idioma})`,
    nombresIdioma: { en: 'inglés', es: 'español' },
    notaIdioma: 'Los campos de fecha y hora cambian de formato la próxima vez que abras NimboMail.',
    disposicion: 'Disposición',
    columnas: 'Lista y lector en columnas',
    ancha: 'Lista ancha',
    traducirSiempre: 'Traducir siempre los correos en inglés',
    notaTraducir: 'Se traducen en este equipo con el motor de Firefox Translations. Atajo: Ctrl+Shift+T.',
  },
  barra: {
    nota: 'Elige qué se ve. También puedes ocultar una carpeta con clic derecho sobre ella.',
    hoy: 'Hoy (buzón inteligente)',
    suscripciones: 'Suscripciones (boletines)',
    mostrarTodo: 'Mostrar todo otra vez',
  },
  cuentas: {
    clave: 'contraseña',
    oauth: (proveedor) => `inicio de sesión con ${proveedor}`,
    sinClave: 'falta la contraseña',
    conectando: 'conectando…',
    sinConexion: 'sin conexión',
    botonClave: 'Contraseña',
    volverAEntrar: 'Volver a entrar',
    confirmarQuitar: '¿Seguro? Quitar',
    quitarTitulo: 'Quitar de NimboMail (el correo sigue en el servidor)',
    quitada: (nombre) => `«${nombre}» quitada de NimboMail`,
    anadir: 'Añadir cuenta',
    nota: 'Quitar una cuenta borra de este equipo su configuración, su contraseña y su copia del correo. No toca nada del servidor.',
  },
  calendario: {
    avisoReuniones: 'Aviso por defecto de las reuniones (invitaciones)',
    sinAviso: 'Sin aviso',
    antes: (aviso) => `${aviso} antes`,
    notaAvisos: 'Cada evento puede tener los suyos con la campana. Los avisos salen como notificación del sistema.',
    sinCalendarios: 'Todavía no hay calendarios: las invitaciones que te lleguen por correo aparecerán solas.',
    invitaciones: 'Invitaciones recibidas por correo',
    propio: 'Tus eventos y notas, creados en NimboMail',
    ical: 'Calendario suscrito (iCal)',
    error: (error) => `error: ${error}`,
    actualizado: (fecha) => `actualizado ${fecha}`,
    color: 'Color del calendario',
    colorDe: (color) => `Color ${color}`,
    quitarSuscripcion: 'Quitar la suscripción',
    notaColores:
      'Las reuniones se colorean según su plataforma: Google Meet en verde, Teams en morado, Zoom en azul y Webex en naranja. El resto toma el color de su calendario.',
    notaSuscribir:
      'Para suscribirte a otro calendario, pulsa «+» en la vista Calendario. Las reuniones se exportan a ~/.local/share/nimbomail/calendario.ics para otros calendarios del escritorio.',
  },
  copia: {
    nota: 'Tu configuración vive en ~/.config/nimbomail, así que al actualizar o reinstalar NimboMail se mantiene. Para llevártela a otro equipo, o recuperarla si borras esa carpeta, expórtala a un archivo.',
    incluye:
      'El archivo lleva tus cuentas, el idioma, el color de resaltado, la disposición, la barra lateral y los calendarios. No lleva las contraseñas: siguen en el llavero del sistema (en otro equipo, vuelve a ponerlas en Cuentas). Sí lleva los enlaces de los calendarios suscritos, así que guárdalo en un sitio privado.',
    exportar: 'Exportar configuración…',
    importar: 'Importar configuración…',
    exportada: (ruta) => `Configuración guardada en ${ruta}`,
    importada: (cuentas, calendarios) =>
      `Configuración importada${cuentas ? ` · ${cuentas} cuenta${cuentas === 1 ? '' : 's'} añadida${cuentas === 1 ? '' : 's'}` : ''}${calendarios ? ` · ${calendarios} calendario${calendarios === 1 ? '' : 's'} añadido${calendarios === 1 ? '' : 's'}` : ''}. Recargando…`,
    notaImportar: 'Importar nunca quita nada: añade las cuentas y calendarios que falten y aplica el resto de ajustes.',
  },
  acerca: {
    descripcion: 'Cliente de correo para Linux: rápido, minimalista y privado. Software libre bajo la licencia GNU GPL v3 o posterior.',
    codigo: 'Código fuente en GitHub',
  },
}

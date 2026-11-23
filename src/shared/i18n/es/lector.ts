import type { lector as En } from '../en/lector'

export const lector: typeof En = {
  ningunMensaje: 'Ningún mensaje seleccionado',
  volver: 'Volver a la lista',
  sinAsunto: '(Sin asunto)',
  mensajes: (n) => (n === 1 ? '1 mensaje' : `${n} mensajes`),
  tu: (nombre) => `${nombre} (tú)`,
  para: 'Para:',
  cargando: 'Cargando…',
  noSeCargo: (error) => `No se pudo cargar el mensaje: ${error}`,
  imagen: (n) => `Imagen ${n}`,
  abrirAdjunto: (nombre) => `${nombre} — abrir vista rápida`,
  mostrarCita: 'Mostrar el texto citado',
  borrador: {
    sinEnviar: 'Borrador sin enviar',
    editar: 'Editar y enviar',
  },
  baja: {
    boton: 'Darse de baja',
    pedida: 'Baja pedida',
    titulo: 'Darse de baja de este boletín',
    deRemitente: (remitente) => `Darse de baja de ${remitente}`,
    paginaAbierta: 'Se ha abierto su página de baja',
    pedidaA: (remitente) => `Baja pedida a ${remitente}`,
    noSePudo: (error) => `No se pudo: ${error}`,
  },
  traduccion: {
    enIngles: 'Este correo está en inglés',
    traducido: 'Traducido del inglés',
    traduciendo: 'Traduciendo…',
    descargando: 'Descargando el traductor (solo la primera vez, unos 37 MB)…',
    noCargado: 'El correo aún no se ha cargado',
    noSePudo: (error) => `No se pudo traducir: ${error}`,
    traducir: 'Traducir',
    verOriginal: 'Ver original',
  },
}

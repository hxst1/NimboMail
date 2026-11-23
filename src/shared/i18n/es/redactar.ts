import type { redactar as En } from '../en/redactar'

export const redactar: typeof En = {
  titulo: {
    nuevo: 'Mensaje nuevo',
    borrador: 'Borrador',
    respuesta: 'Respuesta',
  },
  campos: {
    de: 'De',
    para: 'Para',
    ccCco: 'Cc/Cco',
    cc: 'Cc',
    cco: 'Cco',
    asunto: 'Asunto',
  },
  descartar: 'Descartar',
  cerrar: 'Cerrar (se guarda en Borradores)',
  enviar: 'Enviar',
  enviando: 'Enviando…',
  enviarSinAsunto: 'Enviar sin asunto',
  preparando: 'Preparando…',
  guardado: {
    guardando: 'Guardando…',
    guardado: 'Guardado en Borradores',
    error: 'No se pudo guardar el borrador',
  },
  enviado: 'Mensaje enviado',
  faltaDestinatario: 'Falta al menos un destinatario',
  noSeEnvio: (error) => `No se pudo enviar: ${error}`,
  archivoSinNombre: 'archivo',
  formato: {
    negrita: 'Negrita (Ctrl+B)',
    cursiva: 'Cursiva (Ctrl+I)',
    subrayado: 'Subrayado (Ctrl+U)',
    lista: 'Lista',
    listaNumerada: 'Lista numerada',
    enlace: 'Enlace',
    enlacePlaceholder: 'https://… y Intro',
    adjuntar: 'Adjuntar archivos',
  },
}

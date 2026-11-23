// Ventana de redactar: campos, formato, adjuntos, borradores y envío.
export const redactar = {
  titulo: {
    nuevo: 'New Message',
    borrador: 'Draft',
    respuesta: 'Reply',
  },
  campos: {
    de: 'From',
    para: 'To',
    ccCco: 'Cc/Bcc',
    cc: 'Cc',
    cco: 'Bcc',
    asunto: 'Subject',
  },
  descartar: 'Discard',
  cerrar: 'Close (saved to Drafts)',
  enviar: 'Send',
  enviando: 'Sending…',
  enviarSinAsunto: 'Send Without Subject',
  preparando: 'Preparing…',
  guardado: {
    guardando: 'Saving…',
    guardado: 'Saved to Drafts',
    error: "Couldn't save the draft",
  },
  enviado: 'Message sent',
  faltaDestinatario: 'Add at least one recipient',
  noSeEnvio: (error: string) => `Couldn't send: ${error}`,
  // Nombre de un archivo pegado que no trae nombre.
  archivoSinNombre: 'file',
  formato: {
    negrita: 'Bold (Ctrl+B)',
    cursiva: 'Italic (Ctrl+I)',
    subrayado: 'Underline (Ctrl+U)',
    lista: 'Bulleted list',
    listaNumerada: 'Numbered list',
    enlace: 'Link',
    enlacePlaceholder: 'https://… and Enter',
    adjuntar: 'Attach files',
  },
}

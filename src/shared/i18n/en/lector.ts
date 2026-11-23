// Lector: la conversación abierta, sus cabeceras, adjuntos, borradores y la barra de traducción.
export const lector = {
  ningunMensaje: 'No Message Selected',
  volver: 'Back to List',
  sinAsunto: '(No Subject)',
  mensajes: (n: number) => (n === 1 ? '1 message' : `${n} messages`),
  tu: (nombre: string) => `${nombre} (you)`,
  para: 'To:',
  cargando: 'Loading…',
  noSeCargo: (error: string) => `Couldn't load the message: ${error}`,
  imagen: (n: number) => `Image ${n}`,
  abrirAdjunto: (nombre: string) => `${nombre} — open Quick Look`,
  // Resumen «···» que despliega el texto citado.
  mostrarCita: 'Show quoted text',
  borrador: {
    sinEnviar: 'Unsent draft',
    editar: 'Edit and Send',
  },
  baja: {
    boton: 'Unsubscribe',
    pedida: 'Unsubscribe Requested',
    titulo: 'Unsubscribe from this newsletter',
    deRemitente: (remitente: string) => `Unsubscribe from ${remitente}`,
    paginaAbierta: 'Their unsubscribe page has opened',
    pedidaA: (remitente: string) => `Unsubscribe request sent to ${remitente}`,
    noSePudo: (error: string) => `Something went wrong: ${error}`,
  },
  traduccion: {
    enIngles: 'This message is in English',
    traducido: 'Translated from English',
    traduciendo: 'Translating…',
    descargando: 'Downloading the translator (first time only, about 37 MB)…',
    noCargado: "The message hasn't loaded yet",
    noSePudo: (error: string) => `Couldn't translate: ${error}`,
    traducir: 'Translate',
    verOriginal: 'Show Original',
  },
}

import type { editorEvento as En } from '../en/editorEvento'

export const editorEvento: typeof En = {
  editar: 'Editar evento',
  nuevo: 'Nuevo evento',
  titulo: 'Título',
  todoElDia: 'Todo el día',
  desde: 'Desde',
  dia: 'Día',
  hasta: 'Hasta',
  hora: 'Hora',
  lugar: 'Lugar o enlace de la videollamada',
  nota: 'Nota',
  avisos: 'Avisos',
  avisosTodoElDia: '(cuentan desde las 9:00 del día)',
  antes: (aviso) => `${aviso} antes`,
  enlazado: (asunto) => `Enlazado al correo${asunto ? ` «${asunto}»` : ''}`,
  borrarSeguro: '¿Seguro? Borrar',
  crear: 'Crear evento',
  guardado: 'Evento guardado',
  creado: 'Evento creado',
  borrado: 'Evento borrado',
}

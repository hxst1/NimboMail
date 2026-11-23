import type { vistaRapida as En } from '../en/vistaRapida'

export const vistaRapida: typeof En = {
  cerrar: 'Cerrar (Esc)',
  posicion: (actual, total) => `${actual} de ${total}`,
  ajustar: 'Ajustar',
  tamanoReal: 'Tamaño real',
  descargar: 'Descargar',
  sinVista: 'No hay vista previa para este tipo de archivo.',
  descargarArchivo: (nombre) => `Descargar ${nombre}`,
}

// Vista rápida de adjuntos e imágenes.
export const vistaRapida = {
  cerrar: 'Close (Esc)',
  posicion: (actual: number, total: number) => `${actual} of ${total}`,
  ajustar: 'Fit to window',
  tamanoReal: 'Actual size',
  descargar: 'Download',
  sinVista: 'No preview available for this file type.',
  descargarArchivo: (nombre: string) => `Download ${nombre}`,
}

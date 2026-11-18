import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ApiPrincipal } from '../main/index'
import type { Parche } from '../main/servicio'

type Promesa<F> = F extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never
type Api = { [K in keyof ApiPrincipal]: Promesa<ApiPrincipal[K]> }

// contextBridge copia propiedades: hace falta un objeto normal con cada método, no un Proxy.
const METODOS: (keyof ApiPrincipal)[] = [
  'datos', 'lista', 'contadores', 'hilo', 'cuerpo', 'precargar', 'contactos', 'marcar', 'mover', 'deshacer',
  'traductorListo', 'prepararTraductor', 'guardarTraduccion', 'borrarTraduccion',
  'copiarTexto', 'copiarImagen', 'copiarArchivo', 'guardarComo', 'abrirArchivo', 'buscarWeb', 'remitenteASpam',
  'prepararRespuesta', 'enviar', 'guardarBorrador', 'descartarBorrador', 'abrirBorrador', 'archivosDeUris', 'elegirArchivos',
  'detectarCuenta', 'oauthDisponibles', 'entrarConOAuth', 'probarCuenta', 'anadirCuenta', 'quitarCuenta', 'cambiarClave', 'volverAEntrar',
  'crearCarpeta', 'renombrarCarpeta', 'borrarCarpeta', 'abrirEnlace',
]
const llamar = Object.fromEntries(
  METODOS.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke('tuxmail', m, ...args)]),
) as Api

const arg = (nombre: string) => process.argv.find((a) => a.startsWith(`--niebla-${nombre}=`))?.split('=')[1] ?? null

const api = {
  demo: process.argv.includes('--niebla-demo'),
  // Para capturas: vista (columnas | ancha | ancha-abierta), mensaje seleccionado y acento forzados.
  vista: arg('vista'),
  sel: Number(arg('sel') ?? 0),
  acento: arg('acento'),
  api: llamar,
  // Ruta en disco de un archivo arrastrado a la ventana (para adjuntarlo sin copiarlo en memoria).
  rutaDeArchivo: (f: File) => webUtils.getPathForFile(f),
  alCambiar: (fn: () => void) => {
    const h = () => fn()
    ipcRenderer.on('tuxmail:cambios', h)
    return () => {
      ipcRenderer.removeListener('tuxmail:cambios', h)
    }
  },
  alParche: (fn: (p: Parche) => void) => {
    const h = (_e: unknown, p: Parche) => fn(p)
    ipcRenderer.on('tuxmail:parche', h)
    return () => {
      ipcRenderer.removeListener('tuxmail:parche', h)
    }
  },
  alError: (fn: (texto: string) => void) => {
    const h = (_e: unknown, t: string) => fn(t)
    ipcRenderer.on('tuxmail:error', h)
    return () => {
      ipcRenderer.removeListener('tuxmail:error', h)
    }
  },
}

contextBridge.exposeInMainWorld('niebla', api)

export type NieblaApi = typeof api

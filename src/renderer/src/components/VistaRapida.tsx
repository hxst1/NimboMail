import { useEffect, useState } from 'react'
import { CaretLeft, CaretRight, DownloadSimple, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from '@phosphor-icons/react'
import type { ElementoVista } from './Reader'
import { tamano } from '@/formato'
import { useT } from '@/i18n'

interface Props {
  elementos: ElementoVista[]
  indice: number
  onCerrar: () => void
}

const esImagen = (e: ElementoVista) => e.tipo.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(e.nombre)
const esPdf = (e: ElementoVista) => e.tipo === 'application/pdf' || /\.pdf$/i.test(e.nombre)

/** Vista rápida con la barra espaciadora: imágenes y documentos solo para ver. */
export function VistaRapida({ elementos, indice, onCerrar }: Props) {
  const t = useT()
  const [i, setI] = useState(indice)
  const [zoom, setZoom] = useState(false)
  const actual = elementos[i]
  const varios = elementos.length > 1

  useEffect(() => setZoom(false), [i])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        onCerrar()
      } else if (e.key === 'ArrowRight' && varios) {
        e.stopPropagation()
        setI((x) => (x + 1) % elementos.length)
      } else if (e.key === 'ArrowLeft' && varios) {
        e.stopPropagation()
        setI((x) => (x - 1 + elementos.length) % elementos.length)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [elementos.length, varios, onCerrar])

  if (!actual) return null

  return (
    <div className="vr-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="vr-ventana">
        <div className="vr-barra">
          <button className="tb-boton" title={t.vistaRapida.cerrar} onClick={onCerrar}>
            <X size={17} />
          </button>
          <div className="vr-titulo">
            <span>{actual.nombre}</span>
            {actual.tamano ? <small>{tamano(actual.tamano)}</small> : null}
            {varios && (
              <small>{t.vistaRapida.posicion(i + 1, elementos.length)}</small>
            )}
          </div>
          {esImagen(actual) && (
            <button className="tb-boton" title={zoom ? t.vistaRapida.ajustar : t.vistaRapida.tamanoReal} onClick={() => setZoom((z) => !z)}>
              {zoom ? <MagnifyingGlassMinus size={17} /> : <MagnifyingGlassPlus size={17} />}
            </button>
          )}
          <a className="tb-boton" title={t.vistaRapida.descargar} href={actual.url} download={actual.nombre}>
            <DownloadSimple size={17} />
          </a>
        </div>

        <div className={`vr-contenido${zoom ? ' zoom' : ''}`}>
          {esImagen(actual) ? (
            <img src={actual.url} alt={actual.nombre} onClick={() => setZoom((z) => !z)} draggable={false} />
          ) : esPdf(actual) ? (
            <iframe className="vr-doc" src={actual.url} title={actual.nombre} />
          ) : (
            <div className="vr-sin-vista">
              <div>{t.vistaRapida.sinVista}</div>
              <a href={actual.url} download={actual.nombre}>
                {t.vistaRapida.descargarArchivo(actual.nombre)}
              </a>
            </div>
          )}
        </div>

        {varios && (
          <>
            <button className="vr-flecha izq" onClick={() => setI((x) => (x - 1 + elementos.length) % elementos.length)}>
              <CaretLeft size={20} weight="bold" />
            </button>
            <button className="vr-flecha der" onClick={() => setI((x) => (x + 1) % elementos.length)}>
              <CaretRight size={20} weight="bold" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

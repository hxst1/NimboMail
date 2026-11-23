import { useEffect, useState } from 'react'
import { useT } from '@/i18n'

// Los colores de resaltado de NimboMail. Plata = Niebla, el de por defecto. Los nombres, en t.acento.colores.
export const ACENTOS = [
  { id: 'plata', color: '#c8ccd0' },
  { id: 'azul', color: '#4f8fe6' },
  { id: 'morado', color: '#a37ad6' },
  { id: 'rosa', color: '#d9558f' },
  { id: 'rojo', color: '#d45d5d' },
  { id: 'naranja', color: '#d9873f' },
  { id: 'verde', color: '#55a868' },
] as const

export type AcentoId = (typeof ACENTOS)[number]['id']

function leer(): AcentoId {
  const forzado = window.niebla?.acento
  if (ACENTOS.some((a) => a.id === forzado)) return forzado as AcentoId
  try {
    const v = localStorage.getItem('acento')
    if (ACENTOS.some((a) => a.id === v)) return v as AcentoId
  } catch {
    /* sin almacenamiento */
  }
  return 'plata'
}

export function useAcento() {
  const [acento, setAcento] = useState<AcentoId>(leer)
  useEffect(() => {
    document.documentElement.dataset.acento = acento
    try {
      localStorage.setItem('acento', acento)
    } catch {
      /* da igual */
    }
  }, [acento])
  return [acento, setAcento] as const
}

export function SelectorAcento({ acento, onCambiar }: { acento: AcentoId; onCambiar: (a: AcentoId) => void }) {
  const t = useT()
  const [hover, setHover] = useState<AcentoId | null>(null)
  const mostrado = ACENTOS.find((a) => a.id === (hover ?? acento))!
  return (
    <div>
      <div className="menu-mas-titulo">{t.acento.titulo}</div>
      <div className="colores" onMouseLeave={() => setHover(null)}>
        {ACENTOS.map((a) => (
          <button
            key={a.id}
            className={`color${a.id === acento ? ' activo' : ''}`}
            style={{ background: a.color }}
            title={t.acento.colores[a.id]}
            onMouseEnter={() => setHover(a.id)}
            onClick={() => onCambiar(a.id)}
          />
        ))}
      </div>
      <div className="menu-mas-nombre">{t.acento.colores[mostrado.id]}</div>
    </div>
  )
}

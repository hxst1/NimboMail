import { useEffect, useState } from 'react'

// Los colores de resaltado de TuxMail. Plata = Niebla, el de por defecto.
export const ACENTOS = [
  { id: 'plata', nombre: 'Plata (Niebla)', color: '#c8ccd0' },
  { id: 'azul', nombre: 'Azul', color: '#4f8fe6' },
  { id: 'morado', nombre: 'Morado', color: '#a37ad6' },
  { id: 'rosa', nombre: 'Rosa', color: '#d9558f' },
  { id: 'rojo', nombre: 'Rojo', color: '#d45d5d' },
  { id: 'naranja', nombre: 'Naranja', color: '#d9873f' },
  { id: 'verde', nombre: 'Verde', color: '#55a868' },
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
  const [hover, setHover] = useState<AcentoId | null>(null)
  const mostrado = ACENTOS.find((a) => a.id === (hover ?? acento))!
  return (
    <div>
      <div className="menu-mas-titulo">Color de resaltado</div>
      <div className="colores" onMouseLeave={() => setHover(null)}>
        {ACENTOS.map((a) => (
          <button
            key={a.id}
            className={`color${a.id === acento ? ' activo' : ''}`}
            style={{ background: a.color }}
            title={a.nombre}
            onMouseEnter={() => setHover(a.id)}
            onClick={() => onCambiar(a.id)}
          />
        ))}
      </div>
      <div className="menu-mas-nombre">{mostrado.nombre}</div>
    </div>
  )
}

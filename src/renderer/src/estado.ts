import { useCallback, useEffect, useRef, useState } from 'react'
import type { Buzon, Datos, Mensaje } from '@shared/tipos'

export const api = window.niebla.api

/**
 * Estado de la interfaz. Los datos viven en el proceso principal (SQLite); aquí solo se
 * guarda lo que se ve, y se vuelve a pedir cada vez que el principal avisa de cambios.
 */
export function useCorreo() {
  const [datos, setDatos] = useState<Datos>({ cuentas: [], carpetas: [], estados: [] })
  const [contadores, setContadores] = useState<Record<string, number>>({})
  const [lista, setLista] = useState<Mensaje[]>([])
  const [buzon, setBuzon] = useState<Buzon>({ tipo: 'todas', rol: 'inbox' })
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [cargado, setCargado] = useState(false)
  const vigente = useRef(0)

  const refrescar = useCallback(async () => {
    const turno = ++vigente.current
    const [d, c, l] = await Promise.all([api.datos(), api.contadores(), api.lista(buzon, busqueda)])
    if (turno !== vigente.current) return // llegó una respuesta más nueva
    setDatos(d)
    setContadores(c)
    setLista(l)
    setCargado(true)
  }, [buzon, busqueda])

  // Al escribir en el buscador se espera un poco antes de consultar; al cambiar de buzón, al momento.
  const primera = useRef(true)
  const ultimaBusqueda = useRef(busqueda)
  useEffect(() => {
    const escribiendo = !primera.current && ultimaBusqueda.current !== busqueda
    primera.current = false
    ultimaBusqueda.current = busqueda
    const t = setTimeout(() => refrescar(), escribiendo ? 140 : 0)
    const quitar = window.niebla.alCambiar(() => refrescar())
    return () => {
      clearTimeout(t)
      quitar()
    }
  }, [refrescar, busqueda])

  // Cambio de flags (leído, marcado): solo esas filas y los contadores, sin pedir la lista entera.
  useEffect(() => {
    let contadoresPendientes: ReturnType<typeof setTimeout> | null = null
    return window.niebla.alParche((p) => {
      const leidos = new Map(p.hilos.map((h) => [`${h.cuenta}\u0000${h.hilo}`, h.leido]))
      const marcados = new Map(p.marcados.map((m) => [m.id, m.marcado]))
      setLista((l) =>
        l.map((m) => {
          const leido = leidos.get(`${m.cuenta}\u0000${m.hilo}`)
          const marcado = marcados.get(m.id)
          if ((leido === undefined || leido === m.leido) && (marcado === undefined || marcado === m.marcado)) return m
          return { ...m, leido: leido ?? m.leido, marcado: marcado ?? m.marcado }
        }),
      )
      if (contadoresPendientes) clearTimeout(contadoresPendientes)
      contadoresPendientes = setTimeout(async () => {
        const [d, c] = await Promise.all([api.datos(), api.contadores()])
        setDatos(d)
        setContadores(c)
      }, 60)
    })
  }, [])

  const contar = useCallback(
    (b: Buzon, _soloNoLeidos = true): number => {
      switch (b.tipo) {
        case 'carpeta':
          return datos.carpetas.find((c) => c.id === b.carpeta)?.noLeidos ?? 0
        case 'todas':
          return b.rol === 'inbox' ? (contadores['todas:inbox'] ?? 0) : 0
        case 'marcados':
          return contadores.marcados ?? 0
        case 'hoy':
          return contadores.hoy ?? 0
      }
    },
    [datos.carpetas, contadores],
  )

  return {
    datos,
    lista,
    buzon,
    seleccion,
    busqueda,
    cargado,
    contar,
    refrescar,
    elegirBuzon: (b: Buzon) => {
      setBuzon(b)
      setSeleccion(null)
    },
    setSeleccion,
    setBusqueda,
  }
}

export type Correo = ReturnType<typeof useCorreo>

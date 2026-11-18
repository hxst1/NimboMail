import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowBendDoubleUpLeft, ArrowBendUpLeft, ArrowBendUpRight, ArrowSquareOut, ArrowLeft, Copy, DownloadSimple, Envelope, Eye,
  FilePdf, FileImage, FileXls, FileDoc, File as FileIco, Globe, LinkSimple, MagnifyingGlass, Paperclip, PencilSimple, Prohibit, Translate,
  UserPlus,
} from '@phosphor-icons/react'
import type { Adjunto, Cuerpo, Direccion, Mensaje } from '@shared/tipos'
import { useInterfaz, type ElementoMenu } from '@/components/MenuContextual'
import { TarjetaEvento } from '@/components/Calendario'
import type { Instancia } from '@shared/tipos'
import { fechaLarga, fechaLista, iniciales, tamano } from '@/formato'
import { plegarCitasHtml, separarCita, textoAHtml } from '@/citas'
import { api } from '@/estado'
import { iniciarTraductor, traducirArbol, traducirTexto } from '@/traductor'
import { esIngles, textoDeHtml } from '@/traductor/idioma'

/** «Traducir siempre los correos en inglés» (menú «···»). */
export const TRADUCIR_SIEMPRE = 'traducirSiempre'
const traducirSiempre = () => {
  try {
    return localStorage.getItem(TRADUCIR_SIEMPRE) === '1'
  } catch {
    return false
  }
}

export interface ElementoVista {
  url: string
  nombre: string
  tipo: string
  tamano?: number
}

interface Props {
  hilo: Mensaje[] // del más antiguo al más nuevo
  seleccionado: string | null
  nombreCuenta: (id: string) => string
  esMio: (direccion: string) => boolean
  onVolver?: () => void // solo en lista ancha
  onVistaRapida: (elementos: ElementoVista[], indice: number) => void
  esBorrador: (m: Mensaje) => boolean
}

// Cuerpos ya descargados en esta sesión (el principal también los guarda en SQLite).
const cache = new Map<string, Cuerpo>()

function useCuerpo(id: string, activo: boolean) {
  const [cuerpo, setCuerpo] = useState<Cuerpo | null>(cache.get(id) ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!activo || cache.has(id)) {
      if (cache.has(id)) setCuerpo(cache.get(id)!)
      return
    }
    let vivo = true
    api
      .cuerpo(id)
      .then((c) => {
        cache.set(id, c)
        if (vivo) setCuerpo(c)
      })
      .catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [id, activo])
  return { cuerpo, error }
}

const ESTILO_IFRAME = `
  html,body{margin:0;padding:0;background:transparent}
  body{font:14px/1.5 Inter,system-ui,sans-serif;color:#1d1f21;padding:22px 24px;word-wrap:break-word;overflow:hidden}
  img{max-width:100%;height:auto;cursor:zoom-in}
  a{color:#3f5a78}
  details.tm-cita{margin:10px 0}
  details.tm-cita > summary{list-style:none;display:inline-block;padding:0 9px;height:18px;line-height:14px;border-radius:9px;
    background:#e3e5e8;color:#5b6169;font-weight:700;letter-spacing:1px;cursor:pointer;user-select:none}
  details.tm-cita > summary::-webkit-details-marker{display:none}
  details.tm-cita[open] > summary{margin-bottom:8px}
  details.tm-cita[open]{border-left:2px solid #c3c8ce;padding-left:12px;color:#5b6169}
`

// La CSP no deja salir nada a internet: las imágenes remotas ya vienen reescritas a
// tuxmail://remoto/… y las sirve el principal desde su caché (como la protección de Mail).
const CABEZA = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: tuxmail:"><base target="_blank"><style>${ESTILO_IFRAME}</style>`

// HTML ya saneado y con las citas plegadas, por mensaje: volver a un correo no repite el trabajo.
const preparados = new Map<string, string>()
function preparar(id: string, html: string): string {
  const ya = preparados.get(id)
  if (ya !== undefined) {
    preparados.delete(id) // al final: el más reciente
    preparados.set(id, ya)
    return ya
  }
  const plegado = plegarCitasHtml(html)
  const doc = plegado.includes('<head>') ? plegado.replace('<head>', `<head>${CABEZA}`) : CABEZA + plegado
  preparados.set(id, doc)
  if (preparados.size > 100) preparados.delete(preparados.keys().next().value!)
  return doc
}

/**
 * HTML del correo en un iframe aislado: sin scripts (sandbox sin allow-scripts) y sin red.
 * allow-same-origin solo sirve para que la ventana mida la altura y abra las imágenes en el
 * visor; dentro no corre nada.
 */
/** Sobre qué se hizo clic derecho dentro de un correo. */
export interface InfoMenu {
  seleccion: string
  enlace?: string
  imagen?: string
}

function infoDe(destino: EventTarget | null, seleccion: string): InfoMenu {
  const el = destino instanceof Node ? (destino.nodeType === 1 ? (destino as Element) : destino.parentElement) : null
  const a = el?.closest('a[href]') as HTMLAnchorElement | null
  const img = el?.closest('img') as HTMLImageElement | null
  return { seleccion: seleccion.trim(), enlace: a?.getAttribute('href') ?? undefined, imagen: img ? img.currentSrc || img.src : undefined }
}

function HtmlAislado({
  doc,
  onImagen,
  onDoc,
  alDesplegar,
  onMenu,
}: {
  doc: string
  onImagen: (src: string, todas: string[]) => void
  onDoc?: (d: Document) => void // documento del correo ya cargado (para traducirlo en su sitio)
  alDesplegar?: (det: HTMLDetailsElement) => void
  onMenu?: (x: number, y: number, info: InfoMenu) => void
}) {
  const marco = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState(120)

  // El evento load espera a todas las imágenes: mientras tanto se mide en cada frame, para que el
  // texto se vea entero desde el primer momento (unos 3 s como mucho).
  useEffect(() => {
    let vivo = true
    const fin = performance.now() + 3000
    const paso = () => {
      if (!vivo) return
      // Al principio el iframe tiene un about:blank vacío: solo cuenta el documento del correo.
      const d = marco.current?.contentDocument
      const listo = d?.URL === 'about:srcdoc'
      if (listo && d.body && d.documentElement.scrollHeight > 0) {
        setAlto((a) => Math.max(a === 120 ? 60 : a, d.documentElement.scrollHeight))
      }
      if (performance.now() < fin && !(listo && d.readyState === 'complete')) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
    return () => {
      vivo = false
    }
  }, [doc])

  return (
    <iframe
      ref={marco}
      className="html-correo"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height: alto }}
      onLoad={() => {
        const d = marco.current?.contentDocument
        if (!d) return
        const medir = () => setAlto(Math.max(60, d.documentElement.scrollHeight))
        medir()
        new ResizeObserver(() => requestAnimationFrame(medir)).observe(d.body)
        // El ResizeObserver de otro documento no siempre avisa: al desplegar se mide también a mano.
        d.querySelectorAll('details').forEach((x) =>
          x.addEventListener('toggle', () => {
            medir()
            requestAnimationFrame(medir)
            if (x.open) alDesplegar?.(x)
          }),
        )
        Array.from(d.images).forEach((i) => i.complete || i.addEventListener('load', medir))
        const imagenes = Array.from(d.images).filter((i) => i.naturalWidth > 64 || i.width > 64)
        const srcs = imagenes.map((i) => i.currentSrc || i.src)
        imagenes.forEach((i) =>
          i.addEventListener('click', (e) => {
            if ((i.closest('a') as HTMLAnchorElement | null)?.href) return // si es un enlace, manda el enlace
            e.preventDefault()
            onImagen(i.currentSrc || i.src, srcs)
          }),
        )
        // Clic derecho dentro del correo: el menú de TuxMail, en coordenadas de la ventana.
        d.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          const r = marco.current?.getBoundingClientRect()
          onMenu?.((r?.left ?? 0) + e.clientX, (r?.top ?? 0) + e.clientY, infoDe(e.target, d.getSelection()?.toString() ?? ''))
        })
        onDoc?.(d)
      }}
    />
  )
}

function IconoAdjunto({ tipo, nombre }: { tipo: string; nombre: string }) {
  const ext = nombre.split('.').pop()?.toLowerCase() ?? ''
  if (tipo === 'application/pdf' || ext === 'pdf') return <FilePdf size={26} weight="light" />
  if (tipo.startsWith('image/')) return <FileImage size={26} weight="light" />
  if (/xlsx?|csv|ods/.test(ext)) return <FileXls size={26} weight="light" />
  if (/docx?|odt|rtf/.test(ext)) return <FileDoc size={26} weight="light" />
  return <FileIco size={26} weight="light" />
}

function Tarjeta(p: {
  m: Mensaje
  abierta: boolean
  unica: boolean
  nombreCuenta: string
  mio: boolean
  borrador: boolean
  onAlternar: () => void
  onVistaRapida: Props['onVistaRapida']
}) {
  const { m } = p
  const ui = useInterfaz()
  const { cuerpo, error } = useCuerpo(m.id, p.abierta)
  const adjuntos = cuerpo?.adjuntos.filter((a) => !a.inline) ?? []

  // ---- invitación de calendario que trae el correo (en su estado actual)
  const [invitacion, setInvitacion] = useState<Instancia | null>(null)
  useEffect(() => {
    if (!p.abierta || !cuerpo) return
    let vivo = true
    const cargar = () => api.invitacionDe(m.id).then((r) => vivo && setInvitacion(r), () => {})
    cargar()
    const quitar = window.niebla.alCalendario(cargar)
    return () => {
      vivo = false
      quitar()
    }
  }, [p.abierta, cuerpo, m.id])

  // ---- traducción inglés → español
  const [trad, setTrad] = useState<'original' | 'traduciendo' | 'traducido'>('original')
  const [fase, setFase] = useState('')
  const [fallo, setFallo] = useState<string | null>(null)
  const [usarGuardada, setUsarGuardada] = useState(false) // pintar la traducción guardada al montar
  const [vuelta, setVuelta] = useState(0) // cambia para volver a montar el iframe (Ver original)
  const docCorreo = useRef<Document | null>(null)
  const estadoTrad = useRef(trad)
  estadoTrad.current = trad
  const ingles = useMemo(
    () => !!cuerpo && esIngles(cuerpo.html ? textoDeHtml(cuerpo.html) : separarCita(cuerpo.texto ?? '').propio),
    [cuerpo],
  )
  const guardadaTexto = cuerpo?.traduccion?.startsWith('texto:') ? cuerpo.traduccion.slice(6) : null

  // Si ya se tradujo antes, se abre traducido directamente.
  useEffect(() => {
    if (cuerpo?.traduccion) {
      setUsarGuardada(true)
      setTrad('traducido')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuerpo])

  const srcDoc = useMemo(() => {
    if (!cuerpo?.html) return null
    if (usarGuardada && cuerpo.traduccion && !guardadaTexto) return cuerpo.traduccion
    return preparar(m.id, cuerpo.html)
    // `vuelta` fuerza un documento nuevo al volver al original (la traducción se hizo en su sitio).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuerpo, usarGuardada, vuelta])

  const texto = useMemo(() => {
    if (!cuerpo || cuerpo.html || !cuerpo.texto) return null
    return textoAHtml(trad === 'traducido' && guardadaTexto ? guardadaTexto : cuerpo.texto).html
  }, [cuerpo, trad, guardadaTexto])

  const guardarHtml = () => {
    const d = docCorreo.current
    if (!d || !cuerpo) return
    cuerpo.traduccion = '<!doctype html>' + d.documentElement.outerHTML
    api.guardarTraduccion(m.id, cuerpo.traduccion)
  }

  const traducir = async () => {
    if (!cuerpo || estadoTrad.current === 'traduciendo') return
    // Ya traducido antes: se vuelve a pintar la versión guardada, al momento.
    if (cuerpo.traduccion) {
      setUsarGuardada(true)
      setVuelta((v) => v + 1)
      return setTrad('traducido')
    }
    setFallo(null)
    setTrad('traduciendo')
    try {
      setFase((await api.traductorListo()) ? 'Traduciendo…' : 'Descargando el traductor (solo la primera vez, unos 37 MB)…')
      await iniciarTraductor()
      setFase('Traduciendo…')
      if (cuerpo.html) {
        const d = docCorreo.current
        if (!d) throw new Error('El correo aún no se ha cargado')
        await traducirArbol(d.body)
        guardarHtml()
      } else {
        const { propio, cita } = separarCita(cuerpo.texto ?? '')
        const t = await traducirTexto(propio)
        cuerpo.traduccion = 'texto:' + (cita.trim() ? `${t}\n\n${cita}` : t)
        api.guardarTraduccion(m.id, cuerpo.traduccion)
      }
      setTrad('traducido')
    } catch (e) {
      setTrad('original')
      setFallo((e as Error).message)
    }
  }

  const verOriginal = () => {
    setUsarGuardada(false)
    setVuelta((v) => v + 1)
    setTrad('original')
  }

  // Ctrl+Shift+T: traduce el correo abierto o vuelve al original.
  useEffect(() => {
    if (!p.abierta || !ingles) return
    const alternar = () => (estadoTrad.current === 'traducido' ? verOriginal() : traducir())
    window.addEventListener('tuxmail:traducir', alternar)
    return () => window.removeEventListener('tuxmail:traducir', alternar)
  })

  // Con «Traducir siempre», en cuanto el correo está pintado (o es de texto plano).
  useEffect(() => {
    if (ingles && cuerpo && !cuerpo.html && trad === 'original' && !cuerpo.traduccion && traducirSiempre()) traducir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingles, cuerpo])
  const alCargarDoc = (d: Document) => {
    docCorreo.current = d
    if (ingles && estadoTrad.current === 'original' && !cuerpo?.traduccion && traducirSiempre()) traducir()
  }
  // Una cita que se despliega con el correo traducido: se traduce también, y se guarda.
  const alDesplegar = (det: HTMLDetailsElement) => {
    if (estadoTrad.current !== 'traducido' || det.dataset.tmTraducido) return
    traducirArbol(det).then(guardarHtml, () => {})
  }
  const remitente = m.de.nombre || m.de.direccion

  const abrirAdjunto = (a: Adjunto) => {
    const lista = adjuntos.map((x) => ({ url: x.url, nombre: x.nombre, tipo: x.tipo, tamano: x.tamano }))
    p.onVistaRapida(lista, adjuntos.indexOf(a))
  }

  // ---- menús de clic derecho
  const intentar = (fn: () => Promise<unknown>, hecho?: string) =>
    fn().then(
      () => hecho && ui.avisar(hecho),
      (e: Error) => ui.avisar(`No se pudo: ${e.message}`),
    )

  const menuContenido = (x: number, y: number, info: InfoMenu) => {
    const el: ElementoMenu[] = []
    const sel = info.seleccion
    if (sel) {
      const corto = sel.length > 22 ? sel.slice(0, 22) + '…' : sel
      el.push(
        { etiqueta: 'Responder citando la selección', icono: <ArrowBendUpLeft size={15} />, accion: () => ui.redactar({ tipo: 'responder', id: m.id, cita: sel }) },
        { etiqueta: 'Copiar', icono: <Copy size={15} />, atajo: 'Ctrl C', accion: () => api.copiarTexto(sel) },
        { etiqueta: 'Traducir al español', icono: <Translate size={15} />, accion: () => ui.traducirSeleccion(x, y, sel) },
        '-',
        { etiqueta: 'Buscar en TuxMail', icono: <MagnifyingGlass size={15} />, accion: () => ui.buscar(sel) },
        { etiqueta: `Buscar «${corto}» en la web`, icono: <Globe size={15} />, accion: () => api.buscarWeb(sel) },
      )
    }
    if (info.enlace) {
      const mail = info.enlace.match(/^mailto:([^?]+)/i)
      if (el.length) el.push('-')
      if (mail) {
        const direccion = decodeURIComponent(mail[1])
        el.push(
          { etiqueta: `Nuevo correo a ${direccion}`, icono: <UserPlus size={15} />, accion: () => ui.redactar({ tipo: 'nuevo', para: [{ nombre: '', direccion }], cuenta: m.cuenta }) },
          { etiqueta: 'Copiar dirección', icono: <Copy size={15} />, accion: () => intentar(() => api.copiarTexto(direccion), 'Dirección copiada') },
        )
      } else {
        el.push(
          { etiqueta: 'Abrir enlace', icono: <ArrowSquareOut size={15} />, accion: () => api.abrirEnlace(info.enlace!) },
          { etiqueta: 'Copiar enlace', icono: <LinkSimple size={15} />, accion: () => intentar(() => api.copiarTexto(info.enlace!), 'Enlace copiado') },
        )
      }
    }
    if (info.imagen) {
      const url = info.imagen
      if (el.length) el.push('-')
      el.push(
        { etiqueta: 'Vista rápida', icono: <Eye size={15} />, accion: () => p.onVistaRapida([{ url, nombre: 'Imagen', tipo: 'image/*' }], 0) },
        { etiqueta: 'Copiar imagen', icono: <Copy size={15} />, accion: () => intentar(() => api.copiarImagen(url), 'Imagen copiada') },
        { etiqueta: 'Guardar imagen como…', icono: <DownloadSimple size={15} />, accion: () => intentar(() => api.guardarComo(url)) },
      )
    }
    if (!el.length) {
      el.push(
        { etiqueta: 'Responder', icono: <ArrowBendUpLeft size={15} />, atajo: 'Ctrl R', accion: () => ui.redactar({ tipo: 'responder', id: m.id }) },
        { etiqueta: 'Responder a todos', icono: <ArrowBendDoubleUpLeft size={15} />, atajo: 'Ctrl ⇧ R', accion: () => ui.redactar({ tipo: 'responderTodos', id: m.id }) },
        { etiqueta: 'Reenviar', icono: <ArrowBendUpRight size={15} />, atajo: 'Ctrl ⇧ F', accion: () => ui.redactar({ tipo: 'reenviar', id: m.id }) },
      )
      if (ingles) {
        el.push('-', trad === 'traducido'
          ? { etiqueta: 'Ver original', icono: <Translate size={15} />, atajo: 'Ctrl ⇧ T', accion: verOriginal }
          : { etiqueta: 'Traducir al español', icono: <Translate size={15} />, atajo: 'Ctrl ⇧ T', accion: traducir })
      }
    }
    ui.abrirMenu({ x, y, elementos: el })
  }

  const menuAdjunto = (a: Adjunto, x: number, y: number) =>
    ui.abrirMenu({
      x,
      y,
      elementos: [
        { etiqueta: 'Vista rápida', icono: <Eye size={15} />, atajo: 'Espacio', accion: () => abrirAdjunto(a) },
        { etiqueta: 'Copiar', icono: <Copy size={15} />, atajo: 'Ctrl C', accion: () => intentar(() => api.copiarArchivo(a.url, a.nombre), `«${a.nombre}» copiado`) },
        '-',
        { etiqueta: 'Guardar como…', icono: <DownloadSimple size={15} />, accion: () => intentar(() => api.guardarComo(a.url, a.nombre)) },
        { etiqueta: 'Abrir con la app predeterminada', icono: <ArrowSquareOut size={15} />, accion: () => intentar(() => api.abrirArchivo(a.url, a.nombre)) },
      ],
    })

  const menuPersona = (d: Direccion, x: number, y: number) =>
    ui.abrirMenu({
      x,
      y,
      elementos: [
        { etiqueta: 'Nuevo correo a esta persona', icono: <UserPlus size={15} />, accion: () => ui.redactar({ tipo: 'nuevo', para: [d], cuenta: m.cuenta }) },
        { etiqueta: 'Copiar dirección', icono: <Copy size={15} />, accion: () => intentar(() => api.copiarTexto(d.direccion), 'Dirección copiada') },
        { etiqueta: 'Ver todos sus correos', icono: <MagnifyingGlass size={15} />, accion: () => ui.buscar(d.direccion) },
        '-',
        {
          etiqueta: 'Mandar a spam todo lo de este remitente',
          icono: <Prohibit size={15} />,
          peligro: true,
          desactivado: p.mio,
          accion: () =>
            intentar(async () => {
              const n = await api.remitenteASpam(m.cuenta, d.direccion)
              ui.avisar(n ? `${n} ${n === 1 ? 'correo movido' : 'correos movidos'} a spam · Ctrl+Z para deshacer` : 'No había nada suyo fuera de spam')
            }),
        },
      ],
    })

  const persona = (d: Direccion, texto: string) => (
    <span
      key={d.direccion + texto}
      className="direccion"
      title={d.direccion}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        menuPersona(d, e.clientX, e.clientY)
      }}
    >
      {texto}
    </span>
  )

  return (
    <article className={`tarjeta${p.abierta ? ' abierta' : ''}${p.unica ? ' unica' : ''}${p.mio ? ' mia' : ''}`}>
      <header className="cabecera" onClick={p.unica ? undefined : p.onAlternar}>
        <div className="avatar">{iniciales(remitente)}</div>
        <div className="cabecera-datos">
          <div className="cabecera-linea">
            <span className="cabecera-de">{persona(m.de, p.mio ? `${remitente} (tú)` : remitente)}</span>
            <span className="cabecera-fecha">{p.abierta ? fechaLarga(m.fecha) : fechaLista(m.fecha)}</span>
          </div>
          {p.abierta ? (
            <div className="cabecera-para">
              Para:{' '}
              <span>
                {[...m.para, ...m.cc].map((d, i, todos) => (
                  <span key={d.direccion + i}>
                    {persona(d, d.nombre || d.direccion)}
                    {i < todos.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </span>
              <span className="cabecera-cuenta">{p.nombreCuenta}</span>
            </div>
          ) : (
            <div className="cabecera-resumen">
              {m.adjuntos > 0 && <Paperclip size={12} />} {m.vistaPrevia}
            </div>
          )}
        </div>
      </header>

      {p.abierta && (
        <div className="tarjeta-cuerpo">
          {error && <div className="aviso-error">No se pudo cargar el mensaje: {error}</div>}
          {!cuerpo && !error && <div className="cargando">Cargando…</div>}

          {invitacion && <TarjetaEvento e={invitacion} compacta />}

          {p.borrador && (
            <div className="aviso-barra">
              <PencilSimple size={16} />
              <span>Borrador sin enviar</span>
              <button onClick={() => ui.redactar({ tipo: 'borrador', id: m.id })}>Editar y enviar</button>
            </div>
          )}

          {ingles && cuerpo && (
            <div className={`aviso-barra traducir${trad === 'traduciendo' ? ' ocupado' : ''}`}>
              <Translate size={16} />
              <span>
                {fallo
                  ? `No se pudo traducir: ${fallo}`
                  : trad === 'traducido'
                    ? 'Traducido del inglés'
                    : trad === 'traduciendo'
                      ? fase
                      : 'Este correo está en inglés'}
              </span>
              {trad === 'original' && <button onClick={traducir}>Traducir</button>}
              {trad === 'traducido' && <button onClick={verOriginal}>Ver original</button>}
            </div>
          )}

          {adjuntos.length > 0 && (
            <div className="adjuntos">
              {adjuntos.map((a) => (
                <button
                  className="adjunto"
                  key={a.url || a.nombre}
                  title={`${a.nombre} — abrir vista rápida`}
                  onClick={() => abrirAdjunto(a)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    menuAdjunto(a, e.clientX, e.clientY)
                  }}
                >
                  <IconoAdjunto tipo={a.tipo} nombre={a.nombre} />
                  <div>
                    <div className="adjunto-nombre">{a.nombre}</div>
                    <div className="adjunto-tam">{tamano(a.tamano)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {cuerpo?.html && srcDoc ? (
            <div className="papel">
              <HtmlAislado
                key={vuelta}
                doc={srcDoc}
                onDoc={alCargarDoc}
                alDesplegar={alDesplegar}
                onMenu={menuContenido}
                onImagen={(src, todas) =>
                  p.onVistaRapida(
                    todas.map((u, i) => ({ url: u, nombre: `Imagen ${i + 1}`, tipo: 'image/*' })),
                    Math.max(0, todas.indexOf(src)),
                  )
                }
              />
            </div>
          ) : texto !== null ? (
            <div
              className="texto"
              dangerouslySetInnerHTML={{ __html: texto }}
              onContextMenu={(e) => {
                e.preventDefault()
                menuContenido(e.clientX, e.clientY, infoDe(e.target, window.getSelection()?.toString() ?? ''))
              }}
            />
          ) : null}
        </div>
      )}
    </article>
  )
}

export function Reader({ hilo, seleccionado, nombreCuenta, esMio, onVolver, onVistaRapida, esBorrador }: Props) {
  // Más reciente arriba, como Mail. Abiertos: el seleccionado, el último y los no leídos.
  const orden = useMemo(() => [...hilo].reverse(), [hilo])
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const clave = hilo.map((m) => m.id).join('|')

  useEffect(() => {
    const ini = new Set<string>()
    if (orden[0]) ini.add(orden[0].id)
    if (seleccionado) ini.add(seleccionado)
    orden.forEach((m) => !m.leido && ini.add(m.id))
    setAbiertas(ini)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden[0]?.id, seleccionado])

  if (!hilo.length) {
    return (
      <section className="lector vacio">
        <Envelope size={54} weight="thin" />
        <div>Ningún mensaje seleccionado</div>
        {onVolver && (
          <button className="volver" onClick={onVolver}>
            <ArrowLeft size={14} /> Volver a la lista
          </button>
        )}
      </section>
    )
  }

  const asunto = (orden.at(-1)?.asunto || orden[0].asunto || '(Sin asunto)').replace(/^((re|rv|fw|fwd|reenviado)\s*:\s*)+/i, '')

  return (
    <section className="lector" key={clave}>
      <div className="lector-scroll">
        {onVolver && (
          <button className="volver" onClick={onVolver}>
            <ArrowLeft size={14} /> Volver a la lista
          </button>
        )}
        <h1 className="conv-asunto">
          {asunto}
          {hilo.length > 1 && <span className="conv-cuenta">{hilo.length} mensajes</span>}
        </h1>
        {orden.map((m) => (
          <Tarjeta
            key={m.id}
            m={m}
            unica={orden.length === 1}
            abierta={orden.length === 1 || abiertas.has(m.id)}
            nombreCuenta={nombreCuenta(m.cuenta)}
            mio={esMio(m.de.direccion)}
            onAlternar={() =>
              setAbiertas((s) => {
                const n = new Set(s)
                if (n.has(m.id)) n.delete(m.id)
                else n.add(m.id)
                return n
              })
            }
            onVistaRapida={onVistaRapida}
            borrador={esBorrador(m)}
          />
        ))}
      </div>
    </section>
  )
}

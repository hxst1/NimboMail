import { useCallback, useEffect, useRef, useState, type KeyboardEvent as KE } from 'react'
import DOMPurify from 'dompurify'
import {
  LinkSimple, ListBullets, ListNumbers, PaperPlaneTilt, Paperclip, TextB, TextItalic, TextUnderline, Trash, X,
} from '@phosphor-icons/react'
import type { AdjuntoBorrador, Borrador, Cuenta, Direccion } from '@shared/tipos'
import { api } from '@/estado'
import { tamano } from '@/formato'
import type { OpcionesRedactar } from '@/components/MenuContextual'
import { Desplegable } from '@/components/Desplegable'

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const textoAHtmlSimple = (t: string) => escapar(t).replace(/\r?\n/g, '<br>')

// HTML ajeno (el original citado, lo pegado de una web) sin nada que pueda ejecutar ni estilos globales.
const limpiar = (html: string) =>
  DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'meta', 'link', 'title', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|cid|nimbomail):|data:image\/|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })

const ESTILO_CITA = 'margin:0 0 0 0.8ex;border-left:2px solid #c3c8ce;padding-left:1ex;color:#50555b'

/** «Nombre <dir>», «dir» o varias separadas por comas o punto y coma. */
function analizar(texto: string): Direccion[] {
  return texto
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/)
      return m ? { nombre: m[1].trim(), direccion: m[2].trim() } : { nombre: '', direccion: t }
    })
    .filter((d) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.direccion))
}

function CampoDirecciones({
  etiqueta,
  valor,
  onCambiar,
  autoFocus,
  extra,
}: {
  etiqueta: string
  valor: Direccion[]
  onCambiar: (v: Direccion[]) => void
  autoFocus?: boolean
  extra?: React.ReactNode
}) {
  const [texto, setTexto] = useState('')
  const [sugerencias, setSugerencias] = useState<Direccion[]>([])
  const [activa, setActiva] = useState(0)

  useEffect(() => {
    if (texto.trim().length < 2) return setSugerencias([])
    const t = setTimeout(async () => {
      const r = await api.contactos(texto.trim())
      setSugerencias(r.filter((d) => !valor.some((v) => v.direccion.toLowerCase() === d.direccion.toLowerCase())))
      setActiva(0)
    }, 80)
    return () => clearTimeout(t)
  }, [texto, valor])

  const anadir = (l: Direccion[]) => {
    if (!l.length) return
    onCambiar([...valor, ...l.filter((d) => !valor.some((v) => v.direccion.toLowerCase() === d.direccion.toLowerCase()))])
    setTexto('')
    setSugerencias([])
  }

  const tecla = (e: KE<HTMLInputElement>) => {
    if (sugerencias.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setActiva((a) => (a + (e.key === 'ArrowDown' ? 1 : sugerencias.length - 1)) % sugerencias.length)
    } else if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ';') {
      if (sugerencias[activa]) {
        e.preventDefault()
        anadir([sugerencias[activa]])
      } else if (texto.trim()) {
        const l = analizar(texto)
        if (l.length) {
          e.preventDefault()
          anadir(l)
        }
      }
    } else if (e.key === 'Backspace' && !texto && valor.length) {
      onCambiar(valor.slice(0, -1))
    }
  }

  return (
    <div className="campo">
      <label>{etiqueta}</label>
      <div className="fichas">
        {valor.map((d) => (
          <span key={d.direccion} className="ficha" title={d.direccion}>
            {d.nombre || d.direccion}
            <button onClick={() => onCambiar(valor.filter((x) => x !== d))} aria-label="Quitar">
              <X size={10} weight="bold" />
            </button>
          </span>
        ))}
        <input
          value={texto}
          autoFocus={autoFocus}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={tecla}
          onBlur={() => setTimeout(() => (texto.trim() ? anadir(analizar(texto)) : setSugerencias([])), 120)}
          onPaste={(e) => {
            const l = analizar(e.clipboardData.getData('text'))
            if (l.length > 1) {
              e.preventDefault()
              anadir(l)
            }
          }}
        />
      </div>
      {extra}
      {sugerencias.length > 0 && (
        <div className="sugerencias">
          {sugerencias.map((d, i) => (
            <div key={d.direccion} className={`sugerencia${i === activa ? ' activa' : ''}`} onMouseDown={() => anadir([d])}>
              <span>{d.nombre || d.direccion}</span>
              {d.nombre && <span className="sugerencia-dir">{d.direccion}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Redactar({
  opciones,
  cuentas,
  onCerrar,
  avisar,
}: {
  opciones: OpcionesRedactar
  cuentas: Cuenta[]
  onCerrar: () => void
  avisar: (t: string) => void
}) {
  const [b, setB] = useState<Borrador | null>(null)
  const [verCco, setVerCco] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sinAsunto, setSinAsunto] = useState(false)
  const [estadoGuardado, setEstadoGuardado] = useState('')
  const [enlace, setEnlace] = useState<{ url: string; rango: Range | null } | null>(null)
  const editor = useRef<HTMLDivElement>(null)
  const sucio = useRef(false)
  const guardando = useRef<Promise<void> | null>(null)
  const actual = useRef<Borrador | null>(null)
  actual.current = b

  // Estado inicial según lo que se pidió: nuevo, responder, reenviar o abrir un borrador.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const cuenta = ('cuenta' in opciones && opciones.cuenta) || cuentas[0]?.id || ''
      let inicial: Borrador
      let cuerpoHtml = '<p><br></p>'
      if (opciones.tipo === 'nuevo') {
        inicial = { cuenta, para: opciones.para ?? [], cc: [], cco: [], asunto: opciones.asunto ?? '', html: '', adjuntos: [] }
        if (opciones.cuerpo) cuerpoHtml = `<p>${textoAHtmlSimple(opciones.cuerpo)}</p>`
      } else if (opciones.tipo === 'borrador') {
        inicial = await api.abrirBorrador(opciones.id)
        cuerpoHtml = limpiar(inicial.html) || '<p><br></p>'
      } else {
        const r = await api.prepararRespuesta(opciones.id, opciones.tipo)
        const original = await api.cuerpo(opciones.id).catch(() => null)
        const citado =
          opciones.tipo !== 'reenviar' && opciones.cita
            ? textoAHtmlSimple(opciones.cita)
            : original?.html
              ? limpiar(original.html)
              : textoAHtmlSimple(original?.texto ?? '')
        cuerpoHtml =
          opciones.tipo === 'reenviar'
            ? `<p><br></p><p><br></p><div><p style="color:#50555b">${textoAHtmlSimple(r.cabeceraCita)}</p>${citado}</div>`
            : `<p><br></p><p><br></p><p style="color:#50555b">${escapar(r.cabeceraCita)}</p><blockquote type="cite" style="${ESTILO_CITA}">${citado}</blockquote>`
        inicial = {
          cuenta: r.cuenta,
          para: r.para,
          cc: r.cc,
          cco: [],
          asunto: r.asunto,
          html: '',
          enRespuestaA: r.enRespuestaA,
          referencias: r.referencias,
          respondeA: opciones.tipo === 'reenviar' ? null : r.respondeA,
          adjuntos: opciones.tipo === 'reenviar' ? r.adjuntos.map((a) => ({ nombre: a.nombre, tamano: a.tamano, tipo: a.tipo, url: a.url })) : [],
        }
      }
      if (!vivo) return
      if (inicial.cc.length) setVerCco(true)
      setB(inicial)
      requestAnimationFrame(() => {
        if (!editor.current) return
        editor.current.innerHTML = cuerpoHtml
        // En una respuesta se escribe arriba, como en Mail; en uno nuevo con destinatario, también.
        if (opciones.tipo !== 'nuevo' || inicial.para.length) {
          editor.current.focus()
          const r = document.createRange()
          r.setStart(editor.current, 0)
          r.collapse(true)
          getSelection()?.removeAllRanges()
          getSelection()?.addRange(r)
        }
      })
    })().catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const conCuerpo = useCallback((): Borrador | null => {
    const x = actual.current
    if (!x) return null
    return { ...x, html: editor.current?.innerHTML ?? x.html }
  }, [])

  const cambiar = (c: Partial<Borrador>) => {
    sucio.current = true
    setB((x) => (x ? { ...x, ...c } : x))
  }

  // ---- borradores: se guardan solos a los 5 s de dejar de escribir
  const guardar = useCallback(async () => {
    if (guardando.current) await guardando.current
    const x = conCuerpo()
    if (!x || !sucio.current) return
    sucio.current = false
    setEstadoGuardado('Guardando…')
    guardando.current = api
      .guardarBorrador(x)
      .then((id) => {
        if (actual.current) actual.current.borradorId = id
        setB((y) => (y ? { ...y, borradorId: id } : y))
        setEstadoGuardado('Guardado en Borradores')
      })
      .catch(() => {
        sucio.current = true
        setEstadoGuardado('No se pudo guardar el borrador')
      })
      .finally(() => (guardando.current = null))
    await guardando.current
  }, [conCuerpo])

  const tocar = () => {
    sucio.current = true
    setEstadoGuardado('')
  }
  useEffect(() => {
    if (!b) return
    const t = setInterval(() => sucio.current && guardar(), 5000)
    return () => clearInterval(t)
  }, [b === null, guardar]) // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = async () => {
    const vacio = !b || (!b.para.length && !b.asunto && !(editor.current?.innerText.trim() ?? '') && !b.adjuntos.length)
    if (!vacio && sucio.current) {
      await guardar()
      avisar('Guardado en Borradores')
    }
    onCerrar()
  }

  const descartar = async () => {
    const id = actual.current?.borradorId
    sucio.current = false
    if (guardando.current) await guardando.current
    const final = actual.current?.borradorId ?? id
    if (final) api.descartarBorrador(final).catch(() => {})
    onCerrar()
  }

  const enviar = async () => {
    const x = conCuerpo()
    if (!x || enviando) return
    if (!x.para.length && !x.cc.length && !x.cco.length) return setError('Falta al menos un destinatario')
    if (!x.asunto.trim() && !sinAsunto) return setSinAsunto(true)
    setError(null)
    setEnviando(true)
    sucio.current = false
    try {
      if (guardando.current) await guardando.current
      await api.enviar({ ...x, borradorId: actual.current?.borradorId ?? x.borradorId })
      avisar('Mensaje enviado')
      onCerrar()
    } catch (e) {
      setError(`No se pudo enviar: ${(e as Error).message}`)
      setEnviando(false)
    }
  }

  // ---- adjuntos: botón, pegar (archivos, imágenes, archivos copiados en Nautilus o en NimboMail) y arrastrar
  const anadirAdjuntos = (l: AdjuntoBorrador[]) => {
    if (!l.length) return
    tocar()
    setB((x) => (x ? { ...x, adjuntos: [...x.adjuntos, ...l] } : x))
  }
  const deArchivos = async (archivos: File[]) => {
    const out: AdjuntoBorrador[] = []
    for (const f of archivos) {
      const ruta = window.niebla.rutaDeArchivo(f)
      out.push(ruta ? { nombre: f.name, tamano: f.size, tipo: f.type, ruta } : { nombre: f.name || 'archivo', tamano: f.size, tipo: f.type, datos: new Uint8Array(await f.arrayBuffer()) })
    }
    return out
  }
  const insertarImagen = (f: File) =>
    new Promise<void>((ok) => {
      const r = new FileReader()
      r.onload = () => {
        document.execCommand('insertHTML', false, `<img src="${r.result}" style="max-width:100%">`)
        ok()
      }
      r.readAsDataURL(f)
    })

  const pegar = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const cd = e.clipboardData
    const uris = cd.getData('text/uri-list')
    const archivos = Array.from(cd.files)
    if (uris && /^file:/m.test(uris)) {
      e.preventDefault()
      return anadirAdjuntos(await api.archivosDeUris(uris.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))))
    }
    if (archivos.length) {
      e.preventDefault()
      // Una imagen copiada (captura, «Copiar imagen») va dentro del texto; el resto, como adjunto.
      const imagenes = archivos.filter((f) => f.type.startsWith('image/'))
      for (const f of imagenes) await insertarImagen(f)
      anadirAdjuntos(await deArchivos(archivos.filter((f) => !imagenes.includes(f))))
      return
    }
    const html = cd.getData('text/html')
    if (html) {
      e.preventDefault()
      document.execCommand('insertHTML', false, limpiar(html))
    }
  }

  const formato = (orden: string, valor?: string) => {
    editor.current?.focus()
    document.execCommand(orden, false, valor)
    tocar()
  }

  const titulo =
    opciones.tipo === 'nuevo' ? 'Mensaje nuevo' : opciones.tipo === 'borrador' ? 'Borrador' : b?.asunto || 'Respuesta'

  return (
    <div className="redactar-fondo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div
        className="redactar"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            cerrar()
          }
          if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault()
            enviar()
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          anadirAdjuntos(await deArchivos(Array.from(e.dataTransfer.files)))
        }}
      >
        <header className="redactar-cabeza">
          <span className="redactar-titulo">{titulo}</span>
          <span className="redactar-estado">{estadoGuardado}</span>
          <button className="icono" title="Descartar" onClick={descartar}>
            <Trash size={16} />
          </button>
          <button className="icono" title="Cerrar (se guarda en Borradores)" onClick={cerrar}>
            <X size={16} />
          </button>
          <button className="enviar" onClick={enviar} disabled={enviando || !b}>
            <PaperPlaneTilt size={15} weight="fill" /> {enviando ? 'Enviando…' : sinAsunto ? 'Enviar sin asunto' : 'Enviar'}
          </button>
        </header>

        {b && (
          <>
            {cuentas.length > 1 && (
              <div className="campo">
                <label>De</label>
                <Desplegable<string>
                  valor={b.cuenta}
                  onCambiar={(cuenta) => cambiar({ cuenta })}
                  clase="ancho"
                  opciones={cuentas.map((c) => ({ valor: c.id, texto: `${c.remitente} <${c.direccion}>` }))}
                />
              </div>
            )}
            <CampoDirecciones
              etiqueta="Para"
              valor={b.para}
              onCambiar={(para) => cambiar({ para })}
              autoFocus={!b.para.length}
              extra={
                !verCco && (
                  <button className="campo-extra" onClick={() => setVerCco(true)}>
                    Cc/Cco
                  </button>
                )
              }
            />
            {verCco && (
              <>
                <CampoDirecciones etiqueta="Cc" valor={b.cc} onCambiar={(cc) => cambiar({ cc })} />
                <CampoDirecciones etiqueta="Cco" valor={b.cco} onCambiar={(cco) => cambiar({ cco })} />
              </>
            )}
            <div className="campo">
              <label>Asunto</label>
              <input
                className="asunto"
                value={b.asunto}
                onChange={(e) => {
                  setSinAsunto(false)
                  cambiar({ asunto: e.target.value })
                }}
              />
            </div>
            <div className="redactar-formato">
              <button title="Negrita (Ctrl+B)" onMouseDown={(e) => (e.preventDefault(), formato('bold'))}>
                <TextB size={15} weight="bold" />
              </button>
              <button title="Cursiva (Ctrl+I)" onMouseDown={(e) => (e.preventDefault(), formato('italic'))}>
                <TextItalic size={15} />
              </button>
              <button title="Subrayado (Ctrl+U)" onMouseDown={(e) => (e.preventDefault(), formato('underline'))}>
                <TextUnderline size={15} />
              </button>
              <span className="sep" />
              <button title="Lista" onMouseDown={(e) => (e.preventDefault(), formato('insertUnorderedList'))}>
                <ListBullets size={15} />
              </button>
              <button title="Lista numerada" onMouseDown={(e) => (e.preventDefault(), formato('insertOrderedList'))}>
                <ListNumbers size={15} />
              </button>
              <button
                title="Enlace"
                onMouseDown={(e) => {
                  e.preventDefault()
                  // Se recuerda la selección: al escribir la dirección el foco sale del editor.
                  const sel = getSelection()
                  const rango = sel?.rangeCount && editor.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null
                  setEnlace({ url: '', rango })
                }}
              >
                <LinkSimple size={15} />
              </button>
              {enlace && (
                <input
                  className="enlace"
                  autoFocus
                  placeholder="https://… y Intro"
                  value={enlace.url}
                  onChange={(e) => setEnlace({ ...enlace, url: e.target.value })}
                  onBlur={() => setEnlace(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      return setEnlace(null)
                    }
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const url = enlace.url.trim()
                    const destino = /^[a-z]+:/i.test(url) ? url : `https://${url}`
                    editor.current?.focus()
                    if (enlace.rango) {
                      getSelection()?.removeAllRanges()
                      getSelection()?.addRange(enlace.rango)
                    }
                    if (url) {
                      if (enlace.rango && !enlace.rango.collapsed) formato('createLink', destino)
                      else formato('insertHTML', `<a href="${escapar(destino)}">${escapar(url)}</a>`)
                    }
                    setEnlace(null)
                  }}
                />
              )}
              <span className="sep" />
              <button title="Adjuntar archivos" onClick={async () => anadirAdjuntos(await api.elegirArchivos())}>
                <Paperclip size={15} />
              </button>
            </div>
          </>
        )}

        {error && <div className="redactar-error">{error}</div>}

        <div className="redactar-papel">
          <div
            ref={editor}
            className="redactar-editor"
            contentEditable={!!b}
            suppressContentEditableWarning
            onInput={tocar}
            onPaste={pegar}
          />
          {!b && !error && <div className="cargando">Preparando…</div>}
        </div>

        {b && b.adjuntos.length > 0 && (
          <div className="redactar-adjuntos">
            {b.adjuntos.map((a, i) => (
              <span key={i} className="ficha adjunta" title={a.ruta ?? a.nombre}>
                <Paperclip size={12} /> {a.nombre} <span className="tam">{tamano(a.tamano)}</span>
                <button onClick={() => (tocar(), setB((x) => (x ? { ...x, adjuntos: x.adjuntos.filter((_, j) => j !== i) } : x)))}>
                  <X size={10} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

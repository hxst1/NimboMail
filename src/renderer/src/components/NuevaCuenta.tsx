import { useEffect, useState } from 'react'
import { ArrowSquareOut, CaretDown, CaretRight, EnvelopeSimple, ShieldCheck, X } from '@phosphor-icons/react'
import type { Cuenta } from '@shared/tipos'
import { api } from '@/estado'

type Deteccion = Awaited<ReturnType<typeof api.detectarCuenta>>
type Servidores = NonNullable<Deteccion['servidores']>
type Prueba = Awaited<ReturnType<typeof api.probarCuenta>>

const VACIOS: Servidores = { imap: '', puerto: 993, smtp: '', smtpPuerto: 465, usuario: '' }

const NOMBRES_PROVEEDOR: Record<string, string> = {
  google: 'Google', microsoft: 'Microsoft', icloud: 'iCloud', yahoo: 'Yahoo', fastmail: 'Fastmail', proton: 'Proton', otro: '',
}

/** Cómo conseguir la contraseña (de aplicación) en cada proveedor, con sus enlaces. */
function Ayuda({ ayuda }: { ayuda: NonNullable<Deteccion['ayuda']> }) {
  return (
    <div className="nc-ayuda">
      {ayuda.texto}
      {!!ayuda.enlaces?.length && (
        <div className="nc-enlaces">
          {ayuda.enlaces.map((e) => (
            <button key={e.url} type="button" onClick={() => api.abrirEnlace(e.url)}>
              {e.etiqueta} <ArrowSquareOut size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Explica un fallo de conexión en cristiano. */
function explicar(r: Extract<Prueba, { ok: false }>, d: Deteccion | null): string {
  const lado = r.donde === 'imap' ? 'recibir (IMAP)' : 'enviar (SMTP)'
  if (r.motivo === 'clave') {
    return d?.proveedor === 'google'
      ? 'Google no aceptó la contraseña. Gmail necesita una contraseña de aplicación, no la de siempre.'
      : `El servidor para ${lado} no aceptó el usuario o la contraseña.`
  }
  if (r.motivo === 'certificado') return `El certificado del servidor para ${lado} no coincide con su nombre.`
  return `No se pudo conectar con el servidor para ${lado}: ${r.detalle}`
}

/**
 * Añadir una cuenta (o poner la contraseña de una que ya existe). Detecta los servidores a partir
 * de la dirección; para Outlook entra con Microsoft y para el resto pide la contraseña.
 */
export function NuevaCuenta({
  existente: existenteInicial,
  cuentas,
  bienvenida,
  onCerrar,
  avisar,
}: {
  existente?: Cuenta // si viene, solo se cambia la contraseña de esa cuenta
  cuentas: Cuenta[]
  bienvenida?: boolean // primera vez: sin cuentas todavía
  onCerrar: () => void
  avisar: (t: string) => void
}) {
  // Si escriben una dirección que ya está en TuxMail, se pasa a pedir su contraseña.
  const [existente, setExistente] = useState<Cuenta | undefined>(existenteInicial)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState(existente?.direccion ?? '')
  const [etiqueta, setEtiqueta] = useState('')
  const [deteccion, setDeteccion] = useState<Deteccion | null>(null)
  const [servidores, setServidores] = useState<Servidores>(VACIOS)
  const [verServidores, setVerServidores] = useState(false)
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [fallo, setFallo] = useState<{ texto: string; certificado?: string; soloEnvio?: boolean } | null>(null)
  const [conectadoOAuth, setConectadoOAuth] = useState(false)
  const [ayudaClave, setAyudaClave] = useState<Deteccion['ayuda']>()
  const [proveedorClave, setProveedorClave] = useState<Deteccion['proveedor']>()
  // Google enseña la contraseña de aplicación en grupos de 4 con espacios: fuera.
  const esGoogle = (deteccion?.proveedor ?? proveedorClave) === 'google'
  const claveFinal = esGoogle ? clave.replace(/\s+/g, '') : clave

  // Poniendo la contraseña de una cuenta que ya existe: de dónde sacarla (contraseña de aplicación…).
  useEffect(() => {
    if (!existente) return
    let vivo = true
    api.detectarCuenta(existente.direccion).then(
      (d) => {
        if (!vivo) return
        setAyudaClave(d.ayuda)
        setProveedorClave(d.proveedor)
      },
      () => {},
    )
    return () => {
      vivo = false
    }
  }, [existente])

  const paso = existente ? 'clave' : deteccion ? 'credenciales' : 'correo'

  const detectar = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setFallo({ texto: 'Escribe una dirección de correo válida' })
    setFallo(null)
    const ya = cuentas.find((c) => c.direccion.toLowerCase() === email.trim().toLowerCase())
    if (ya) return setExistente(ya)
    setOcupado('Buscando la configuración de tu correo…')
    try {
      const d = await api.detectarCuenta(email.trim())
      setDeteccion(d)
      setEtiqueta(d.etiqueta)
      setServidores(d.servidores ?? { ...VACIOS, usuario: email.trim().toLowerCase() })
      setVerServidores(!d.servidores)
    } catch (e) {
      setFallo({ texto: (e as Error).message })
    } finally {
      setOcupado(null)
    }
  }

  const anadir = async (auth: Cuenta['auth']) => {
    setOcupado('Añadiendo la cuenta…')
    await api.anadirCuenta({
      nombre: nombre.trim() || email.split('@')[0],
      etiqueta: etiqueta.trim() || email,
      direccion: email.trim(),
      servidores,
      auth,
      clave: auth === 'clave' ? claveFinal : undefined,
    })
    avisar(`Cuenta añadida: ${etiqueta || email}. Descargando el correo…`)
    onCerrar()
  }

  const tratar = (r: Prueba) => {
    if (r.ok) return true
    setFallo({ texto: explicar(r, deteccion), certificado: r.motivo === 'certificado' ? r.certificado : undefined, soloEnvio: r.donde === 'smtp' })
    if (r.motivo === 'conexion') setVerServidores(true)
    return false
  }

  const probarYAnadir = async (forzar = false) => {
    setFallo(null)
    try {
      if (existente) {
        if (!clave) return setFallo({ texto: 'Escribe la contraseña' })
        setOcupado('Comprobando…')
        const r = await api.cambiarClave(existente.id, claveFinal)
        if (tratar(r) || forzar || (!r.ok && r.motivo !== 'clave')) {
          avisar(`Contraseña guardada para ${existente.nombre}`)
          onCerrar()
        }
        return
      }
      if (!servidores.imap || !servidores.smtp) return setFallo({ texto: 'Faltan los servidores de correo' })
      if (deteccion?.auth !== 'clave' && conectadoOAuth) return anadir(deteccion!.auth)
      if (!clave) return setFallo({ texto: 'Escribe la contraseña' })
      setOcupado('Probando la conexión…')
      const r = forzar ? ({ ok: true } as const) : await api.probarCuenta(servidores, claveFinal)
      if (tratar(r)) await anadir('clave')
    } catch (e) {
      setFallo({ texto: (e as Error).message })
    } finally {
      setOcupado(null)
    }
  }

  const entrarOAuth = async () => {
    if (!deteccion || deteccion.auth === 'clave') return
    setFallo(null)
    setOcupado('Inicia sesión en el navegador que se ha abierto…')
    try {
      const r = await api.entrarConOAuth(deteccion.auth, email.trim(), servidores)
      setConectadoOAuth(true)
      if (tratar(r)) await anadir(deteccion.auth)
    } catch (e) {
      setFallo({ texto: (e as Error).message })
    } finally {
      setOcupado(null)
    }
  }

  const campoServidor = (k: keyof Servidores, etiquetaCampo: string, numero = false) => (
    <label className="nc-servidor">
      <span>{etiquetaCampo}</span>
      <input
        value={String(servidores[k] ?? '')}
        inputMode={numero ? 'numeric' : undefined}
        onChange={(e) => setServidores({ ...servidores, [k]: numero ? Number(e.target.value.replace(/\D/g, '')) || 0 : e.target.value.trim() })}
      />
    </label>
  )

  const usaOAuth = !!deteccion && deteccion.auth !== 'clave'

  return (
    <div className="redactar-fondo" onMouseDown={(e) => e.target === e.currentTarget && !bienvenida && onCerrar()}>
      <form
        className="nueva-cuenta"
        onSubmit={(e) => {
          e.preventDefault()
          if (ocupado) return
          if (paso === 'correo') detectar()
          else if (!usaOAuth) probarYAnadir()
        }}
        onKeyDown={(e) => e.key === 'Escape' && !bienvenida && onCerrar()}
      >
        {!bienvenida && (
          <button type="button" className="nc-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={15} />
          </button>
        )}
        <div className="nc-icono">
          <EnvelopeSimple size={30} weight="light" />
        </div>
        <h2>{existente ? `Contraseña de ${existente.nombre}` : bienvenida ? 'Te damos la bienvenida a TuxMail' : 'Añadir una cuenta'}</h2>
        <p className="nc-sub">
          {existente
            ? existente.direccion
            : bienvenida
              ? 'Añade tu primera cuenta de correo. Funciona con Gmail, Outlook, iCloud y cualquier servidor IMAP.'
              : 'Gmail, Outlook, iCloud, Yahoo o cualquier servidor IMAP.'}
        </p>

        {paso === 'correo' && (
          <>
            <input className="nc-campo" placeholder="Tu nombre (lo verán al recibir tus correos)" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            <input className="nc-campo" placeholder="correo@ejemplo.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="nc-boton" type="submit" disabled={!!ocupado}>
              Continuar
            </button>
          </>
        )}

        {paso === 'credenciales' && deteccion && (
          <>
            <div className="nc-detectado">
              <ShieldCheck size={15} />
              <span>
                <b>{email.trim()}</b>
                {NOMBRES_PROVEEDOR[deteccion.proveedor] ? ` · ${NOMBRES_PROVEEDOR[deteccion.proveedor]}` : ''} · {deteccion.origen}
              </span>
            </div>
            <input className="nc-campo" placeholder="Nombre de la cuenta en TuxMail (Trabajo, Personal…)" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />

            {usaOAuth ? (
              <button type="button" className="nc-boton" onClick={entrarOAuth} disabled={!!ocupado}>
                Continuar con {NOMBRES_PROVEEDOR[deteccion.auth === 'google' ? 'google' : 'microsoft']}
              </button>
            ) : (
              <>
                <input
                  className="nc-campo"
                  type="password"
                  placeholder={deteccion.ayuda ? 'Contraseña de aplicación' : 'Contraseña'}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  autoFocus
                />
                {deteccion.ayuda && <Ayuda ayuda={deteccion.ayuda} />}
                <button className="nc-boton" type="submit" disabled={!!ocupado}>
                  Añadir cuenta
                </button>
              </>
            )}

            <button type="button" className="nc-plegar" onClick={() => setVerServidores((v) => !v)}>
              {verServidores ? <CaretDown size={11} /> : <CaretRight size={11} />} Ajustes del servidor
            </button>
            {verServidores && (
              <div className="nc-servidores">
                {campoServidor('imap', 'IMAP')}
                {campoServidor('puerto', 'Puerto', true)}
                {campoServidor('smtp', 'SMTP')}
                {campoServidor('smtpPuerto', 'Puerto', true)}
                {campoServidor('usuario', 'Usuario')}
                {campoServidor('tlsNombre', 'Certificado de')}
              </div>
            )}
          </>
        )}

        {paso === 'clave' && (
          <>
            <input
              className="nc-campo"
              type="password"
              placeholder={ayudaClave ? 'Contraseña de aplicación' : 'Contraseña'}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoFocus
            />
            {ayudaClave && <Ayuda ayuda={ayudaClave} />}
            <button className="nc-boton" type="submit" disabled={!!ocupado}>
              Guardar
            </button>
          </>
        )}

        {ocupado && <div className="nc-ocupado">{ocupado}</div>}
        {fallo && (
          <div className="nc-fallo">
            {fallo.texto}
            {fallo.certificado && (
              <button
                type="button"
                onClick={() => {
                  setServidores({ ...servidores, tlsNombre: fallo.certificado })
                  setFallo(null)
                }}
              >
                Confiar en el certificado de {fallo.certificado}
              </button>
            )}
            {fallo.soloEnvio && !fallo.certificado && (
              <button type="button" onClick={() => probarYAnadir(true)}>
                Añadirla igualmente (recibir funciona; el envío se puede arreglar después)
              </button>
            )}
          </div>
        )}
        <p className="nc-privacidad">Las contraseñas se guardan en el llavero del sistema y el correo solo se queda en este equipo.</p>
      </form>
    </div>
  )
}

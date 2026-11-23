import { useEffect, useState } from 'react'
import { ArrowSquareOut, CaretDown, CaretRight, EnvelopeSimple, ShieldCheck, X } from '@phosphor-icons/react'
import type { Cuenta } from '@shared/tipos'
import type { Textos } from '@shared/i18n'
import { api } from '@/estado'
import { useT } from '@/i18n'

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
function explicar(r: Extract<Prueba, { ok: false }>, d: Deteccion | null, t: Textos): string {
  const e = t.nuevaCuenta.errores
  const lado = r.donde === 'imap' ? e.ladoImap : e.ladoSmtp
  if (r.motivo === 'clave') return d?.proveedor === 'google' ? e.claveGoogle : e.claveServidor(lado)
  if (r.motivo === 'certificado') return e.certificado(lado)
  return e.conexion(lado, r.detalle)
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
  const t = useT()
  const tn = t.nuevaCuenta
  // Si escriben una dirección que ya está en NimboMail, se pasa a pedir su contraseña.
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setFallo({ texto: tn.errores.direccion })
    setFallo(null)
    const ya = cuentas.find((c) => c.direccion.toLowerCase() === email.trim().toLowerCase())
    if (ya) return setExistente(ya)
    setOcupado(tn.ocupado.buscando)
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
    setOcupado(tn.ocupado.anadiendo)
    await api.anadirCuenta({
      nombre: nombre.trim() || email.split('@')[0],
      etiqueta: etiqueta.trim() || email,
      direccion: email.trim(),
      servidores,
      auth,
      clave: auth === 'clave' ? claveFinal : undefined,
    })
    avisar(tn.anadida(etiqueta || email))
    onCerrar()
  }

  const tratar = (r: Prueba) => {
    if (r.ok) return true
    setFallo({ texto: explicar(r, deteccion, t), certificado: r.motivo === 'certificado' ? r.certificado : undefined, soloEnvio: r.donde === 'smtp' })
    if (r.motivo === 'conexion') setVerServidores(true)
    return false
  }

  const probarYAnadir = async (forzar = false) => {
    setFallo(null)
    try {
      if (existente) {
        if (!clave) return setFallo({ texto: tn.errores.clave })
        setOcupado(tn.ocupado.comprobando)
        const r = await api.cambiarClave(existente.id, claveFinal)
        if (tratar(r) || forzar || (!r.ok && r.motivo !== 'clave')) {
          avisar(tn.claveGuardada(existente.nombre))
          onCerrar()
        }
        return
      }
      if (!servidores.imap || !servidores.smtp) return setFallo({ texto: tn.errores.servidores })
      if (deteccion?.auth !== 'clave' && conectadoOAuth) return anadir(deteccion!.auth)
      if (!clave) return setFallo({ texto: tn.errores.clave })
      setOcupado(tn.ocupado.probando)
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
    setOcupado(tn.ocupado.navegador)
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
          <button type="button" className="nc-cerrar" onClick={onCerrar} aria-label={t.comun.acciones.cerrar}>
            <X size={15} />
          </button>
        )}
        <div className="nc-icono">
          <EnvelopeSimple size={30} weight="light" />
        </div>
        <h2>{existente ? tn.titulo.clave(existente.nombre) : bienvenida ? tn.titulo.bienvenida : tn.titulo.nueva}</h2>
        <p className="nc-sub">
          {existente
            ? existente.direccion
            : bienvenida
              ? tn.sub.bienvenida
              : tn.sub.nueva}
        </p>

        {paso === 'correo' && (
          <>
            <input className="nc-campo" placeholder={tn.placeholders.nombre} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            <input className="nc-campo" placeholder={tn.placeholders.correo} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="nc-boton" type="submit" disabled={!!ocupado}>
              {tn.continuar}
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
            <input className="nc-campo" placeholder={tn.placeholders.etiqueta} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />

            {usaOAuth ? (
              <button type="button" className="nc-boton" onClick={entrarOAuth} disabled={!!ocupado}>
                {tn.continuarCon(NOMBRES_PROVEEDOR[deteccion.auth === 'google' ? 'google' : 'microsoft'])}
              </button>
            ) : (
              <>
                <input
                  className="nc-campo"
                  type="password"
                  placeholder={deteccion.ayuda ? tn.placeholders.claveAplicacion : tn.placeholders.clave}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  autoFocus
                />
                {deteccion.ayuda && <Ayuda ayuda={deteccion.ayuda} />}
                <button className="nc-boton" type="submit" disabled={!!ocupado}>
                  {tn.anadir}
                </button>
              </>
            )}

            <button type="button" className="nc-plegar" onClick={() => setVerServidores((v) => !v)}>
              {verServidores ? <CaretDown size={11} /> : <CaretRight size={11} />} {tn.ajustesServidor}
            </button>
            {verServidores && (
              <div className="nc-servidores">
                {campoServidor('imap', 'IMAP')}
                {campoServidor('puerto', tn.servidor.puerto, true)}
                {campoServidor('smtp', 'SMTP')}
                {campoServidor('smtpPuerto', tn.servidor.puerto, true)}
                {campoServidor('usuario', tn.servidor.usuario)}
                {campoServidor('tlsNombre', tn.servidor.certificadoDe)}
              </div>
            )}
          </>
        )}

        {paso === 'clave' && (
          <>
            <input
              className="nc-campo"
              type="password"
              placeholder={ayudaClave ? tn.placeholders.claveAplicacion : tn.placeholders.clave}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoFocus
            />
            {ayudaClave && <Ayuda ayuda={ayudaClave} />}
            <button className="nc-boton" type="submit" disabled={!!ocupado}>
              {t.comun.acciones.guardar}
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
                {tn.confiarCertificado(fallo.certificado)}
              </button>
            )}
            {fallo.soloEnvio && !fallo.certificado && (
              <button type="button" onClick={() => probarYAnadir(true)}>
                {tn.anadirIgualmente}
              </button>
            )}
          </div>
        )}
        <p className="nc-privacidad">{tn.privacidad}</p>
      </form>
    </div>
  )
}

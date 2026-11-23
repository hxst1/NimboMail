// Envío por SMTP y construcción de mensajes (para Enviados y Borradores) con nodemailer.
import { randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'
import type { Attachment } from 'nodemailer/lib/mailer'
import type { Borrador } from '@shared/tipos'
import { credencialesSmtp, opcionesTls, type ConfigCuenta } from './cuentas'
import type { Portapapeles } from './portapapeles'
import { t } from './idioma'

const direccion = (d: { nombre: string; direccion: string }) => (d.nombre ? { name: d.nombre, address: d.direccion } : d.direccion)

/** Texto plano sencillo a partir del HTML (la parte text/plain del mensaje). */
function textoDe(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export class Smtp {
  constructor(private portapapeles: Portapapeles) {}

  private async adjuntos(b: Borrador): Promise<Attachment[]> {
    const out: Attachment[] = []
    for (const a of b.adjuntos) {
      if (a.ruta) out.push({ filename: a.nombre, path: a.ruta })
      else if (a.datos) out.push({ filename: a.nombre, content: Buffer.from(a.datos), contentType: a.tipo || undefined })
      else if (a.url) {
        const r = await this.portapapeles.leer(a.url)
        if (!r) throw new Error(t().principal.mensajes.noLeerAdjunto(a.nombre))
        out.push({ filename: a.nombre || r.nombre, content: r.datos, contentType: a.tipo || r.tipo || undefined })
      }
    }
    return out
  }

  private async opciones(c: ConfigCuenta, b: Borrador, ids: { messageId: string; date: Date }) {
    return {
      from: { name: c.nombre, address: c.direccion },
      to: b.para.map(direccion),
      cc: b.cc.map(direccion),
      bcc: b.cco.map(direccion),
      subject: b.asunto,
      html: b.html,
      text: textoDe(b.html),
      inReplyTo: b.enRespuestaA ?? undefined,
      references: b.referencias?.length ? b.referencias : undefined,
      attachments: await this.adjuntos(b),
      attachDataUrls: true, // imágenes pegadas (data:) → incrustadas con cid
      messageId: ids.messageId,
      date: ids.date,
    }
  }

  nuevosIds(c: ConfigCuenta) {
    return { messageId: `<${randomUUID()}@${c.direccion.split('@')[1] ?? 'nimbomail'}>`, date: new Date() }
  }

  /** El mensaje entero en RFC 822, con Bcc (para guardarlo en Enviados o en Borradores). */
  async construir(c: ConfigCuenta, b: Borrador, ids: { messageId: string; date: Date }): Promise<Buffer> {
    const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
    const info = await t.sendMail(await this.opciones(c, b, ids))
    return info.message as Buffer
  }

  /** Respuesta a una invitación (iMIP): text/calendar con METHOD:REPLY, que el calendario del organizador entiende. */
  async enviarIcal(c: ConfigCuenta, d: { para: { nombre: string; direccion: string }; asunto: string; texto: string; ical: string }) {
    const t = nodemailer.createTransport({
      host: c.smtp,
      port: c.smtpPuerto,
      secure: c.smtpPuerto === 465,
      requireTLS: c.smtpPuerto !== 465,
      auth: await credencialesSmtp(c),
      tls: opcionesTls(c),
    })
    try {
      await t.sendMail({
        from: { name: c.nombre, address: c.direccion },
        to: direccion(d.para),
        subject: d.asunto,
        text: d.texto,
        icalEvent: { method: 'REPLY', content: d.ical },
      })
    } finally {
      t.close()
    }
  }

  /** Un correo de texto sencillo (por ejemplo, el de darse de baja de un boletín). */
  async enviarTexto(c: ConfigCuenta, d: { para: string; asunto: string; texto: string }) {
    const t = nodemailer.createTransport({
      host: c.smtp,
      port: c.smtpPuerto,
      secure: c.smtpPuerto === 465,
      requireTLS: c.smtpPuerto !== 465,
      auth: await credencialesSmtp(c),
      tls: opcionesTls(c),
    })
    try {
      await t.sendMail({ from: { name: c.nombre, address: c.direccion }, to: d.para, subject: d.asunto, text: d.texto })
    } finally {
      t.close()
    }
  }

  /** Envía por SMTP (sin la cabecera Bcc, como debe ser). */
  async enviar(c: ConfigCuenta, b: Borrador, ids: { messageId: string; date: Date }) {
    const t = nodemailer.createTransport({
      host: c.smtp,
      port: c.smtpPuerto,
      secure: c.smtpPuerto === 465,
      requireTLS: c.smtpPuerto !== 465, // 587 con STARTTLS: nunca en claro
      auth: await credencialesSmtp(c),
      tls: opcionesTls(c),
    })
    try {
      await t.sendMail(await this.opciones(c, b, ids))
    } finally {
      t.close()
    }
  }
}

import type { comun as En } from '../en/comun'

export const comun: typeof En = {
  app: 'NimboMail',
  roles: {
    inbox: 'Bandeja de entrada',
    drafts: 'Borradores',
    sent: 'Enviados',
    junk: 'Spam',
    trash: 'Papelera',
    archive: 'Archivo',
    all: 'Todo el correo',
  },
  buzones: {
    todasBandejas: 'Todas las bandejas',
    todosBorradores: 'Todos los borradores',
    todosEnviados: 'Todos los enviados',
    marcados: 'Marcados',
    hoy: 'Hoy',
    calendario: 'Calendario',
    suscripciones: 'Suscripciones',
    favoritos: 'Favoritos',
    buzonesInteligentes: 'Buzones inteligentes',
  },
  acciones: {
    cancelar: 'Cancelar',
    guardar: 'Guardar',
    borrar: 'Borrar',
    cerrar: 'Cerrar',
    anadir: 'Añadir',
    quitar: 'Quitar',
    deshacer: 'Deshacer',
    reintentar: 'Reintentar',
  },
  ayer: 'Ayer',
  avisos: {
    alEmpezar: 'Al empezar',
    minutos: (n) => (n === 1 ? '1 minuto' : `${n} minutos`),
    horas: (n) => (n === 1 ? '1 hora' : `${n} horas`),
    dias: (n) => (n === 1 ? '1 día' : `${n} días`),
    semanas: (n) => (n === 1 ? '1 semana' : `${n} semanas`),
  },
}

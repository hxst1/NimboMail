import type { app as En } from '../en/app'

export const app: typeof En = {
  conversaciones: (n, cantidad) => `${cantidad} ${n === 1 ? 'conversación' : 'conversaciones'}`,
  soloNoLeidos: 'solo no leídos',
  noSePudoActualizar: (error) => `No se pudo actualizar: ${error}`,
}

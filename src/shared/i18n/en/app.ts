// Ventana principal: título y subtítulo de la barra, avisos generales.
export const app = {
  conversaciones: (n: number, cantidad: string) => `${cantidad} ${n === 1 ? 'conversation' : 'conversations'}`,
  soloNoLeidos: 'unread only',
  noSePudoActualizar: (error: string) => `Couldn't get new mail: ${error}`,
}

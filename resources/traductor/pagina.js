// Puente entre NimboMail (la ventana que contiene este iframe) y el worker con el motor.
// Solo acepta mensajes de la ventana que lo contiene y solo le contesta a ella.
'use strict'
const trabajador = new Worker('trabajador.js')
trabajador.onmessage = (e) => parent.postMessage(e.data, '*')
trabajador.onerror = (e) => parent.postMessage({ tipo: 'error', error: e.message || 'El traductor falló al arrancar' }, '*')
window.addEventListener('message', (e) => {
  if (e.source !== parent) return
  trabajador.postMessage(e.data)
})

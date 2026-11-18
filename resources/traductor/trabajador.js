// Worker del traductor: carga Bergamot (WebAssembly) y el modelo inglés → español, y traduce.
// Adaptado de translator-worker.js de @browsermt/bergamot-translator (MPL-2.0).
'use strict'

// Funciones de multiplicación de matrices que el WASM importa: se usan las suyas de reserva.
const GEMM = {
  int8_prepare_a: 'int8PrepareAFallback',
  int8_prepare_b: 'int8PrepareBFallback',
  int8_prepare_b_from_transposed: 'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed: 'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias: 'int8PrepareBiasFallback',
  int8_multiply_and_add_bias: 'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b: 'int8SelectColumnsOfBFallback',
}

const CONFIG = `beam-size: 1
normalize: 1.0
word-penalty: 0
cpu-threads: 0
gemm-precision: int8shiftAlphaAll
skip-cost: true
alignment: soft
quiet: true
quiet-translation: true
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
`

// El código de Emscripten busca un «Module» global.
var Module = {}
let servicio = null
let modelo = null

function cargarMotor() {
  return new Promise((ok, ko) => {
    const wasm = fetch('motor/bergamot-translator-worker.wasm')
    Module.instantiateWasm = (info, aceptar) => {
      const gemm = Object.fromEntries(Object.entries(GEMM).map(([k, n]) => [k, (...a) => Module.asm[n](...a)]))
      WebAssembly.instantiateStreaming(wasm, { ...info, wasm_gemm: gemm })
        .then(({ instance }) => aceptar(instance))
        .catch(ko)
      return {}
    }
    Module.onRuntimeInitialized = () => ok()
    importScripts('motor/bergamot-translator-worker.js')
  })
}

async function memoria(url, alineado) {
  const datos = new Int8Array(await (await fetch(url)).arrayBuffer())
  const m = new Module.AlignedMemory(datos.byteLength, alineado)
  m.getByteArrayView().set(datos)
  return m
}

async function arrancar() {
  await cargarMotor()
  servicio = new Module.BlockingService({ cacheSize: 0 })
  const [mod, lista, vocab] = await Promise.all([
    memoria('modelo/model.bin', 256),
    memoria('modelo/lex.bin', 64),
    memoria('modelo/vocab.spm', 64),
  ])
  const vocabs = new Module.AlignedMemoryList()
  vocabs.push_back(vocab)
  modelo = new Module.TranslationModel(CONFIG, mod, lista, vocabs, null)
}

function traducir(textos) {
  const entrada = new Module.VectorString()
  const opciones = new Module.VectorResponseOptions()
  for (const t of textos) {
    entrada.push_back(t.text)
    opciones.push_back({ alignment: false, html: !!t.html, qualityScores: false })
  }
  const respuestas = servicio.translate(modelo, entrada, opciones)
  const out = textos.map((_, i) => respuestas.get(i).getTranslatedText())
  entrada.delete()
  opciones.delete()
  respuestas.delete()
  return out
}

const listo = arrancar()
listo.then(
  () => postMessage({ tipo: 'listo' }),
  (e) => postMessage({ tipo: 'error', error: String((e && e.message) || e) }),
)

self.addEventListener('message', async ({ data }) => {
  if (!data || data.tipo !== 'traducir') return
  try {
    await listo
    postMessage({ id: data.id, resultado: traducir(data.textos) })
  } catch (e) {
    postMessage({ id: data.id, error: String((e && e.message) || e) })
  }
})

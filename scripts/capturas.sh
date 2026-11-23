#!/usr/bin/env bash
# Regenerates the README screenshots (docs/capturas/*.png) from the demo data, without touching any
# real account. Usage: scripts/capturas.sh [en|es]   (default: en)
set -euo pipefail

cd "$(dirname "$0")/.."
IDIOMA="${1:-en}"
DIR=docs/capturas
mkdir -p "$DIR"

pnpm -s build >/dev/null

captura() {
  local nombre="$1"; shift
  echo "→ $DIR/$nombre.png"
  # Fresh temp dir each time: capture mode keeps its settings (accent, layout…) under the temp folder.
  local tmp; tmp="$(mktemp -d)"
  env TMPDIR="$tmp" NIMBOMAIL_IDIOMA="$IDIOMA" CORREO_CAPTURA="$PWD/$DIR/$nombre.png" "$@" \
    pnpm -s exec electron-vite preview -- --demo >/dev/null 2>&1 || echo "  (failed: $nombre)"
  rm -rf "$tmp"
}

captura principal CORREO_VISTA=columnas CORREO_SEL=0
captura acento-rosa CORREO_VISTA=ancha CORREO_SEL=2 CORREO_ACENTO=rosa
captura redactar CORREO_VISTA=columnas CORREO_SEL=0 CORREO_REDACTAR=1
captura menu CORREO_VISTA=columnas CORREO_SEL=2 CORREO_MENU=fila
captura calendario CORREO_VISTA=columnas CORREO_JS="{
  [...document.querySelectorAll('.sb-item')].find((e) => /^(Calendar|Calendario)$/.test(e.querySelector('.sb-texto')?.textContent ?? ''))?.click()
  await new Promise((r) => setTimeout(r, 1200))
  return 'calendario'
}"
captura alta CORREO_VISTA=columnas CORREO_SEL=0 CORREO_JS="{
  document.querySelector('.sb-anadir').click()
  await new Promise((r) => setTimeout(r, 400))
  const poner = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const [nombre, correo] = document.querySelectorAll('.nueva-cuenta .nc-campo')
  poner(nombre, 'Alex Morgan')
  poner(correo, 'alex.morgan@gmail.com')
  await new Promise((r) => setTimeout(r, 100))
  document.querySelector('.nueva-cuenta').requestSubmit()
  await new Promise((r) => setTimeout(r, 1500))
  return 'alta'
}"

echo "✓ Screenshots updated ($IDIOMA)."

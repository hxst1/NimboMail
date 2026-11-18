#!/usr/bin/env bash
# Compila TuxMail y lo instala para tu usuario (sin root):
#   ~/.local/lib/tuxmail        la aplicación
#   ~/.local/bin/tuxmail        el lanzador
#   ~/.local/share/applications/tuxmail.desktop   (y el icono en el tema hicolor)
# Para actualizar, vuelve a ejecutarlo. Para arrancar con la sesión: `tuxmail --oculto`.
set -euo pipefail

cd "$(dirname "$0")/.."
DATOS="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$HOME/.local/lib/tuxmail"
LANZADOR="$HOME/.local/bin/tuxmail"

echo "→ Compilando…"
pnpm install --frozen-lockfile
pnpm empaquetar

echo "→ Instalando en $APP…"
mkdir -p "$(dirname "$APP")" "$(dirname "$LANZADOR")" "$DATOS/applications"
rm -rf "$APP.nuevo"
cp -a dist/linux-unpacked "$APP.nuevo"
rm -rf "$APP.viejo"
[ -d "$APP" ] && mv "$APP" "$APP.viejo"
mv "$APP.nuevo" "$APP"
rm -rf "$APP.viejo"

cat > "$LANZADOR" <<LANZA
#!/usr/bin/env bash
# Lanzador de TuxMail (instalado con scripts/instalar.sh). --oculto: solo en la bandeja.
exec "$APP/tuxmail" "\$@"
LANZA
chmod +x "$LANZADOR"

for t in 64 128 256; do
  mkdir -p "$DATOS/icons/hicolor/${t}x${t}/apps"
  if command -v magick >/dev/null; then
    magick resources/tuxmail.png -resize "${t}x${t}" "$DATOS/icons/hicolor/${t}x${t}/apps/tuxmail.png"
  else
    cp resources/tuxmail.png "$DATOS/icons/hicolor/${t}x${t}/apps/tuxmail.png"
  fi
done
mkdir -p "$DATOS/icons/hicolor/scalable/apps"
cp resources/tuxmail.svg "$DATOS/icons/hicolor/scalable/apps/tuxmail.svg"

cat > "$DATOS/applications/tuxmail.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=TuxMail
GenericName=Correo
Comment=Cliente de correo rápido, minimalista y privado
Exec=$LANZADOR %U
Icon=tuxmail
StartupWMClass=tuxmail
Categories=Network;Email;
MimeType=x-scheme-handler/mailto;
Terminal=false
DESK

command -v update-desktop-database >/dev/null && update-desktop-database "$DATOS/applications" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$DATOS/icons/hicolor" || true

echo "✓ TuxMail instalado. Ábrelo desde el lanzador de apps o con «tuxmail»."
echo "  Si tenías TuxMail abierto, ciérralo del todo (Ctrl+Q) y vuelve a abrirlo."
echo "  Para que arranque con la sesión, en la bandeja: tuxmail --oculto"

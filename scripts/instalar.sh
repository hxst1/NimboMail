#!/usr/bin/env bash
# Compila NimboMail y lo instala para tu usuario (sin root):
#   ~/.local/lib/nimbomail        la aplicación
#   ~/.local/bin/nimbomail        el lanzador
#   ~/.local/share/applications/nimbomail.desktop   (y el icono en el tema hicolor)
# Para actualizar, vuelve a ejecutarlo. Para arrancar con la sesión: `nimbomail --hidden`.
set -euo pipefail

cd "$(dirname "$0")/.."
DATOS="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$HOME/.local/lib/nimbomail"
LANZADOR="$HOME/.local/bin/nimbomail"

echo "→ Building…"
pnpm install --frozen-lockfile
pnpm empaquetar

echo "→ Installing to $APP…"
mkdir -p "$(dirname "$APP")" "$(dirname "$LANZADOR")" "$DATOS/applications"
rm -rf "$APP.nuevo"
cp -a dist/linux-unpacked "$APP.nuevo"
rm -rf "$APP.viejo"
[ -d "$APP" ] && mv "$APP" "$APP.viejo"
mv "$APP.nuevo" "$APP"
rm -rf "$APP.viejo"

cat > "$LANZADOR" <<LANZA
#!/usr/bin/env bash
# Lanzador de NimboMail (instalado con scripts/instalar.sh). --hidden: solo en la bandeja.
exec "$APP/nimbomail" "\$@"
LANZA
chmod +x "$LANZADOR"

for t in 64 128 256; do
  mkdir -p "$DATOS/icons/hicolor/${t}x${t}/apps"
  if command -v magick >/dev/null; then
    magick resources/nimbomail.png -resize "${t}x${t}" "$DATOS/icons/hicolor/${t}x${t}/apps/nimbomail.png"
  else
    cp resources/nimbomail.png "$DATOS/icons/hicolor/${t}x${t}/apps/nimbomail.png"
  fi
done
mkdir -p "$DATOS/icons/hicolor/scalable/apps"
cp resources/nimbomail.svg "$DATOS/icons/hicolor/scalable/apps/nimbomail.svg"

cat > "$DATOS/applications/nimbomail.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=NimboMail
GenericName=Email
Comment=Fast, minimal and private email client for Linux
Keywords=email;mail;imap;smtp;calendar;correo;
Exec=$LANZADOR %U
Icon=nimbomail
StartupWMClass=nimbomail
Categories=Network;Email;
MimeType=x-scheme-handler/mailto;
Terminal=false
DESK

# Antes se llamaba TuxMail: fuera su instalación (sus datos los pasa NimboMail al abrirse) y los
# enlaces mailto: pasan a NimboMail si los abría TuxMail.
ANTERIOR=0
if [ -e "$HOME/.local/lib/tuxmail" ] || [ -e "$DATOS/applications/tuxmail.desktop" ]; then
  ANTERIOR=1
  echo "→ Removing the TuxMail install (the previous name)…"
  rm -rf "$HOME/.local/lib/tuxmail" "$HOME/.local/bin/tuxmail" "$DATOS/applications/tuxmail.desktop" \
    "$DATOS/icons/hicolor/scalable/apps/tuxmail.svg"
  for t in 64 128 256; do rm -f "$DATOS/icons/hicolor/${t}x${t}/apps/tuxmail.png"; done
fi
if command -v xdg-mime >/dev/null && [ "$(xdg-mime query default x-scheme-handler/mailto 2>/dev/null)" = "tuxmail.desktop" ]; then
  xdg-mime default nimbomail.desktop x-scheme-handler/mailto
fi

command -v update-desktop-database >/dev/null && update-desktop-database "$DATOS/applications" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$DATOS/icons/hicolor" || true

echo "✓ NimboMail installed. Open it from your app launcher or run \"nimbomail\"."
if [ "$ANTERIOR" = 1 ]; then
  echo "  TuxMail is now called NimboMail: quit TuxMail completely (Ctrl+Q) and open NimboMail;"
  echo "  your accounts, mail and settings move over automatically. If you started \"tuxmail --oculto\""
  echo "  with your session (or had window rules for the tuxmail class), change them to nimbomail."
else
  echo "  If NimboMail was running, quit it completely (Ctrl+Q) and open it again."
fi
echo "  To start it with your session, in the tray only: nimbomail --hidden"

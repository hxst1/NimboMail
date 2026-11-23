// electron-builder afterPack hook: puts a small launcher in front of the Electron binary.
//
// Chromium's sandbox needs either unprivileged user namespaces or a setuid-root chrome-sandbox. The
// AppImage and the tarball can't ship a setuid helper, and some distros restrict user namespaces
// (Ubuntu 23.10+ through AppArmor, Debian with unprivileged_userns_clone=0, hardened kernels), so
// there Electron aborts at startup ("The SUID sandbox helper binary was found, but is not configured
// correctly"). The launcher detects that case and only then starts the app with --no-sandbox; if the
// sandbox still fails at startup, it tries again without it.
const { chmodSync, renameSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const LANZADOR = `#!/bin/bash
# NimboMail launcher (see scripts/despues-de-empaquetar.cjs in the repository).
DIR="$(dirname "$(readlink -f "\${BASH_SOURCE[0]}")")"

sandbox_disponible() {
  # Installed by a system package with a setuid-root helper (AUR, .deb…): always works.
  [ -u "$DIR/chrome-sandbox" ] && [ "$(stat -c %u "$DIR/chrome-sandbox")" = 0 ] && return 0
  # Ubuntu 23.10+: AppArmor only allows user namespaces to programs with a profile (the .deb installs one).
  if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ]; then
    grep -qsF "\\"$DIR/nimbomail-bin\\"" /etc/apparmor.d/*
    return
  fi
  # Anything else (sysctls, hardened kernels, containers): just try to create one.
  command -v unshare >/dev/null 2>&1 || return 0
  unshare --user true 2>/dev/null
}

if sandbox_disponible; then
  (exec -a "$0" "$DIR/nimbomail-bin" "$@")
  codigo=$?
  # 133 = SIGTRAP, how Chromium aborts when it can't set up the sandbox after all (unloaded AppArmor
  # profile, missing capabilities…). Only right at startup: a crash after a while is not that.
  [ "$codigo" = 133 ] && [ "$SECONDS" -lt 15 ] || exit "$codigo"
  echo "NimboMail: the Chromium sandbox is not available, starting without it" >&2
fi
exec -a "$0" "$DIR/nimbomail-bin" --no-sandbox "$@"
`

exports.default = async function (contexto) {
  if (contexto.electronPlatformName !== 'linux') return
  const binario = join(contexto.appOutDir, contexto.packager.executableName)
  renameSync(binario, binario + '-bin')
  writeFileSync(binario, LANZADOR)
  chmodSync(binario, 0o755)
}

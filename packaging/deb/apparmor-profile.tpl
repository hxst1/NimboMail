abi <abi/4.0>,
include <tunables/global>

# Ubuntu 23.10+ only lets Chromium create its sandbox (user namespaces) for programs with a profile.
# The real binary is ${executable}-bin: ${executable} is a launcher script (scripts/despues-de-empaquetar.cjs).
profile "${executable}" "/opt/${sanitizedProductName}/${executable}-bin" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/${executable}>
}

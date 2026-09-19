#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Instala Node.js 24 LTS desde https://nodejs.org y vuelve a abrir este archivo."
  read -r -p "Pulsa Enter para cerrar. "
  exit 1
fi
node scripts/launch.mjs "$@" || { read -r -p "Pulsa Enter para cerrar. "; exit 1; }

#!/usr/bin/env bash
set -eu
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo "Instala Node.js 24 LTS desde https://nodejs.org y vuelve a ejecutar este archivo."
  exit 1
fi
exec node scripts/launch.mjs "$@"

#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm ci; fi
node scripts/setup.mjs
npm run build
exec npm start

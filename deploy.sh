#!/usr/bin/env bash
# District 7 — one-command deploy wrapper (Git + Firebase)
# Usage: ./deploy.sh "your commit message"
#        ./deploy.sh --firebase-only

set -euo pipefail
cd "$(dirname "$0")"
node scripts/deploy.mjs "$@"

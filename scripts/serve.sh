#!/bin/bash
# Always-on dev server for the job-hunt app, supervised by launchd. Runs `next dev`
# so hot-reload is preserved — edits show without a rebuild — and CoWork can hit
# localhost:3000 anytime. Resolves the project root relative to this script, so it
# works wherever you clone the repo.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")/.." || exit 1
exec npm run dev

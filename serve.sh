#!/bin/sh
# Serve the static app on http://localhost:8765  (ES modules + fetch need http, not file://)
cd "$(dirname "$0")/web" && python3 -m http.server 8765

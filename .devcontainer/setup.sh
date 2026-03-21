#!/bin/bash
set -e

if [ -n "$CODESPACE_NAME" ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  cat > .env <<EOF
VITE_SIGNAL_URL=wss://${CODESPACE_NAME}-3001.${DOMAIN}
VITE_SIGNAL_PORT=3001
VITE_DEV_PORT=5173
VITE_HMR_HOST=${CODESPACE_NAME}-5173.${DOMAIN}
SIGNAL_HOST=0.0.0.0
SIGNAL_PORT=3001
EOF
  echo ".env configured for Codespace: $CODESPACE_NAME"
else
  if [ ! -f .env.example ]; then
    echo "Warning: .env.example not found – skipping .env creation"
  elif [ ! -f .env ]; then
    cp .env.example .env
    echo ".env copied from .env.example (not running in Codespace)"
  else
    echo ".env already exists – skipping copy"
  fi
fi

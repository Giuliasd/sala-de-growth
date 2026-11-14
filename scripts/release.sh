#!/usr/bin/env bash
# Release phase do Heroku: aplica migrations pendentes com retry.
#
# Por que existe: o Postgres essential-0 recusa esporadicamente a conexão NOVA
# aberta pelo `prisma migrate deploy` durante a janela do deploy (P1001), o que
# derrubava o release inteiro e impedia a promoção da versão — mesmo sem
# migration pendente. Como `migrate deploy` é idempotente e seguro de repetir,
# tentamos algumas vezes com backoff antes de desistir.
set -uo pipefail

MAX_ATTEMPTS="${RELEASE_MIGRATE_ATTEMPTS:-5}"
attempt=1

while true; do
  echo "[release] prisma migrate deploy — tentativa ${attempt}/${MAX_ATTEMPTS}"
  if npx prisma migrate deploy; then
    echo "[release] migrations aplicadas com sucesso."
    exit 0
  fi

  if [ "${attempt}" -ge "${MAX_ATTEMPTS}" ]; then
    echo "[release] falhou após ${MAX_ATTEMPTS} tentativas. Abortando o release." >&2
    exit 1
  fi

  # Backoff crescente: 5s, 10s, 15s, 20s...
  wait=$((attempt * 5))
  echo "[release] falhou (provável P1001 transitório do essential-0). Nova tentativa em ${wait}s..." >&2
  sleep "${wait}"
  attempt=$((attempt + 1))
done

#!/usr/bin/env bash
# Lê a chave privada de $VPS_SSH_KEY e escreve no stdout em formato válido.
# Aceita: chave normal (várias linhas), linhas grudadas/espaços/CRLF (cópia
# de terminal) ou a chave inteira em base64 numa linha (base64 -w0 chave).
set -euo pipefail
raw="$(printf '%s' "${VPS_SSH_KEY:-}" | tr -d '\r')"

if [ -z "$raw" ]; then
  echo "::error::Secret VPS_SSH_KEY está vazio." >&2; exit 1
fi
if printf '%s' "$raw" | grep -qE '^[[:space:]]*(ssh-ed25519|ssh-rsa|ecdsa-sha2)'; then
  echo "::error::VPS_SSH_KEY contém a chave PÚBLICA (.pub). Use a chave privada (arquivo sem .pub)." >&2; exit 1
fi
if ! printf '%s' "$raw" | grep -q 'PRIVATE KEY-----'; then
  compact="$(printf '%s' "$raw" | tr -d '[:space:]')"
  magic="$(printf '%s' "$compact" | base64 -d 2>/dev/null | head -c 14 || true)"
  decoded="$(printf '%s' "$compact" | base64 -d 2>/dev/null | tr -d '\0' || true)"
  if [ "$magic" = "openssh-key-v1" ]; then
    # só o miolo da chave, sem as linhas BEGIN/END
    raw="$(printf -- '-----BEGIN OPENSSH PRIVATE KEY-----\n%s\n-----END OPENSSH PRIVATE KEY-----' "$compact")"
  elif printf '%s' "$decoded" | grep -q 'PRIVATE KEY-----'; then
    raw="$(printf '%s' "$decoded" | tr -d '\r')"
  else
    echo "::error::VPS_SSH_KEY não é uma chave privada (nem em texto, nem em base64)." >&2; exit 1
  fi
fi

# Reconstrói: cabeçalho, corpo base64 em linhas de 70, rodapé
header="$(printf '%s' "$raw" | grep -oE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----' | head -1)"
footer="${header/BEGIN/END}"
body="$(printf '%s' "$raw" | tr '\n' ' ' | sed -e "s/.*${header}//" -e "s/${footer}.*//" | tr -d '[:space:]')"
if [ -z "$header" ] || [ -z "$body" ]; then
  echo "::error::VPS_SSH_KEY sem o cabeçalho BEGIN/END completo. Cole a chave inteira." >&2; exit 1
fi
printf '%s\n' "$header"
printf '%s' "$body" | fold -w 70
printf '\n%s\n' "$footer"

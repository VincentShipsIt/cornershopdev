#!/usr/bin/env bash
set -Eeuo pipefail

deploy_script_source="${1:-}"
caddy_fragment_source="${2:-}"
if [[ ! -f "$deploy_script_source" || ! -f "$caddy_fragment_source" ]]; then
  echo "Usage: bootstrap-host.sh <deploy-script> <caddy-fragment>" >&2
  exit 2
fi

install -m 755 "$deploy_script_source" /usr/local/bin/deploy-cornershopdev
install -d -m 700 /etc/cornershopdev /var/lib/cornershopdev

caddyfile="/etc/caddy/Caddyfile"
backup="/etc/caddy/Caddyfile.$(date -u +%Y%m%dT%H%M%SZ).bak"
cp "$caddyfile" "$backup"

temporary_body="$(mktemp /etc/caddy/Caddyfile.body.XXXXXX)"
temporary_caddyfile="$(mktemp /etc/caddy/Caddyfile.XXXXXX)"
trap 'rm -f "$temporary_body" "$temporary_caddyfile"' EXIT

# RESTOFRONT is the marker an earlier revision of this script wrote. A host
# bootstrapped before the rename still carries that block, and the fragment we
# append declares the same catch-all `https://` address, so dropping only the
# current marker leaves two blocks claiming it and `caddy validate` rejects the
# file. Keep matching the old name until no host is running the old bootstrap.
awk '
  /^# BEGIN (CORNERSHOPDEV|RESTOFRONT)$/ { managed = 1; next }
  /^# END (CORNERSHOPDEV|RESTOFRONT)$/ { managed = 0; next }
  !managed { print }
' "$caddyfile" >"$temporary_body"

# The global options block sits outside those markers, so the pre-rename run
# left an ask endpoint naming a container this script is about to rename away.
# Caddy denies every on-demand certificate when that endpoint stops resolving,
# which would cost each customer domain its issuance and renewal. Retarget only
# the exact line the old bootstrap wrote and leave operator edits untouched.
sed -i \
  's#ask http://restofront:3000/api/domains/authorize#ask http://cornershopdev:3000/api/domains/authorize#' \
  "$temporary_body"

{
  if ! grep -q "on_demand_tls" "$temporary_body"; then
    printf '%s\n' '{'
    printf '%s\n' '	on_demand_tls {'
    printf '%s\n' '		ask http://cornershopdev:3000/api/domains/authorize'
    printf '%s\n' '	}'
    printf '%s\n\n' '}'
  fi
  cat "$temporary_body"
  printf '\n'
  cat "$caddy_fragment_source"
} >"$temporary_caddyfile"

docker run --rm \
  --volume "$temporary_caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2 \
  caddy validate --config /etc/caddy/Caddyfile
# Preserve the inode because the shared Caddy container bind-mounts this file.
cat "$temporary_caddyfile" >"$caddyfile"
chmod 644 "$caddyfile"

docker exec shipshit-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec shipshit-caddy caddy reload --config /etc/caddy/Caddyfile
echo "Cornershopdev host bootstrap complete; Caddy backup: ${backup}"

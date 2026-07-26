#!/usr/bin/env bash
set -Eeuo pipefail

artifact_uri="${1:-}"
image_name="${2:-}"
expected_sha256="${3:-}"

if [[ ! "$artifact_uri" =~ ^s3://cornershopdev-production-deploy-[a-z0-9-]+/images/([0-9a-f]{40})\.tar\.gz$ ]]; then
  echo "Invalid deployment artifact URI" >&2
  exit 2
fi
deploy_sha="${BASH_REMATCH[1]}"
if [[ "$image_name" != "cornershopdev:${deploy_sha}" ]]; then
  echo "Deployment image does not match artifact SHA" >&2
  exit 2
fi
if [[ ! "$expected_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Invalid deployment script checksum" >&2
  exit 2
fi

state_directory="${CORNERSHOPDEV_DEPLOY_STATE_DIR:-/var/lib/cornershopdev}"
install -d -m 700 "$state_directory"
umask 077
deploy_script="$(mktemp "${state_directory}/deploy.XXXXXX.sh")"
trap 'rm -f "$deploy_script"' EXIT

script_uri="${artifact_uri%.tar.gz}.deploy.sh"
aws s3 cp \
  "$script_uri" \
  "$deploy_script" \
  --region us-west-1 \
  --only-show-errors

actual_sha256="$(sha256sum "$deploy_script" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Deployment script checksum mismatch" >&2
  exit 1
fi

chmod 500 "$deploy_script"
echo "deploy-script verified sha256=${actual_sha256}"
"$deploy_script" "$artifact_uri" "$image_name"

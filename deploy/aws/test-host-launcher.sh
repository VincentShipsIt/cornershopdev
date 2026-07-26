#!/usr/bin/env bash
set -Eeuo pipefail

root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
fake_bin="${root}/bin"
state_directory="${root}/state"
mkdir -p "$fake_bin"

cat >"${fake_bin}/aws" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$1" != "s3" || "$2" != "cp" ]]; then
  echo "Unexpected aws invocation" >&2
  exit 2
fi
cp "$FAKE_AWS_SOURCE" "$4"
EOF
chmod +x "${fake_bin}/aws"

fake_deployer="${root}/deploy.sh"
cat >"$fake_deployer" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$1" "$2" >"$FAKE_DEPLOY_RECORD"
EOF
chmod +x "$fake_deployer"

launcher="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host-launcher.sh"
artifact_uri="s3://cornershopdev-production-deploy-test/images/0123456789abcdef0123456789abcdef01234567.tar.gz"
image_name="cornershopdev:0123456789abcdef0123456789abcdef01234567"
record="${root}/record"
checksum="$(sha256sum "$fake_deployer" | awk '{print $1}')"

if CORNERSHOPDEV_DEPLOY_STATE_DIR="$state_directory" "$launcher" >/dev/null 2>&1; then
  echo "Launcher accepted missing arguments" >&2
  exit 1
fi

if PATH="${fake_bin}:$PATH" \
  FAKE_AWS_SOURCE="$fake_deployer" \
  FAKE_DEPLOY_RECORD="$record" \
  CORNERSHOPDEV_DEPLOY_STATE_DIR="$state_directory" \
  "$launcher" "$artifact_uri" "$image_name" \
  0000000000000000000000000000000000000000000000000000000000000000 \
  >/dev/null 2>&1; then
  echo "Launcher accepted a checksum mismatch" >&2
  exit 1
fi
if [[ -e "$record" ]]; then
  echo "Launcher executed an unverified deploy script" >&2
  exit 1
fi

output="$(
  PATH="${fake_bin}:$PATH" \
    FAKE_AWS_SOURCE="$fake_deployer" \
    FAKE_DEPLOY_RECORD="$record" \
    CORNERSHOPDEV_DEPLOY_STATE_DIR="$state_directory" \
    "$launcher" "$artifact_uri" "$image_name" "$checksum"
)"
grep -Fxq "deploy-script verified sha256=${checksum}" <<<"$output"
expected_record="$(printf '%s\n%s' "$artifact_uri" "$image_name")"
if [[ "$(cat "$record")" != "$expected_record" ]]; then
  echo "Launcher changed the deploy script arguments" >&2
  exit 1
fi

echo "host launcher tests passed"

#!/usr/bin/env bash
set -Eeuo pipefail

artifact_uri="${1:-}"
image_name="${2:-}"
if [[ ! "$artifact_uri" =~ ^s3://cornershopdev-production-deploy-[a-z0-9-]+/images/[0-9a-f]{40}\.tar\.gz$ ]]; then
  echo "Invalid deployment artifact URI" >&2
  exit 2
fi
if [[ ! "$image_name" =~ ^cornershopdev:[0-9a-f]{40}$ ]]; then
  echo "Invalid deployment image name" >&2
  exit 2
fi
readonly container="api-cornershop-dev"
readonly candidate="${container}-candidate"
readonly previous="${container}-previous"

install -d -m 700 /etc/cornershopdev /var/lib/cornershopdev
environment_file="/etc/cornershopdev/production.env"
temporary_environment="$(mktemp /etc/cornershopdev/production.env.XXXXXX)"
artifact_file="$(mktemp /var/lib/cornershopdev/image.XXXXXX.tar.gz)"
trap 'rm -f "$temporary_environment" "$artifact_file"' EXIT
umask 077

required_parameters=(
  AWS_REGION
  CLAIM_TOKEN_SECRET
  CUSTOM_DOMAIN_CNAME
  DATABASE_URL
  HEALTHCHECK_TOKEN
  NEXT_PUBLIC_APP_URL
  OPERATOR_ALERT_EMAILS
  PLATFORM_HOSTNAMES
  PUBLIC_APP_IP
  REDIS_URL
  RESEND_API_KEY
  RESEND_WEBHOOK_SECRET
  S3_BUCKET
  S3_PUBLIC_BASE_URL
  STRIPE_GROWTH_PRICE_ID
  STRIPE_SECRET_KEY
  STRIPE_STARTER_PRICE_ID
  STRIPE_WEBHOOK_SECRET
  WORKFLOW_POSTGRES_JOB_PREFIX
  WORKFLOW_POSTGRES_MAX_POOL_SIZE
  WORKFLOW_POSTGRES_URL
  WORKFLOW_POSTGRES_WORKER_CONCURRENCY
  WORKFLOW_TARGET_WORLD
  WORKFLOW_ENABLED
)
optional_parameters=(
  AI_GATEWAY_API_KEY
  AI_IMAGE_MODEL
  AI_TEXT_MODEL
  BETTER_AUTH_SECRET
  EMAIL_FROM
  EMAIL_REPLY_TO
  OPENROUTER_API_KEY
  OPENROUTER_TEXT_MODEL
  STRIPE_LEGACY_PRICE_IDS
  SUPERADMIN_EMAILS
)

read_parameter() {
  local key="$1"
  aws ssm get-parameter \
    --region us-east-1 \
    --name "/shipshit/production/cornershopdev/${key}" \
    --with-decryption \
    --query "Parameter.Value" \
    --output text
}

for key in "${required_parameters[@]}"; do
  value="$(read_parameter "$key")"
  if [[ -z "$value" || "$value" == "None" ]]; then
    echo "Required parameter ${key} is empty" >&2
    exit 1
  fi
  printf '%s=%s\n' "$key" "$value" >>"$temporary_environment"
done

for key in "${optional_parameters[@]}"; do
  if value="$(read_parameter "$key" 2>/dev/null)" && [[ -n "$value" && "$value" != "None" ]]; then
    printf '%s=%s\n' "$key" "$value" >>"$temporary_environment"
  fi
done
install -m 600 "$temporary_environment" "$environment_file"

docker network inspect shipshit >/dev/null
docker volume create cornershopdev-redis-data >/dev/null
if ! docker inspect cornershopdev-redis >/dev/null 2>&1; then
  docker run -d \
    --name cornershopdev-redis \
    --network shipshit \
    --restart unless-stopped \
    --memory 128m \
    --cpus 0.25 \
    --volume cornershopdev-redis-data:/data \
    redis:7.4-alpine \
    redis-server \
    --appendonly yes \
    --appendfsync everysec \
    --maxmemory 96mb \
    --maxmemory-policy noeviction >/dev/null
elif [[ "$(docker inspect --format '{{.State.Running}}' cornershopdev-redis)" != "true" ]]; then
  docker start cornershopdev-redis >/dev/null
fi

aws s3 cp "$artifact_uri" "$artifact_file" --region us-west-1 --only-show-errors
gzip -dc "$artifact_file" | docker load >/dev/null
docker image inspect "$image_name" >/dev/null

docker rm -f "$candidate" >/dev/null 2>&1 || true
docker run -d \
  --name "$candidate" \
  --network shipshit \
  --env-file "$environment_file" \
  --restart no \
  --memory 768m \
  --cpus 1 \
  "$image_name" >/dev/null

wait_for_health() {
  local container="$1"
  for _ in $(seq 1 36); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
    if [[ "$status" == "healthy" ]]; then return 0; fi
    if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
      docker logs --tail 120 "$container" >&2
      return 1
    fi
    sleep 5
  done
  docker logs --tail 120 "$container" >&2
  return 1
}

wait_for_health "$candidate"
docker rm -f "$previous" >/dev/null 2>&1 || true
if docker inspect "$container" >/dev/null 2>&1; then
  docker stop "$container" >/dev/null
  docker rename "$container" "$previous"
fi
docker rename "$candidate" "$container"
docker update --restart unless-stopped "$container" >/dev/null

reload_caddy() {
  docker exec shipshit-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null
}

if ! reload_caddy || ! wait_for_health "$container"; then
  echo "Deployment failed after cutover; rolling back" >&2
  docker rm -f "$container" >/dev/null 2>&1 || true
  if docker inspect "$previous" >/dev/null 2>&1; then
    docker rename "$previous" "$container"
    docker start "$container" >/dev/null
    reload_caddy
  fi
  exit 1
fi

docker rm -f "$previous" >/dev/null 2>&1 || true

monitor_service="/etc/systemd/system/cornershopdev-public-health.service"
monitor_timer="/etc/systemd/system/cornershopdev-public-health.timer"
temporary_monitor_service="$(mktemp /etc/systemd/system/cornershopdev-public-health.service.XXXXXX)"
temporary_monitor_timer="$(mktemp /etc/systemd/system/cornershopdev-public-health.timer.XXXXXX)"
trap 'rm -f "$temporary_environment" "$artifact_file" "$temporary_monitor_service" "$temporary_monitor_timer"' EXIT

{
  printf '%s\n' '[Unit]'
  printf '%s\n' 'Description=Cornershopdev public-site health and operator alert check'
  printf '%s\n' 'After=docker.service network-online.target'
  printf '%s\n' 'Wants=network-online.target'
  printf '\n%s\n' '[Service]'
  printf '%s\n' 'Type=oneshot'
  printf '%s\n' 'TimeoutStartSec=45s'
  printf '%s\n' "ExecStart=/usr/bin/docker run --rm --network shipshit --memory 256m --cpus 0.25 --env-file ${environment_file} --entrypoint bun ${image_name} run operator:monitor-public-site --execute"
} >"$temporary_monitor_service"

{
  printf '%s\n' '[Unit]'
  printf '%s\n' 'Description=Check Cornershopdev public health every two minutes'
  printf '\n%s\n' '[Timer]'
  printf '%s\n' 'OnBootSec=2min'
  printf '%s\n' 'OnUnitActiveSec=2min'
  printf '%s\n' 'RandomizedDelaySec=15s'
  printf '%s\n' 'Persistent=true'
  printf '\n%s\n' '[Install]'
  printf '%s\n' 'WantedBy=timers.target'
} >"$temporary_monitor_timer"

install -m 644 "$temporary_monitor_service" "$monitor_service"
install -m 644 "$temporary_monitor_timer" "$monitor_timer"
systemctl daemon-reload
systemctl enable --now cornershopdev-public-health.timer >/dev/null

echo "Cornershopdev deployment is healthy: ${image_name}"

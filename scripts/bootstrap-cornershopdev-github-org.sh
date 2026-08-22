#!/usr/bin/env bash
# Bootstrap the cornershopdev GitHub org:
#   - cornershopdev/cornershop.dev  (public factory — transfer from VincentShipsIt/cornershopdev)
#   - cornershopdev/pro             (private studio apps — transfer from shipshitdev/servizo)
#   - cornershopdev/vault           (private company brain / agent memory)
#
# Requires: gh CLI authenticated with admin:org
#   gh auth refresh -h github.com -s admin:org,delete_repo
set -euo pipefail

ORG="cornershopdev"
FACTORY_SOURCE="VincentShipsIt/cornershopdev"
FACTORY_TARGET="${ORG}/cornershop.dev"
PRO_SOURCE="shipshitdev/servizo"
PRO_TARGET="${ORG}/pro"
VAULT_TARGET="${ORG}/vault"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated" >&2
  exit 1
fi

ADMIN_LOGIN="$(gh api user --jq .login)"

create_org_if_missing() {
  if gh api "orgs/${ORG}" >/dev/null 2>&1; then
    echo "org ${ORG} already exists"
    return
  fi
  echo "creating org ${ORG} (admin: ${ADMIN_LOGIN})"
  gh api -X POST /organizations \
    -f login="${ORG}" \
    -f profile_name="Cornershopdev" \
    -f admin="${ADMIN_LOGIN}"
}

transfer_repo() {
  local source="$1"
  local owner="$2"
  local name="$3"
  if gh api "repos/${owner}/${name}" >/dev/null 2>&1; then
    echo "repo ${owner}/${name} already exists — skip transfer of ${source}"
    return
  fi
  echo "transferring ${source} -> ${owner}/${name}"
  gh api -X POST "repos/${source}/transfer" \
    -f new_owner="${owner}" \
    -f new_name="${name}"
}

seed_vault() {
  if gh api "repos/${VAULT_TARGET}" >/dev/null 2>&1; then
    echo "vault repo already exists"
  else
    echo "creating private ${VAULT_TARGET}"
    gh repo create "${VAULT_TARGET}" \
      --private \
      --description "Corner Shop Labs operating knowledge and agent memory"
  fi

  local workdir
  workdir="$(mktemp -d)"
  trap 'rm -rf "${workdir}"' EXIT

  gh repo clone "${VAULT_TARGET}" "${workdir}/vault" -- --depth=1 2>/dev/null || {
    mkdir -p "${workdir}/vault"
    git -C "${workdir}/vault" init -b main
    git -C "${workdir}/vault" remote add origin "git@github.com:${VAULT_TARGET}.git"
  }

  cat >"${workdir}/vault/README.md" <<'EOF'
# vault

Private operating knowledge for Corner Shop Labs / Cornershopdev.

- `memory/` — durable repo-agnostic decisions, deploy state, niche GTM
- `sessions/` — dated session logs (optional)

Public factory code lives in [cornershop.dev](https://github.com/cornershopdev/cornershop.dev).
Pro client apps live in [pro](https://github.com/cornershopdev/pro) (private).
EOF

  mkdir -p "${workdir}/vault/memory"
  if [[ -d "${REPO_ROOT}/.agents/memory" ]]; then
    rsync -a "${REPO_ROOT}/.agents/memory/" "${workdir}/vault/memory/"
  fi
  if [[ -d "${REPO_ROOT}/.agents/sessions" ]]; then
    mkdir -p "${workdir}/vault/sessions"
    rsync -a "${REPO_ROOT}/.agents/sessions/" "${workdir}/vault/sessions/" 2>/dev/null || true
  fi

  git -C "${workdir}/vault" add -A
  if git -C "${workdir}/vault" diff --cached --quiet; then
    echo "vault has no changes to push"
    return
  fi
  git -C "${workdir}/vault" commit -m "Seed vault from factory .agents memory"
  git -C "${workdir}/vault" push -u origin main
}

write_pro_readme() {
  if ! gh api "repos/${PRO_TARGET}" >/dev/null 2>&1; then
    return
  fi
  local workdir
  workdir="$(mktemp -d)"
  trap 'rm -rf "${workdir}"' EXIT
  gh repo clone "${PRO_TARGET}" "${workdir}/pro" -- --depth=1
  if [[ ! -f "${workdir}/pro/README.md" ]] || ! grep -q "Cornershop Pro" "${workdir}/pro/README.md" 2>/dev/null; then
    cat >"${workdir}/pro/README.md" <<'EOF'
# pro

Private monorepo for **Cornershop Pro** studio clients — product marketing sites,
owner apps (e.g. Pulse), and one-off SaaS surfaces built 1:1 with Corner Shop Labs.

| App | Role |
|---|---|
| `apps/web` | Client marketing site (may mirror Cornershop `/pro/{slug}` preview) |
| `apps/app` | Owner / ops product |
| `apps/api` | Backend when needed |

Factory engine: [cornershop.dev](https://github.com/cornershopdev/cornershop.dev)  
Operating knowledge: [vault](https://github.com/cornershopdev/vault) (private)

New clients: add under `apps/` or a named package — do not fork the public factory.
EOF
    git -C "${workdir}/pro" add README.md
    git -C "${workdir}/pro" commit -m "docs: Cornershop Pro monorepo orientation" || true
    git -C "${workdir}/pro" push origin HEAD || true
  fi
}

main() {
  create_org_if_missing
  seed_vault
  transfer_repo "${PRO_SOURCE}" "${ORG}" "pro"
  write_pro_readme
  transfer_repo "${FACTORY_SOURCE}" "${ORG}" "cornershop.dev"
  echo ""
  echo "Done. Update your local remotes if needed:"
  echo "  git remote set-url origin git@github.com:${FACTORY_TARGET}.git"
  echo ""
  echo "Repos:"
  echo "  https://github.com/${FACTORY_TARGET}"
  echo "  https://github.com/${PRO_TARGET}"
  echo "  https://github.com/${VAULT_TARGET}"
}

main "$@"

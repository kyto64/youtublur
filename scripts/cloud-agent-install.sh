#!/usr/bin/env bash
# Cursor Cloud Agent の install 用。依存を入れ、pnpm test がすぐ走るようにする。
# 冪等。シークレットは扱わない。Playwright ブラウザは入れない（下記コメント）。
# システムの /usr/local や VM 同梱 Node は上書きしない（エージェント runtime 破損防止）。

set -euo pipefail

cd "$(dirname "$0")/.."

# package.json engines: ^22.22.2 || ^24.15.0 || >=26.0.0
# .nvmrc は無い。現行 Node が満たさなければ CI Test の 22 系下限 22.22.2 を入れる。
NODE_FLOOR="22.22.2"
NODE_DIR="${HOME}/.youtublur-node"
NODE_BIN="${NODE_DIR}/bin"
PROFILE_PATH_MARKER="youtublur-cloud-agent-node-path"

satisfies_engines() {
  local node_bin="${1:-node}"
  command -v "${node_bin}" >/dev/null 2>&1 || return 1
  "${node_bin}" -e '
    const [maj, min, pat] = process.versions.node.split(".").map(Number);
    const ok =
      (maj === 22 && (min > 22 || (min === 22 && pat >= 2))) ||
      (maj === 24 && min >= 15) ||
      maj >= 26;
    process.exit(ok ? 0 : 1);
  '
}

ensure_node_path_in_shell_profile() {
  local line='export PATH="$HOME/.youtublur-node/bin:$PATH"'
  local profile
  for profile in "${HOME}/.bashrc" "${HOME}/.profile"; do
    [[ -f "${profile}" ]] || continue
    if ! grep -qF "${PROFILE_PATH_MARKER}" "${profile}" 2>/dev/null; then
      {
        echo ""
        echo "# ${PROFILE_PATH_MARKER}"
        echo "${line}"
      } >> "${profile}"
    fi
  done
}

prepend_youtublur_node_path() {
  if [[ -x "${NODE_BIN}/node" ]]; then
    export PATH="${NODE_BIN}:${PATH}"
    hash -r
  fi
}

install_node_tarball() {
  local arch
  case "$(uname -m)" in
    x86_64) arch="x64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *)
      echo "unsupported architecture: $(uname -m)" >&2
      return 1
      ;;
  esac

  if [[ -x "${NODE_BIN}/node" ]] && satisfies_engines "${NODE_BIN}/node"; then
    echo "Node.js ${NODE_FLOOR} already present at ${NODE_DIR}"
  else
    echo "Installing Node.js ${NODE_FLOOR} to ${NODE_DIR} (not touching system /usr/local)"
    mkdir -p "${NODE_DIR}"
    # 古いバージョンや壊れた展開を避ける
    rm -rf "${NODE_DIR:?}"/*
    curl -fsSL "https://nodejs.org/dist/v${NODE_FLOOR}/node-v${NODE_FLOOR}-linux-${arch}.tar.xz" \
      | tar -xJ -C "${NODE_DIR}" --strip-components=1 --no-same-owner
  fi

  prepend_youtublur_node_path
  ensure_node_path_in_shell_profile
}

# nvm は使わない。Cloud Agent の Build はディスクだけを残し、nvm の PATH は起動後に消える。
if ! satisfies_engines; then
  install_node_tarball
fi

if ! satisfies_engines; then
  echo "Node.js $(command -v node || true) $(node -v 2>/dev/null || true) does not satisfy package.json engines" >&2
  exit 1
fi

echo "node $(node -v)"

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required to activate packageManager pnpm" >&2
  exit 1
fi

# ユーザーローカル Node 利用時は sudo で system corepack を触らない
corepack enable
corepack prepare "$(node -p "require('./package.json').packageManager")" --activate
pnpm install --frozen-lockfile

# Playwright ブラウザは入れない。
# - 既定の検証は pnpm test（jsdom）でありブラウザ不要
# - E2E（pnpm run test:e2e）は UI 変更時のみ。Chromium + Firefox と OS 依存の取得は重い
# - 必要なエージェントは pnpm exec playwright install --with-deps をその場で実行する

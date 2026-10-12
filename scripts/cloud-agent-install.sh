#!/usr/bin/env bash
# Cursor Cloud Agent の install 用。依存を入れ、pnpm test がすぐ走るようにする。
# 冪等。シークレットは扱わない。Playwright ブラウザは入れない（下記コメント）。

set -euo pipefail

cd "$(dirname "$0")/.."

# package.json engines: ^22.22.2 || ^24.15.0 || >=26.0.0
# .nvmrc は無い。現行 Node が満たさなければ CI Test の 22 系下限 22.22.2 を入れる。
NODE_FLOOR="22.22.2"

satisfies_engines() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const [maj, min, pat] = process.versions.node.split(".").map(Number);
    const ok =
      (maj === 22 && (min > 22 || (min === 22 && pat >= 2))) ||
      (maj === 24 && min >= 15) ||
      maj >= 26;
    process.exit(ok ? 0 : 1);
  '
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
  echo "Installing Node.js ${NODE_FLOOR} to /usr/local"
  curl -fsSL "https://nodejs.org/dist/v${NODE_FLOOR}/node-v${NODE_FLOOR}-linux-${arch}.tar.xz" \
    | sudo tar -xJ -C /usr/local --strip-components=1 --no-same-owner
  export PATH="/usr/local/bin:${PATH}"
  hash -r
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

if [[ "$(id -u)" -eq 0 ]]; then
  corepack enable
else
  sudo corepack enable 2>/dev/null || corepack enable
fi

corepack prepare "$(node -p "require('./package.json').packageManager")" --activate
pnpm install --frozen-lockfile

# Playwright ブラウザは入れない。
# - 既定の検証は pnpm test（jsdom）でありブラウザ不要
# - E2E（pnpm run test:e2e）は UI 変更時のみ。Chromium + Firefox と OS 依存の取得は重い
# - 必要なエージェントは pnpm exec playwright install --with-deps をその場で実行する

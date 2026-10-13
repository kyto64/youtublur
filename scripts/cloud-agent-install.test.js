import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(repoRoot, 'scripts', 'cloud-agent-install.sh');
const script = readFileSync(scriptPath, 'utf8');

describe('cloud-agent-install.sh', () => {
  it('does not overwrite the VM system Node under /usr/local', () => {
    expect(script).not.toMatch(/sudo\s+tar/);
    expect(script).not.toMatch(/-C\s+\/usr\/local/);
    expect(script).not.toContain('sudo corepack');
  });

  it('installs Node under $HOME/.youtublur-node with an idempotent profile marker', () => {
    expect(script).toContain('.youtublur-node');
    expect(script).toContain('youtublur-cloud-agent-node-path');
  });

  it('appends the PATH marker only once per profile', () => {
    const home = mkdtempSync(join(tmpdir(), 'youtublur-install-'));
    const bashrc = join(home, '.bashrc');
    writeFileSync(bashrc, '# existing\n');

    const snippet = `
set -euo pipefail
PROFILE_PATH_MARKER="youtublur-cloud-agent-node-path"
ensure_node_path_in_shell_profile() {
  local line='export PATH="$HOME/.youtublur-node/bin:$PATH"'
  local profile
  for profile in "\${HOME}/.bashrc" "\${HOME}/.profile"; do
    if [[ ! -f "\${profile}" ]]; then
      touch "\${profile}"
    fi
    if ! grep -qF "\${PROFILE_PATH_MARKER}" "\${profile}" 2>/dev/null; then
      {
        echo ""
        echo "# \${PROFILE_PATH_MARKER}"
        echo "\${line}"
      } >> "\${profile}"
    fi
  done
}
ensure_node_path_in_shell_profile
ensure_node_path_in_shell_profile
`;

    const result = spawnSync('bash', ['-c', snippet], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);

    const updated = readFileSync(bashrc, 'utf8');
    const matches = updated.match(/youtublur-cloud-agent-node-path/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

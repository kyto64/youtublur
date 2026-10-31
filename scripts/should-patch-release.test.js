import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SHIPPED_ZIP_PATHS,
  collectReleaseInputs,
  decidePatchRelease,
  isReleasableCommitType,
  isReleasablePath,
  nextPatchVersion,
  parseCommitSubject,
  shouldPatchRelease,
} from './should-patch-release.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(repoRoot, 'scripts', 'should-patch-release.mjs');
const dailyWorkflow = readFileSync(
  join(repoRoot, '.github/workflows/dependabot-daily-patch-release.yml'),
  'utf8'
);
const publishWorkflow = readFileSync(join(repoRoot, '.github/workflows/publish.yml'), 'utf8');
const actionsLock = readFileSync(join(repoRoot, '.github/workflows/actions.lock'), 'utf8');

function initRepo(version = '1.12.29') {
  const dir = mkdtempSync(join(tmpdir(), 'should-patch-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init']);
  git(['config', 'user.email', 'test@example.test']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ version }, null, 2)}\n`);
  writeFileSync(join(dir, 'README.md'), 'docs\n');
  git(['add', '-A']);
  git(['commit', '-m', 'chore: initial']);
  git(['tag', `v${version}`]);
  return { dir, git };
}

function runCli(cwd) {
  const outputPath = join(cwd, 'github.output');
  writeFileSync(outputPath, '');
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: outputPath },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: readFileSync(outputPath, 'utf8'),
  };
}

describe('parseCommitSubject', () => {
  it('reads type, scopes, and breaking marker', () => {
    expect(parseCommitSubject('feat: add picker')).toEqual({
      type: 'feat',
      scopes: [],
    });
    expect(parseCommitSubject('fix(ci, docs)!: workflow')).toEqual({
      type: 'fix',
      scopes: ['ci', 'docs'],
    });
    expect(parseCommitSubject('Merge pull request #186')).toEqual({
      type: null,
      scopes: [],
    });
  });
});

describe('isReleasableCommitType', () => {
  it('accepts feat, fix, and perf unless the scope is docs/CI/tests/chore only', () => {
    expect(isReleasableCommitType('feat: color picker')).toBe(true);
    expect(isReleasableCommitType('fix: paint solid')).toBe(true);
    expect(isReleasableCommitType('perf: fewer draws')).toBe(true);
    expect(isReleasableCommitType('feat(popup): shortcuts')).toBe(true);
    expect(isReleasableCommitType('fix(deps): bump undici')).toBe(true);
    expect(isReleasableCommitType('fix(ci): dispatch publish')).toBe(false);
    expect(isReleasableCommitType('docs: update release.md')).toBe(false);
    expect(isReleasableCommitType('test: cover popup')).toBe(false);
    expect(isReleasableCommitType('chore(deps): bump jsdom')).toBe(false);
    expect(isReleasableCommitType('ci: matrix node')).toBe(false);
  });
});

describe('isReleasablePath', () => {
  it('treats shipped extension files, src, and dependency manifests as releasable', () => {
    expect(isReleasablePath('src/content.ts')).toBe(true);
    expect(isReleasablePath('manifest.json')).toBe(true);
    expect(isReleasablePath('popup.html')).toBe(true);
    expect(isReleasablePath('content.js')).toBe(true);
    expect(isReleasablePath('_locales/en/messages.json')).toBe(true);
    expect(isReleasablePath('icons/icon128.png')).toBe(true);
    expect(isReleasablePath('package.json')).toBe(true);
    expect(isReleasablePath('pnpm-lock.yaml')).toBe(true);
  });

  it('ignores docs, CI, tests, and tooling', () => {
    expect(isReleasablePath('docs/release.md')).toBe(false);
    expect(isReleasablePath('CHANGELOG.md')).toBe(false);
    expect(isReleasablePath('AGENTS.md')).toBe(false);
    expect(isReleasablePath('.github/workflows/test.yml')).toBe(false);
    expect(isReleasablePath('content.test.js')).toBe(false);
    expect(isReleasablePath('e2e/blur.spec.js')).toBe(false);
    expect(isReleasablePath('scripts/should-patch-release.mjs')).toBe(false);
    expect(isReleasablePath('playwright.config.js')).toBe(false);
  });
});

describe('shouldPatchRelease', () => {
  it('releases feat/fix/perf or shipped-file changes', () => {
    expect(shouldPatchRelease({ subjects: ['feat: picker'], paths: ['docs/x.md'] })).toBe(true);
    expect(shouldPatchRelease({ subjects: ['docs: note'], paths: ['src/popup.ts'] })).toBe(true);
    expect(shouldPatchRelease({ subjects: ['chore(deps): bump'], paths: ['package.json'] })).toBe(
      true
    );
  });

  it('skips docs, CI, tests, and chores that do not touch shipped files', () => {
    expect(
      shouldPatchRelease({
        subjects: ['docs: release notes', 'ci: speed e2e', 'test: cover blur', 'chore: lint'],
        paths: ['docs/release.md', '.github/workflows/e2e.yml', 'content.test.js'],
      })
    ).toBe(false);
    expect(shouldPatchRelease({ subjects: ['fix(ci): rename job'], paths: ['.github/x.yml'] })).toBe(
      false
    );
  });
});

describe('nextPatchVersion', () => {
  it('increments only the patch segment', () => {
    expect(nextPatchVersion('1.12.29')).toBe('1.12.30');
    expect(nextPatchVersion('1.13.0')).toBe('1.13.1');
  });

  it('rejects versions that are not major.minor.patch', () => {
    expect(() => nextPatchVersion('1.12')).toThrow(/unexpected version/);
  });
});

describe('decidePatchRelease', () => {
  it('skips when there is no v* tag', () => {
    expect(
      decidePatchRelease({ latestTag: '', subjects: ['feat: x'], paths: [], packageVersion: '1.0.0' })
    ).toMatchObject({ needRelease: false, nextVersion: '' });
  });

  it('skips non-releasable history and names the next patch when releasing', () => {
    expect(
      decidePatchRelease({
        latestTag: 'v1.12.29',
        subjects: ['docs: note'],
        paths: ['CHANGELOG.md'],
        packageVersion: '1.12.29',
      })
    ).toMatchObject({ needRelease: false, latestTag: 'v1.12.29' });
    expect(
      decidePatchRelease({
        latestTag: 'v1.12.29',
        subjects: ['feat: picker'],
        paths: ['src/popup-color.ts'],
        packageVersion: '1.12.29',
      })
    ).toEqual({
      needRelease: true,
      nextVersion: '1.12.30',
      latestTag: 'v1.12.29',
      reason: 'Releasable changes since v1.12.29; next patch 1.12.30.',
    });
  });
});

describe('should-patch-release CLI', () => {
  it('writes need_release=false when only docs changed', () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, 'README.md'), 'docs only\n');
    git(['add', '-A']);
    git(['commit', '-m', 'docs: readme']);
    const result = runCli(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No releasable commits since v1.12.29');
    expect(result.output).toContain('need_release=false');
    expect(collectReleaseInputs({ cwd: dir }).subjects).toEqual(['docs: readme']);
  });

  it('writes the next patch version when a feat commit landed', () => {
    const { dir, git } = initRepo();
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/x.ts'), 'export {}\n');
    git(['add', '-A']);
    git(['commit', '-m', 'feat: picker']);
    const result = runCli(dir);
    expect(result.status).toBe(0);
    expect(result.output).toContain('need_release=true');
    expect(result.output).toContain('next_version=1.12.30');
    expect(result.output).toContain('latest_tag=v1.12.29');
  });
});

describe('daily workflow wiring', () => {
  it('keeps workflow and job names that other workflows depend on', () => {
    expect(dailyWorkflow).toMatch(/^name: Dependabot daily patch release$/m);
    expect(dailyWorkflow).toContain('jobs:\n  patch-release:');
    expect(dailyWorkflow).toContain('  dispatch-publish:');
    expect(dailyWorkflow).toContain('needs: patch-release');
    expect(dailyWorkflow).toContain("needs.patch-release.outputs.dispatch_publish == 'true'");
  });

  it('issues a GitHub App token for master push when App secrets are set', () => {
    // SHA pinning lives in .github/workflows/actions.lock; the workflow uses the tag form.
    const tagUse = dailyWorkflow.match(/uses: (actions\/create-github-app-token@v\d+\.\d+\.\d+)$/m);
    expect(tagUse).toBeTruthy();
    const action = tagUse[1];
    const workflowKey = "'.github/workflows/dependabot-daily-patch-release.yml':";
    const workflowsSection = actionsLock.slice(
      actionsLock.indexOf('workflows:'),
      actionsLock.indexOf('dependencies:')
    );
    expect(workflowsSection).toContain(workflowKey);
    const workflowActions = workflowsSection
      .slice(workflowsSection.indexOf(workflowKey) + workflowKey.length)
      .split(/^ {4}'/m)[0];
    expect(workflowActions).toContain(`- '${action}'`);
    const dependencyKey = `'${action}':`;
    const dependenciesSection = actionsLock.slice(actionsLock.indexOf('dependencies:'));
    expect(dependenciesSection).toContain(`\n    ${dependencyKey}\n`);
    const dependencyEntry = dependenciesSection
      .slice(dependenciesSection.indexOf(dependencyKey) + dependencyKey.length)
      .split(/^ {4}'/m)[0];
    expect(dependencyEntry).toMatch(/^\s+commit: 'sha1-[0-9a-f]{40}'$/m);
    expect(dailyWorkflow).toContain('secrets.RELEASE_APP_CLIENT_ID');
    expect(dailyWorkflow).toContain('secrets.RELEASE_APP_PRIVATE_KEY');
    expect(dailyWorkflow).toContain('id: release_auth');
    expect(dailyWorkflow).toContain('permission-contents: write');
    expect(dailyWorkflow).toContain('tag_push_triggers_publish=true');
    expect(dailyWorkflow).toContain('id: release_dispatch');
    expect(dailyWorkflow).not.toContain('secrets.RELEASE_PUSH_TOKEN || github.token');
    expect(dailyWorkflow).not.toMatch(/if:.*secrets\./);
  });

  it('bumps with an explicit next patch, not pnpm run release --release-as patch', () => {
    expect(dailyWorkflow).toContain('pnpm exec commit-and-tag-version --release-as');
    expect(dailyWorkflow).toContain('steps.need.outputs.next_version');
    expect(dailyWorkflow).not.toContain('pnpm run release');
    expect(dailyWorkflow).not.toContain('--release-as patch');
  });

  it('decides with the testable script instead of a lockfile-only diff', () => {
    expect(dailyWorkflow).toContain('node scripts/should-patch-release.mjs');
    expect(dailyWorkflow).not.toContain('package.json pnpm-lock.yaml');
  });

  it('lists every publish.yml zip path as a shipped releasable path', () => {
    const zipBlock = publishWorkflow.match(/zip -r extension\.zip \\([\s\S]*?)cp extension\.zip/);
    expect(zipBlock).toBeTruthy();
    const zipPaths = [...zipBlock[1].matchAll(/^\s+(\S+)/gm)].map((match) =>
      match[1].replace(/\\$/, '')
    );
    expect(zipPaths.length).toBeGreaterThan(0);
    expect(SHIPPED_ZIP_PATHS).toEqual(zipPaths);
    for (const path of zipPaths) {
      const sample = path.endsWith('/') ? `${path}file` : path;
      expect(isReleasablePath(sample)).toBe(true);
    }
  });
});

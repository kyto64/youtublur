/**
 * Decide whether the daily patch-release workflow should cut a release.
 *
 * Release when there is a feat/fix/perf commit (not ci/docs/test/chore-only)
 * or a change to shipped extension files / dependency manifests.
 * Skip docs, CI, tests, and other chores. Always a patch bump.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RELEASABLE_TYPES = new Set(['feat', 'fix', 'perf']);
const SKIP_SCOPES = new Set(['ci', 'docs', 'doc', 'test', 'tests', 'chore']);

/** Paths included in publish.yml's extension.zip (directories keep a trailing /). */
export const SHIPPED_ZIP_PATHS = [
  'manifest.json',
  'storage-mode.js',
  'shortcut-actions.js',
  'background.js',
  'content.js',
  'style.css',
  'popup.html',
  'popup.js',
  'popup-shortcuts.js',
  'popup-color.js',
  'review-nudge.js',
  'onboarding.js',
  'welcome.html',
  'welcome.js',
  '_locales/',
  'icons/',
];

const SHIPPED_FILES = new Set(
  SHIPPED_ZIP_PATHS.filter((path) => !path.endsWith('/'))
);
const SHIPPED_DIRS = SHIPPED_ZIP_PATHS.filter((path) => path.endsWith('/'));
const DEPENDENCY_MANIFESTS = new Set(['package.json', 'pnpm-lock.yaml']);

export function parseCommitSubject(subject) {
  const match = String(subject ?? '').match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s/);
  if (!match) {
    return { type: null, scopes: [] };
  }
  const scopes = match[2]
    ? match[2].split(',').map((scope) => scope.trim().toLowerCase()).filter(Boolean)
    : [];
  return { type: match[1].toLowerCase(), scopes };
}

export function isReleasableCommitType(subject) {
  const { type, scopes } = parseCommitSubject(subject);
  if (!RELEASABLE_TYPES.has(type)) {
    return false;
  }
  if (scopes.length > 0 && scopes.every((scope) => SKIP_SCOPES.has(scope))) {
    return false;
  }
  return true;
}

export function isReleasablePath(filePath) {
  const path = String(filePath ?? '').replaceAll('\\', '/');
  if (!path) {
    return false;
  }
  if (DEPENDENCY_MANIFESTS.has(path) || SHIPPED_FILES.has(path)) {
    return true;
  }
  if (path.startsWith('src/')) {
    return true;
  }
  return SHIPPED_DIRS.some((dir) => path.startsWith(dir));
}

export function shouldPatchRelease({ subjects = [], paths = [] } = {}) {
  return subjects.some(isReleasableCommitType) || paths.some(isReleasablePath);
}

export function nextPatchVersion(version) {
  const match = String(version ?? '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`unexpected version: ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function gitLines(args, cwd) {
  const output = execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  return output === '' ? [] : output.split('\n');
}

export function collectReleaseInputs({ cwd = process.cwd() } = {}) {
  let latestTag = '';
  try {
    latestTag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    latestTag = '';
  }

  const packageVersion = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version;
  if (!latestTag) {
    return { latestTag: '', subjects: [], paths: [], packageVersion };
  }

  return {
    latestTag,
    subjects: gitLines(['log', `${latestTag}..HEAD`, '--pretty=%s'], cwd),
    paths: gitLines(['diff', '--name-only', `${latestTag}..HEAD`], cwd),
    packageVersion,
  };
}

export function decidePatchRelease(input) {
  if (!input.latestTag) {
    return {
      needRelease: false,
      nextVersion: '',
      latestTag: '',
      reason: 'No matching v* tag on master; skipping automated patch release.',
    };
  }
  if (!shouldPatchRelease(input)) {
    return {
      needRelease: false,
      nextVersion: '',
      latestTag: input.latestTag,
      reason: `No releasable commits since ${input.latestTag}; skipping release.`,
    };
  }
  const nextVersion = nextPatchVersion(input.packageVersion);
  return {
    needRelease: true,
    nextVersion,
    latestTag: input.latestTag,
    reason: `Releasable changes since ${input.latestTag}; next patch ${nextVersion}.`,
  };
}

function writeOutput(name, value) {
  const dest = process.env.GITHUB_OUTPUT;
  if (dest) {
    appendFileSync(dest, `${name}=${value}\n`);
  }
}

function main() {
  const result = decidePatchRelease(collectReleaseInputs());
  writeOutput('need_release', result.needRelease ? 'true' : 'false');
  writeOutput('next_version', result.nextVersion);
  writeOutput('latest_tag', result.latestTag);
  console.log(result.reason);
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  main();
}

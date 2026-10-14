import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PUBLISH_CHECKOUT_REF_EXPR, publishCheckoutRef } from './publish-checkout-ref.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(repoRoot, 'scripts', 'dispatch-publish.sh');
const dailyWorkflow = readFileSync(
  join(repoRoot, '.github/workflows/dependabot-daily-patch-release.yml'),
  'utf8'
);
const publishWorkflow = readFileSync(join(repoRoot, '.github/workflows/publish.yml'), 'utf8');

function fakeGh(binDir, { apiStatus = 0 } = {}) {
  const logPath = join(binDir, 'gh-args.log');
  const ghPath = join(binDir, 'gh');
  const quotedLog = JSON.stringify(logPath);
  writeFileSync(logPath, '');
  writeFileSync(
    ghPath,
    [
      '#!/bin/sh',
      `printf '%s\\n' "$@" >> ${quotedLog}`,
      `echo '---' >> ${quotedLog}`,
      'if [ "$1" = "api" ]; then',
      `  exit ${apiStatus}`,
      'fi',
      'if [ "$1" = "workflow" ] && [ "$2" = "run" ]; then',
      '  exit 0',
      'fi',
      'echo "unexpected gh invocation" >&2',
      'exit 1',
      '',
    ].join('\n')
  );
  chmodSync(ghPath, 0o755);
  return logPath;
}

function runDispatch(env, { apiStatus = 0 } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'dispatch-gh-'));
  const logPath = fakeGh(binDir, { apiStatus });
  const result = spawnSync('bash', [scriptPath], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'kyto64/youtublur',
      RELEASE_PUSH_TOKEN: '',
      DRY_RUN: '',
      DISPATCH_TAG_ATTEMPTS: '3',
      DISPATCH_TAG_RETRY_SECONDS: '0',
      ...env,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    log: readFileSync(logPath, 'utf8'),
  };
}

describe('dispatch-publish.sh', () => {
  it('prints the workflow_dispatch command and does not call gh on dry-run', () => {
    const result = runDispatch({ TAG: 'v1.12.29', DRY_RUN: '1' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'dry-run: gh workflow run publish.yml --ref master -f tag=v1.12.29 -f build_from_tag=true'
    );
    expect(result.log).toBe('');
  });

  it('does not dispatch when RELEASE_PUSH_TOKEN is set', () => {
    const result = runDispatch({ TAG: 'v1.12.29', RELEASE_PUSH_TOKEN: 'pat-present', DRY_RUN: '1' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Not dispatching');
    expect(result.stdout).not.toContain('dry-run:');
    expect(result.log).toBe('');
  });

  it('dispatches publish.yml from master with the tag and build_from_tag=true', () => {
    const result = runDispatch({ TAG: 'v1.12.29' });
    expect(result.status).toBe(0);
    expect(result.log).toContain('workflow\nrun\npublish.yml\n--ref\nmaster\n-f\ntag=v1.12.29\n-f\nbuild_from_tag=true\n');
  });

  it('refuses tags that are not a release tag', () => {
    const result = runDispatch({ TAG: 'v1.12.29-rc.1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected tag');
    expect(result.log).toBe('');
  });

  it('does not dispatch when the tag is not on origin', () => {
    const result = runDispatch({ TAG: 'v1.12.29' }, { apiStatus: 1 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not on origin');
    expect(result.log).not.toContain('workflow\nrun\n');
  });
});

describe('daily workflow wiring', () => {
  const dispatchJob = dailyWorkflow.split('\n  dispatch-publish:')[1];
  const releaseJob = dailyWorkflow.split('\n  dispatch-publish:')[0];

  it('keeps version bump and publish dispatch in separate jobs', () => {
    expect(dispatchJob).toBeTruthy();
    expect(releaseJob).not.toContain('gh workflow run');
    expect(releaseJob).not.toContain('actions: write');
    expect(dispatchJob).toContain('needs: patch-release');
    expect(dispatchJob).toContain("needs.patch-release.outputs.dispatch_publish == 'true'");
    expect(dispatchJob).toContain("needs.patch-release.outputs.tag != ''");
    expect(dispatchJob).toContain('actions: write');
    expect(dispatchJob).toContain('contents: read');
    expect(dispatchJob).toContain('ref: master');
    expect(dispatchJob).toContain('bash scripts/dispatch-publish.sh');
    expect(dispatchJob).not.toContain('RELEASE_PUSH_TOKEN');
    expect(dispatchJob).toContain('TAG: ${{ needs.patch-release.outputs.tag }}');
  });
});

describe('publish checkout ref', () => {
  it('matches the expression in publish.yml', () => {
    expect(publishWorkflow).toContain(PUBLISH_CHECKOUT_REF_EXPR);
  });

  it('builds automated dispatch from the tag, not master HEAD', () => {
    expect(
      publishCheckoutRef({
        eventName: 'workflow_dispatch',
        buildFromTag: true,
        tag: 'v1.12.29',
        githubRef: 'refs/heads/master',
      })
    ).toBe('refs/tags/v1.12.29');
    expect(
      publishCheckoutRef({
        eventName: 'workflow_dispatch',
        buildFromTag: 'true',
        tag: 'v1.12.29',
        githubRef: 'refs/heads/master',
      })
    ).toBe('refs/tags/v1.12.29');
  });

  it('builds a manual retry from master when build_from_tag is false', () => {
    expect(
      publishCheckoutRef({
        eventName: 'workflow_dispatch',
        buildFromTag: false,
        tag: 'v1.12.29',
        githubRef: 'refs/heads/master',
      })
    ).toBe('refs/heads/master');
  });

  it('keeps tag-push runs on the pushed tag ref', () => {
    expect(
      publishCheckoutRef({
        eventName: 'push',
        buildFromTag: false,
        tag: '',
        githubRef: 'refs/tags/v1.12.29',
      })
    ).toBe('refs/tags/v1.12.29');
  });
});

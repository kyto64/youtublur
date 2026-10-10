import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAJOR_HOLD_COMMENT_MARKER,
  hasMajorHoldLabel,
  isDependabotLogin,
  isSemverMajorUpdate,
  parseUpdateMajors,
  selectDependabotUpdate,
  shouldPostMajorHoldComment,
} from './dependabot-merge.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const summary = 'Bumps [commit-and-tag-version](https://example.test) from 13.2.0 to 13.2.1.';
const majorSummary = 'Bumps [jsdom](https://example.test) from 29.1.1 to 30.0.0.';
const triageWorkflow = readFileSync(
  join(repoRoot, '.github/workflows/dependabot-auto-merge.yml'),
  'utf8'
);
const mergeWorkflow = readFileSync(
  join(repoRoot, '.github/workflows/dependabot-merge-after-checks.yml'),
  'utf8'
);

describe('isDependabotLogin', () => {
  it('accepts both gh CLI and REST author logins', () => {
    expect(isDependabotLogin('app/dependabot')).toBe(true);
    expect(isDependabotLogin('dependabot[bot]')).toBe(true);
  });

  it('rejects other authors', () => {
    expect(isDependabotLogin('kyto64')).toBe(false);
    expect(isDependabotLogin('github-actions[bot]')).toBe(false);
    expect(isDependabotLogin(undefined)).toBe(false);
  });
});

describe('parseUpdateMajors', () => {
  it('reads the first from/to sentence', () => {
    const body = `${summary}\nLater note from 9.0.0 to 8.0.0 should not win.`;
    expect(parseUpdateMajors(body)).toEqual({ oldMajor: '13', newMajor: '13' });
  });

  it('treats a 0.x minor bump as the same major', () => {
    expect(parseUpdateMajors('Bumps [@types/chrome](https://example.test) from 0.2.9 to 0.3.0.')).toEqual({
      oldMajor: '0',
      newMajor: '0',
    });
  });

  it('returns null when versions are missing', () => {
    expect(parseUpdateMajors('No version sentence here.')).toBeNull();
  });
});

describe('isSemverMajorUpdate', () => {
  it('is true only when the parsed majors differ', () => {
    expect(isSemverMajorUpdate(summary)).toBe(false);
    expect(isSemverMajorUpdate(majorSummary)).toBe(true);
    expect(isSemverMajorUpdate('')).toBe(false);
  });
});

describe('hasMajorHoldLabel', () => {
  it('matches the triage labels', () => {
    expect(hasMajorHoldLabel([{ name: 'dependencies' }, { name: 'needs-ai-review' }])).toBe(true);
    expect(hasMajorHoldLabel([{ name: 'dependency-major' }])).toBe(true);
    expect(hasMajorHoldLabel([{ name: 'dependencies' }])).toBe(false);
    expect(hasMajorHoldLabel(undefined)).toBe(false);
  });
});

describe('shouldPostMajorHoldComment', () => {
  it('posts once when the marker is absent', () => {
    expect(shouldPostMajorHoldComment([])).toBe(true);
    expect(shouldPostMajorHoldComment([{ body: 'unrelated' }])).toBe(true);
    expect(shouldPostMajorHoldComment([{ body: `note ${MAJOR_HOLD_COMMENT_MARKER}` }])).toBe(false);
    expect(shouldPostMajorHoldComment(undefined)).toBe(true);
  });
});

describe('selectDependabotUpdate', () => {
  it('selects a gh CLI Dependabot patch update', () => {
    expect(selectDependabotUpdate([
      { number: 164, author: { login: 'app/dependabot' }, body: summary },
    ])).toEqual({ action: 'merge', number: 164 });
  });

  it('selects a REST-style Dependabot minor update', () => {
    expect(selectDependabotUpdate([
      {
        number: 163,
        author: { login: 'dependabot[bot]' },
        body: 'Bumps [@types/chrome](https://example.test) from 0.2.9 to 0.3.0.',
      },
    ])).toEqual({ action: 'merge', number: 163 });
  });

  it('skips semver major updates from the body', () => {
    expect(selectDependabotUpdate([
      {
        number: 9,
        author: { login: 'app/dependabot' },
        body: majorSummary,
      },
    ])).toEqual({ action: 'skip', reason: 'semver-major', number: 9 });
  });

  it('skips when a major-hold label is present even if the body looks like a patch', () => {
    expect(selectDependabotUpdate([
      {
        number: 11,
        author: { login: 'app/dependabot' },
        body: summary,
        labels: [{ name: 'dependency-major' }],
      },
    ])).toEqual({ action: 'skip', reason: 'semver-major', number: 11 });
  });

  it('skips when the author is not Dependabot', () => {
    expect(selectDependabotUpdate([
      { number: 84, author: { login: 'kyto64' }, body: summary },
    ])).toEqual({ action: 'skip', reason: 'no-dependabot-pr' });
  });

  it('skips when versions cannot be read', () => {
    expect(selectDependabotUpdate([
      { number: 7, author: { login: 'app/dependabot' }, body: '' },
    ])).toEqual({ action: 'skip', reason: 'unknown-version', number: 7 });
  });

  it('skips an empty list', () => {
    expect(selectDependabotUpdate([])).toEqual({ action: 'skip', reason: 'no-dependabot-pr' });
    expect(selectDependabotUpdate(null)).toEqual({ action: 'skip', reason: 'no-dependabot-pr' });
  });
});

describe('dependabot-merge CLI', () => {
  it('prints a merge decision for app/dependabot JSON on stdin', () => {
    const script = join(process.cwd(), 'scripts/dependabot-merge.mjs');
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify([
        { number: 164, author: { login: 'app/dependabot' }, body: summary },
      ]),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ action: 'merge', number: 164 });
  });
});

describe('Dependabot triage workflow', () => {
  it('keeps the workflow name other jobs depend on', () => {
    expect(triageWorkflow).toMatch(/^name: Dependabot triage$/m);
    expect(mergeWorkflow).toMatch(/^name: Merge Dependabot update after checks$/m);
  });

  it('approves only patch and minor via fetch-metadata update-type', () => {
    const automerge = triageWorkflow.slice(triageWorkflow.indexOf('automerge:'));
    expect(automerge).toContain("version-update:semver-patch");
    expect(automerge).toContain("version-update:semver-minor");
    expect(automerge).not.toContain("version-update:semver-major");
  });

  it('holds majors with labels, a kyto64 review request, and an idempotent comment', () => {
    expect(triageWorkflow).toContain('notify-major:');
    expect(triageWorkflow).toContain("needs.metadata.outputs.update-type == 'version-update:semver-major'");
    expect(triageWorkflow).toContain('needs-ai-review');
    expect(triageWorkflow).toContain('dependency-major');
    expect(triageWorkflow).toContain('--add-reviewer kyto64');
    expect(triageWorkflow).toContain(MAJOR_HOLD_COMMENT_MARKER);
    expect(mergeWorkflow).toContain('--json number,author,body,labels');
  });
});

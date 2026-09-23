import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isDependabotLogin,
  parseUpdateMajors,
  selectDependabotUpdate,
} from './dependabot-merge.mjs';

const summary = 'Bumps [commit-and-tag-version](https://example.test) from 13.2.0 to 13.2.1.';

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

  it('skips semver major updates', () => {
    expect(selectDependabotUpdate([
      {
        number: 9,
        author: { login: 'app/dependabot' },
        body: 'Bumps [jsdom](https://example.test) from 29.1.1 to 30.0.0.',
      },
    ])).toEqual({ action: 'skip', reason: 'semver-major', number: 9 });
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

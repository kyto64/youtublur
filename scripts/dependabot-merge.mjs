/**
 * Decide whether an open pull request is an eligible Dependabot patch/minor update.
 *
 * `gh pr list --json author` reports GitHub Apps as `app/dependabot`.
 * `pull_request` events and the REST API still use `dependabot[bot]`.
 * Both logins are the same bot; matching only one of them skips every PR.
 *
 * Semver-major PRs are never selected here. The triage workflow labels them
 * from Dependabot `fetch-metadata` (`version-update:semver-major`). An
 * assistant outside CI does the risk review and merges low-risk majors.
 * This script also skips a body `from X to Y` major bump so a missing label
 * cannot merge.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEPENDABOT_LOGINS = new Set(['dependabot[bot]', 'app/dependabot']);

export const MAJOR_HOLD_LABELS = new Set(['needs-ai-review', 'dependency-major']);

export const MAJOR_HOLD_COMMENT_MARKER = '<!-- dependabot-major-hold -->';

export function isDependabotLogin(login) {
  return DEPENDABOT_LOGINS.has(login);
}

/**
 * Major versions from Dependabot's opening "from X to Y" sentence.
 * Returns null when the body does not contain that sentence.
 */
export function parseUpdateMajors(body) {
  const match = String(body ?? '').match(
    /from (\d+)(?:\.\d+)?(?:\.\d+)?\s+to\s+(\d+)(?:\.\d+)?(?:\.\d+)?/
  );
  if (!match) return null;
  return { oldMajor: match[1], newMajor: match[2] };
}

export function isSemverMajorUpdate(body) {
  const majors = parseUpdateMajors(body);
  return Boolean(majors && majors.oldMajor !== majors.newMajor);
}

export function hasMajorHoldLabel(labels) {
  const list = Array.isArray(labels) ? labels : [];
  return list.some((label) => MAJOR_HOLD_LABELS.has(label?.name));
}

export function shouldPostMajorHoldComment(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return !list.some((comment) => String(comment?.body ?? '').includes(MAJOR_HOLD_COMMENT_MARKER));
}

/**
 * @param {unknown} pulls `gh pr list --json number,author,body,labels` payload
 * @returns {{ action: 'merge', number: number } | { action: 'skip', reason: string, number?: number }}
 */
export function selectDependabotUpdate(pulls) {
  const list = Array.isArray(pulls) ? pulls : [];
  const pr = list.find((item) => isDependabotLogin(item?.author?.login));
  if (!pr || typeof pr.number !== 'number') {
    return { action: 'skip', reason: 'no-dependabot-pr' };
  }

  if (hasMajorHoldLabel(pr.labels) || isSemverMajorUpdate(pr.body)) {
    return { action: 'skip', reason: 'semver-major', number: pr.number };
  }

  const majors = parseUpdateMajors(pr.body);
  if (!majors) {
    return { action: 'skip', reason: 'unknown-version', number: pr.number };
  }
  return { action: 'merge', number: pr.number };
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const raw = readFileSync(0, 'utf8');
  const pulls = raw.trim() === '' ? [] : JSON.parse(raw);
  process.stdout.write(`${JSON.stringify(selectDependabotUpdate(pulls))}\n`);
}

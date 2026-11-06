import { describe, it, expect } from 'vitest';
import { buildIssueBody, ISSUE_TITLE } from './scripts/dom-watch-issue.mjs';

const ctx = { runUrl: 'https://github.com/kyto64/youtublur/actions/runs/1', date: '2026-01-01T00:00:00Z' };
const okReport = { name: 'live-watch', pageKind: 'watch', live: true, url: 'u', attempts: 1, ok: true, failures: [], warnings: [], results: [] };

describe('dom-watch-issue', () => {
  it('タイトルは固定', () => {
    expect(ISSUE_TITLE).toBe('YouTube DOM 変化の疑い');
  });

  it('全て OK なら本文を作らない（issue を作らない）', () => {
    expect(buildIssueBody([okReport], ctx)).toBeNull();
  });

  it('blocked（bot 判定）は DOM 変化の issue にしない', () => {
    const blocked = { ...okReport, ok: false, blocked: 'bot 判定ページ', failures: [] };
    expect(buildIssueBody([blocked], ctx)).toBeNull();
  });

  it('失敗したセレクタ・URL・artifact を本文に含め、fixture との差を示す', () => {
    const failed = {
      ...okReport,
      ok: false,
      url: 'https://www.youtube.com/watch?v=x',
      finalUrl: 'https://www.youtube.com/watch?v=x',
      screenshot: 'live-watch.png',
      domSnippet: 'live-watch.dom.txt',
      failures: [{ target: '#movie_player', kind: 'required', ok: false, count: 0, why: 'コンテナ' }],
    };
    const fixture = { name: 'fixture-watch', pageKind: 'watch', live: false, ok: true, attempts: 1, failures: [], warnings: [], results: [{ target: '#movie_player', count: 1 }] };
    const body = buildIssueBody([failed, fixture], ctx);
    expect(body).toContain('`#movie_player`');
    expect(body).toContain('https://www.youtube.com/watch?v=x');
    expect(body).toContain('live-watch.png');
    expect(body).toContain('live-watch.dom.txt');
    expect(body).toContain(ctx.runUrl);
    expect(body).toContain('fixture は契約を満たしているのに live は満たしていません');
  });
});

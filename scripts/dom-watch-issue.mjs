#!/usr/bin/env node
// YouTube DOM 定期チェック（.github/workflows/youtube-dom-watch.yml）の結果から、
// issue「YouTube DOM 変化の疑い」を開く、または既存の open issue にコメントする。
// 失敗が無いときは何もしない（issue も作らない）。PR CI には関与しない。
//
// 使い方: node scripts/dom-watch-issue.mjs [--dry-run] [results-dir]
// 環境変数: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID（Actions が渡す）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ISSUE_TITLE = 'YouTube DOM 変化の疑い';

/** @param {string} reportDir */
export function loadReports(reportDir) {
  if (!fs.existsSync(reportDir)) return [];
  return fs
    .readdirSync(reportDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(reportDir, f), 'utf8')));
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * live に失敗があるときの issue 本文（Markdown）を作る。失敗が無ければ null。
 * 失敗した fixture レポートがあるときも（fixture が契約から乖離）本文を作る。
 * @param {object[]} reports
 * @param {{ runUrl: string, date?: string }} ctx
 */
export function buildIssueBody(reports, ctx) {
  // blocked（bot 判定など実行環境側の問題）は DOM 変化ではないので、この issue の対象にしない。
  const failed = reports.filter((r) => !r.ok && !r.blocked);
  if (failed.length === 0) return null;

  const fixtureByKind = new Map(reports.filter((r) => !r.live).map((r) => [r.pageKind, r]));
  const lines = [];
  lines.push(`実 YouTube の DOM が、拡張が依存するセレクタ/構造の契約と一致しませんでした。（${ctx.date ?? new Date().toISOString()}）`);
  lines.push('');
  lines.push(`- ワークフロー実行: ${ctx.runUrl}`);
  lines.push(`- artifact（スクリーンショット・DOM スニペット・レポート JSON）: 上の実行ページの Artifacts「youtube-dom-watch」`);
  lines.push('- 契約の定義: `e2e/dom-watch/youtube-dom-contract.js`（`src/content.ts` / `style.css` と unit test で同期）');
  lines.push('');

  for (const r of failed) {
    lines.push(`## ${r.live ? 'live' : 'fixture'}: ${r.pageKind}（\`${r.name}\`）`);
    lines.push('');
    lines.push(`- ページ URL: ${r.url}`);
    lines.push(`- 最終 URL: ${r.finalUrl ?? '(不明)'}`);
    lines.push(`- 試行回数: ${r.attempts}/3`);
    if (r.error) lines.push(`- エラー: \`${cell(r.error).slice(0, 300)}\``);
    if (r.screenshot) lines.push(`- スクリーンショット: artifact の \`${r.screenshot}\``);
    if (r.domSnippet) lines.push(`- DOM スニペット: artifact の \`${r.domSnippet}\``);
    lines.push('');
    if (r.failures.length > 0) {
      const fixture = r.live ? fixtureByKind.get(r.pageKind) : undefined;
      lines.push('| 失敗したセレクタ/構造 | 一致数 | fixture の一致数 | 用途 |');
      lines.push('| --- | --- | --- | --- |');
      for (const f of r.failures) {
        const fx = fixture?.results?.find((x) => x.target === f.target);
        lines.push(`| \`${cell(f.target)}\` | ${f.count} | ${fx ? fx.count : '-'} | ${cell(f.why)} |`);
      }
      lines.push('');
      if (r.live && fixtureByKind.get(r.pageKind)?.ok) {
        lines.push('> fixture は契約を満たしているのに live は満たしていません。fixture（`e2e/youtube-fixture.js`）が実 YouTube から乖離した可能性があります。');
        lines.push('');
      }
    }
    if (r.warnings?.length) {
      lines.push(`optional で見つからなかったセレクタ（警告）: ${r.warnings.map((w) => `\`${w.target}\``).join(', ')}`);
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('_Claude Code が追加した定期チェック `youtube-dom-watch` により自動作成/更新されました。_');
  return lines.join('\n');
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

/** 同名の open issue の番号。無ければ null。 */
export function findOpenIssue(repo) {
  const out = gh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title', '--limit', '20']);
  const hit = JSON.parse(out).find((i) => i.title === ISSUE_TITLE);
  return hit ? hit.number : null;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const resultsDir = args.find((a) => !a.startsWith('--')) ?? 'dom-watch-results';
  const repo = process.env.GITHUB_REPOSITORY ?? 'kyto64/youtublur';
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const runUrl = process.env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : '(ローカル実行)';

  const reports = loadReports(path.join(resultsDir, 'report'));
  if (reports.length === 0) {
    // レポートが 1 つも無い = テストが起動すらできなかった。検知失敗として扱う。
    reports.push({ name: 'no-report', pageKind: 'watch', live: true, url: '(なし)', attempts: 0, ok: false, blocked: 'レポートが生成されなかった（Playwright の起動/インストール失敗の可能性）', failures: [], warnings: [] });
  }
  // 環境側の問題で DOM を評価できなかったページは issue にせず、ログと run のサマリに出す（run 自体は赤になる）。
  for (const r of reports.filter((x) => x.blocked)) {
    const msg = `[blocked] ${r.name}: ${r.blocked}（DOM は評価できていないため「DOM 変化」の issue は作りません）`;
    console.log(msg);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${msg}\n`);
  }
  const body = buildIssueBody(reports, { runUrl });
  if (!body) {
    console.log('DOM contract OK: issue は作成しません。');
    return;
  }
  if (dryRun) {
    console.log(body);
    return;
  }
  const existing = findOpenIssue(repo);
  if (existing) {
    gh(['issue', 'comment', String(existing), '--repo', repo, '--body', body]);
    console.log(`既存 issue #${existing} にコメントしました。`);
  } else {
    const url = gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', body]).trim();
    console.log(`issue を作成しました: ${url}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

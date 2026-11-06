// 実 YouTube DOM 契約（e2e/dom-watch/youtube-dom-contract.js）が、拡張のコード（src/content.ts, style.css）と
// ずれていないことを確認する。セレクタを追加・削除したのに契約を直し忘れる、という重複リストのドリフトを防ぐ。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SELECTORS, EXTENSION_OWNED } = require('./e2e/dom-watch/youtube-dom-contract.js');

const root = __dirname;
const contentSrc = fs.readFileSync(path.join(root, 'src/content.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const e2eSrc = ['e2e/helpers.js', 'e2e/shorts.spec.js', 'e2e/youtube-fixture.js']
  .map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('\n');

const isExtensionOwned = (s) => EXTENSION_OWNED.some((re) => re.test(s));

/** src/content.ts の querySelector / querySelectorAll('...') のリテラル（YouTube 由来のみ）。 */
function extractContentSelectors() {
  const found = new Set();
  for (const m of contentSrc.matchAll(/querySelector(?:All)?\(\s*'([^']+)'\s*\)/g)) {
    if (!isExtensionOwned(m[1])) found.add(m[1]);
  }
  return found;
}

/** style.css のセレクタ中の YouTube 由来のトークン（#id / .class / ytd-* タグ）。 */
function extractCssTokens() {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Set();
  // 宣言ブロックの手前（セレクタ部）だけを見る。
  for (const m of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const selectorText = m[1].replace(/\[[^\]]*\]/g, ''); // 属性セレクタは拡張自前の data-yt-* のみ
    for (const t of selectorText.matchAll(/(?:#[\w-]+|\.[\w-]+|\bytd-[\w-]+)/g)) {
      if (!isExtensionOwned(t[0])) found.add(t[0]);
    }
  }
  return found;
}

/** 契約のセレクタ文字列に含まれるトークン集合。 */
function contractTokens(source) {
  const tokens = new Set();
  for (const s of SELECTORS.filter((x) => x.source === source)) {
    for (const t of s.selector.matchAll(/(?:#[\w-]+|\.[\w-]+|\bytd-[\w-]+)/g)) tokens.add(t[0]);
  }
  return tokens;
}

describe('youtube-dom-contract', () => {
  it('src/content.ts の querySelector リテラルが全て契約にある', () => {
    const contractSelectors = new Set(SELECTORS.filter((s) => s.source === 'src/content.ts').map((s) => s.selector));
    for (const sel of extractContentSelectors()) {
      // 'video' は getVideoElement の container.querySelector('video')。契約では '#movie_player video' / 'video'。
      const covered =
        contractSelectors.has(sel) || [...contractSelectors].some((c) => c === sel || c.endsWith(` ${sel}`));
      expect(covered, `src/content.ts の ${sel} が契約（source: 'src/content.ts'）に無い`).toBe(true);
    }
  });

  it('契約の source: src/content.ts は実際にコードに現れる', () => {
    for (const s of SELECTORS.filter((x) => x.source === 'src/content.ts')) {
      // 契約は複合（"#movie_player video"）もあるので、最後の単純セレクタがコードにあることを見る。
      const simple = s.selector.split(/\s+/).pop();
      expect(contentSrc.includes(`'${simple}'`), `${s.selector} の ${simple} が src/content.ts に無い`).toBe(true);
    }
  });

  it('style.css の YouTube 由来のセレクタが全て契約にある（optional 含む）', () => {
    const tokens = contractTokens('style.css');
    const missing = [...extractCssTokens()].filter((t) => !tokens.has(t));
    // .html5-video-player は src/content.ts 側の契約で持つ。
    const contentTokens = contractTokens('src/content.ts');
    expect(missing.filter((t) => !contentTokens.has(t))).toEqual([]);
  });

  it('契約の source: style.css は実際に style.css に現れる', () => {
    for (const s of SELECTORS.filter((x) => x.source === 'style.css')) {
      expect(css.includes(s.selector), `${s.selector} が style.css に無い`).toBe(true);
    }
  });

  it("契約の source: e2e は e2e のコードに現れる（'ytd-shorts', '.ytp-size-button' など）", () => {
    for (const s of SELECTORS.filter((x) => x.source === 'e2e')) {
      const simple = s.selector.split(/\s+/).pop().replace(/^ytd-video-renderer\s*/, '');
      const idOrTag = simple.replace(/^#/, '');
      expect(
        e2eSrc.includes(s.selector) || e2eSrc.includes(idOrTag) || e2eSrc.includes(simple),
        `${s.selector} が e2e コードに無い`
      ).toBe(true);
    }
  });

  it('同じセレクタ・ページ種別の重複が無い', () => {
    const keys = SELECTORS.flatMap((s) => s.pages.map((p) => `${p}:${s.selector}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

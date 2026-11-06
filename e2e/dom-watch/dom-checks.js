/**
 * 契約（youtube-dom-contract.js）をページに当てて結果を返す共通ロジック。
 * ローカル fixture（PR の E2E）と実 YouTube（定期チェック）で同じ関数を使い、比較可能にする。
 */
const { SELECTORS, RELATIONS } = require('./youtube-dom-contract');

/**
 * @typedef {object} CheckResult
 * @property {'selector'|'relation'} type
 * @property {string} target 失敗時に issue へ出すセレクタ（relation は "ancestor >> descendant"）
 * @property {'required'|'optional'} kind
 * @property {boolean} ok
 * @property {number} count 一致した要素数
 * @property {string} why
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {'watch'|'shorts'|'results'} pageKind
 * @param {{ fixture: boolean }} mode fixture=true のときは fixture 対象の項目だけ検査する
 * @returns {Promise<CheckResult[]>}
 */
async function evaluateContract(page, pageKind, mode) {
  const selectors = SELECTORS.filter((s) => s.pages.includes(pageKind) && (!mode.fixture || s.fixture));
  const relations = RELATIONS.filter((r) => r.pages.includes(pageKind) && (!mode.fixture || r.fixture));

  const raw = await page.evaluate(
    ({ selectors: sels, relations: rels }) => {
      const count = (sel) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch {
          return -1;
        }
      };
      return {
        selectors: sels.map((s) => ({ selector: s.selector, count: count(s.selector) })),
        relations: rels.map((r) => {
          let n = 0;
          try {
            for (const a of document.querySelectorAll(r.ancestor)) {
              n += a.querySelectorAll(r.descendant).length;
            }
          } catch {
            n = -1;
          }
          return { ancestor: r.ancestor, descendant: r.descendant, count: n };
        }),
      };
    },
    {
      selectors: selectors.map(({ selector }) => ({ selector })),
      relations: relations.map(({ ancestor, descendant }) => ({ ancestor, descendant })),
    }
  );

  /** @type {CheckResult[]} */
  const results = [];
  selectors.forEach((spec, i) => {
    const count = raw.selectors[i].count;
    results.push({
      type: 'selector',
      target: spec.selector,
      kind: spec.kind,
      ok: count > 0,
      count,
      why: spec.why,
    });
  });
  relations.forEach((spec, i) => {
    const count = raw.relations[i].count;
    results.push({
      type: 'relation',
      target: `${spec.ancestor} >> ${spec.descendant}`,
      kind: 'required',
      ok: count > 0,
      count,
      why: spec.why,
    });
  });
  return results;
}

/** 失敗（required で ok=false）だけを返す。 */
function requiredFailures(results) {
  return results.filter((r) => r.kind === 'required' && !r.ok);
}

/** optional で見つからなかったもの（警告）。 */
function optionalMisses(results) {
  return results.filter((r) => r.kind === 'optional' && !r.ok);
}

/**
 * 拡張が依存する theme 判定の入口（html[dark] / [theme=dark] / --yt-spec-base-background）。
 * どれか 1 つでも観測できれば OK（detectYouTubeTheme は prefers-color-scheme にもフォールバックするが、
 * YouTube 側の指標が全部消えたら変化として扱う）。
 * @param {import('@playwright/test').Page} page
 */
async function evaluateThemeSignals(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const cssVar = getComputedStyle(html).getPropertyValue('--yt-spec-base-background').trim();
    const hasDarkAttr = html.hasAttribute('dark') || html.getAttribute('theme') === 'dark';
    return { hasDarkAttr, cssVar, ok: hasDarkAttr || cssVar.length > 0 };
  });
}

module.exports = { evaluateContract, requiredFailures, optionalMisses, evaluateThemeSignals };

/**
 * 拡張が実 YouTube の DOM に依存している箇所の「契約」。DOM 定期チェック
 * （.github/workflows/youtube-dom-watch.yml）と、ローカル fixture（e2e/youtube-fixture.js）の
 * 両方が同じこの契約を満たすことを検証する（単一の正）。
 *
 * ドリフト防止: youtube-dom-contract.test.js が、src/content.ts の querySelector 引数と
 * style.css のセレクタから YouTube 由来のものを抽出し、この契約と突き合わせる。
 * src / CSS にセレクタを足したらこのファイルにも足さないと unit test が落ちる。
 *
 * kinds:
 *   - 'required': 無いと拡張が動かない。live で無ければ「DOM 変化の疑い」。
 *   - 'optional': レイアウトによって有無が変わる。無くても失敗にはせず警告として報告する。
 * fixture: true の項目は fixture も満たさなければならない（false は実 YouTube 専用）。
 * source: セレクタが使われている場所。'src/content.ts' / 'style.css' は unit test が文字列として存在を確認する。
 *         'e2e' は E2E ヘルパーだけが使う（拡張本体は依存しない）。
 */

/** @typedef {'watch'|'shorts'|'results'} PageKind */
/**
 * @typedef {object} SelectorSpec
 * @property {string} selector CSS セレクタ（そのまま querySelector に渡せること）
 * @property {PageKind[]} pages どのページで検査するか
 * @property {'required'|'optional'} kind
 * @property {boolean} fixture fixture も満たすべきか
 * @property {'src/content.ts'|'style.css'|'e2e'} source
 * @property {string} why 何のために必要か（issue に出す説明）
 */

/** @type {SelectorSpec[]} */
const SELECTORS = [
  {
    selector: '#movie_player',
    pages: ['watch'],
    kind: 'required',
    fixture: true,
    source: 'src/content.ts',
    why: 'blur canvas を挿入するプレイヤーコンテナ（getPlayerContainer の第一候補）',
  },
  {
    selector: '.html5-video-player',
    pages: ['watch', 'shorts'],
    kind: 'required',
    fixture: true,
    source: 'src/content.ts',
    why: 'getPlayerContainer のフォールバック。単色/ブラーの data 属性を付けるクラス（style.css も参照）',
  },
  {
    selector: '#movie_player video',
    pages: ['watch'],
    kind: 'required',
    fixture: true,
    source: 'src/content.ts',
    why: 'ブラーの描画元 video 要素（getVideoElement が container.querySelector("video") で取得）',
  },
  {
    selector: 'video',
    pages: ['shorts'],
    kind: 'required',
    fixture: false,
    source: 'src/content.ts',
    why: 'Shorts の video 要素（.html5-video-player 配下）',
  },
  {
    selector: 'ytd-player',
    pages: ['watch'],
    kind: 'required',
    fixture: true,
    source: 'style.css',
    why: '透明化する背景のプレイヤーラッパー（style.css の ytd-player:has(...)）',
  },
  {
    selector: '#player-container',
    pages: ['watch'],
    kind: 'optional',
    fixture: false,
    source: 'style.css',
    why: '透明化する背景のプレイヤーコンテナ（style.css）。レイアウトにより有無が変わる',
  },
  {
    selector: '#player-full-bleed-container',
    pages: ['watch'],
    kind: 'optional',
    fixture: false,
    source: 'style.css',
    why: 'シアター/フルブリード時の背景コンテナ（style.css）。通常レイアウトでは存在しない',
  },
  {
    selector: '#player-container-inner',
    pages: ['watch'],
    kind: 'optional',
    fixture: false,
    source: 'style.css',
    why: '影を付けるプレイヤー内側コンテナ（style.css）',
  },
  {
    selector: '#ytd-player',
    pages: ['watch'],
    kind: 'required',
    fixture: true,
    source: 'e2e',
    why: 'E2E の waitForWatchPlayer が待つ要素（ytd-player の id）',
  },
  {
    selector: '.ytp-size-button',
    pages: ['watch'],
    kind: 'required',
    fixture: true,
    source: 'e2e',
    why: 'E2E がシアター切替に使うボタン（拡張本体は依存しない）',
  },
  {
    selector: 'ytd-shorts',
    pages: ['shorts'],
    kind: 'required',
    fixture: false,
    source: 'e2e',
    why: 'Shorts のルート要素（shorts.spec.js が待つ）',
  },
  {
    selector: 'ytd-video-renderer a#video-title',
    pages: ['results'],
    kind: 'required',
    fixture: true,
    source: 'e2e',
    why: 'SPA 遷移の起点リンク（issue #107 の再現経路 navigateToWatchViaSpa）',
  },
  {
    selector: 'ytd-video-renderer a#thumbnail',
    pages: ['results'],
    kind: 'required',
    fixture: true,
    source: 'e2e',
    why: 'SPA 遷移の起点リンク（同上のフォールバック）',
  },
];

/**
 * 構造（親子関係）の契約。ancestor の中に descendant があること。
 * @type {{ ancestor: string, descendant: string, pages: PageKind[], fixture: boolean, why: string }[]}
 */
const RELATIONS = [
  {
    ancestor: 'ytd-player#ytd-player',
    descendant: '#movie_player.html5-video-player',
    pages: ['watch'],
    fixture: true,
    why: 'プレイヤーコンテナが ytd-player の子孫であること（style.css の ytd-player:has(...) が効く条件）',
  },
  {
    ancestor: '#movie_player',
    descendant: 'video',
    pages: ['watch'],
    fixture: true,
    why: 'video がプレイヤーコンテナの子孫であること（ブラー描画元）',
  },
  {
    ancestor: '#movie_player',
    descendant: '.ytp-size-button',
    pages: ['watch'],
    fixture: true,
    why: 'シアター切替ボタンがプレイヤーの子孫であること（E2E）',
  },
  {
    ancestor: 'ytd-shorts',
    descendant: '.html5-video-player video',
    pages: ['shorts'],
    fixture: false,
    why: 'Shorts でも video が .html5-video-player 配下にあること',
  },
];

/** 拡張の isPlayerPagePath と対応する URL 契約（実 URL がこの形式のままであること）。 */
const PATHS = {
  watch: /^\/watch(\/|$)/,
  shorts: /^\/shorts\//,
};

/**
 * 拡張が自前で生成する要素/属性。YouTube 由来ではないので契約から除外する。
 * unit test が src / CSS から YouTube 由来のセレクタを抽出するときに使う。
 */
const EXTENSION_OWNED = [/yt-light-bg-/, /data-yt-/];

/**
 * 実 YouTube の watch ページ用の動画 ID（E2E と同じ安定した動画）。
 */
const WATCH_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SHORTS_URL = 'https://www.youtube.com/shorts/';
const RESULTS_URL = 'https://www.youtube.com/results?search_query=lofi';

module.exports = {
  SELECTORS,
  RELATIONS,
  PATHS,
  EXTENSION_OWNED,
  WATCH_URL,
  SHORTS_URL,
  RESULTS_URL,
};

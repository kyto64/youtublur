/**
 * ローカルの YouTube 風 fixture。
 *
 * 拡張の content_scripts は `*://*.youtube.com/*` にしか一致しないため、file:// ではなく
 * youtube.com の URL のまま `context.route` でレスポンスを差し替える（実ネットワークには出ない）。
 * 実 youtube.com に当てたいテストは `@live` タグを付ける（e2e/fixtures.js が @live のときだけ
 * この fixture を入れない）。
 *
 * fixture が再現する範囲（content script が依存する最小限の DOM）:
 * - `/watch`: `ytd-player#ytd-player > #movie_player.html5-video-player > video` と `.ytp-size-button`
 *   （クリックでシアター相当のレイアウトに切り替え、アンビエント帯を作る）。
 *   video は canvas.captureStream() の本物のフレームで videoWidth/videoHeight を持つ。
 * - `/`・`/results`: `ytd-video-renderer` の一覧（プレイヤー無し）。リンクのクリックで
 *   pushState + `yt-navigate-finish` による SPA 遷移を行う（プレイヤー DOM は
 *   イベントより少し後に出る。実 YouTube と同じ順序で observePlayer の取りこぼしを検知する）。
 * - Shorts は再現しない（`shorts.spec.js` は @live）。
 */

const PLAYER_APPEARS_AFTER_NAVIGATE_MS = 50;

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>youtublur fixture</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; color: #0f0f0f; font-family: sans-serif; }
  html[dark] body { background: #0f0f0f; color: #f1f1f1; }
  #content { width: 100%; }
  ytd-player { display: block; width: 100%; max-width: 1280px; aspect-ratio: 16 / 9; }
  html[theater] ytd-player { max-width: none; aspect-ratio: auto; height: 80vh; }
  #movie_player { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }
  .html5-video-container { position: absolute; inset: 0; }
  .html5-video-container video { width: 100%; height: 100%; object-fit: contain; }
  .ytp-chrome-bottom { position: absolute; left: 0; right: 0; bottom: 0; height: 40px; z-index: 5; }
  .ytp-size-button { position: absolute; right: 8px; bottom: 4px; width: 32px; height: 32px; }
  ytd-video-renderer { display: block; margin: 12px; }
  ytd-video-renderer a#thumbnail { display: block; width: 160px; height: 90px; background: #888; }
  ytd-video-renderer a#video-title { display: block; padding: 4px 0; }
</style>
</head>
<body>
<div id="content"></div>
<script>
(function () {
  var content = document.getElementById('content');
  var timer = 0;

  function startStream(video) {
    // 色が動く本物のフレームを流して videoWidth / videoHeight と描画内容を持たせる。
    var src = document.createElement('canvas');
    src.width = 1280;
    src.height = 720;
    var ctx = src.getContext('2d');
    var hue = 0;
    function frame() {
      var g = ctx.createLinearGradient(0, 0, 1280, 720);
      g.addColorStop(0, 'hsl(' + (hue % 360) + ',80%,50%)');
      g.addColorStop(1, 'hsl(' + ((hue + 120) % 360) + ',80%,40%)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1280, 720);
      hue += 2;
    }
    frame();
    setInterval(frame, 100);
    video.muted = true;
    video.srcObject = src.captureStream(10);
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  function renderWatch() {
    content.innerHTML =
      '<ytd-player id="ytd-player">' +
      '<div id="movie_player" class="html5-video-player">' +
      '<div class="html5-video-container"><video class="video-stream html5-main-video"></video></div>' +
      '<div class="ytp-chrome-bottom"><button class="ytp-size-button" title="Theater mode"></button></div>' +
      '</div></ytd-player>';
    startStream(content.querySelector('video'));
    content.querySelector('.ytp-size-button').addEventListener('click', function () {
      document.documentElement.toggleAttribute('theater');
    });
  }

  function renderList() {
    var html = '';
    for (var i = 1; i <= 3; i++) {
      html +=
        '<ytd-video-renderer>' +
        '<a id="thumbnail" href="/watch?v=fixture' + i + '"></a>' +
        '<a id="video-title" href="/watch?v=fixture' + i + '">Fixture video ' + i + '</a>' +
        '</ytd-video-renderer>';
    }
    content.innerHTML = html;
  }

  function render(afterEvent) {
    clearTimeout(timer);
    if (location.pathname === '/watch') {
      if (afterEvent) {
        content.innerHTML = '';
        timer = setTimeout(renderWatch, ${PLAYER_APPEARS_AFTER_NAVIGATE_MS});
      } else {
        renderWatch();
      }
    } else {
      renderList();
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="/"]');
    if (!a) return;
    e.preventDefault();
    history.pushState(null, '', a.getAttribute('href'));
    render(true);
    window.dispatchEvent(new CustomEvent('yt-navigate-finish'));
  });

  render(false);
})();
</script>
</body>
</html>`;

/**
 * context 内の http(s) リクエストをすべて fixture に差し替える。
 * youtube.com のドキュメントは fixture HTML、それ以外の youtube.com への要求は空の 204、
 * 他ホストへの要求は実ネットワークに出さず abort する。
 * @param {import('@playwright/test').BrowserContext} context
 */
async function installYouTubeFixture(context) {
  await context.route(
    (url) => url.protocol === 'http:' || url.protocol === 'https:',
    async (route) => {
      const request = route.request();
      const host = new URL(request.url()).hostname;
      if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) {
        await route.abort();
        return;
      }
      if (request.resourceType() === 'document') {
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE_HTML });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    }
  );
}

module.exports = { installYouTubeFixture };

// Uninstall survey. Self-contained: no external scripts, no cookies, no tracking.
// The only request is the optional answer the visitor submits to the Google Form.
(function () {
  'use strict';

  var FORM_URL =
    'https://docs.google.com/forms/d/e/1FAIpQLSdwKZt4A8o4ztAGInOeM7OWCyYhPCcSn3AetKy7hes5EaJvkw/formResponse';
  var FIELDS = {
    reason: 'entry.333345560',
    comment: 'entry.2058122616',
    version: 'entry.1160209855',
    lang: 'entry.61505378'
  };
  var MAX_COMMENT = 1000;
  var MAX_VERSION = 32;
  var SUPPORTED = ['en', 'ja', 'ko', 'es', 'id', 'pt_BR', 'zh_CN', 'zh_TW'];

  var STRINGS = {
    en: {
      title: 'Thanks for trying youtublur',
      thanks: 'Sorry to see you go. A quick answer helps us improve (about 1 minute).',
      question: 'Why did you uninstall it?',
      broken: "It didn't work",
      slow: 'Too heavy or slow',
      look: "I don't like how it looks",
      not_needed: "I don't need it anymore",
      switched: 'I switched to another extension',
      other: 'Other',
      commentLabel: 'Anything else? (optional, up to 1000 characters)',
      submit: 'Send',
      sending: 'Sending...',
      needReason: 'Please choose one reason.',
      doneTitle: 'Thank you!',
      doneBody: 'Your answer has been sent. You can close this tab now.'
    },
    ja: {
      title: 'youtublur をお試しいただきありがとうございました',
      thanks: '今後の改善のため、1分ほどでご回答いただけると助かります。',
      question: 'なぜアンインストールしましたか？',
      broken: '動かなかった',
      slow: '重い・遅い',
      look: '見た目が好みじゃない',
      not_needed: 'もう要らない',
      switched: '別の拡張にした',
      other: 'その他',
      commentLabel: 'ほかにあれば（任意・1000字まで）',
      submit: '送信',
      sending: '送信中...',
      needReason: '理由をひとつ選んでください。',
      doneTitle: 'ありがとうございました！',
      doneBody: 'ご回答を送信しました。このタブは閉じて大丈夫です。'
    },
    ko: {
      title: 'youtublur를 사용해 주셔서 감사합니다',
      thanks: '앞으로의 개선을 위해 1분 정도만 답변해 주시면 큰 도움이 됩니다.',
      question: '왜 삭제하셨나요?',
      broken: '작동하지 않았어요',
      slow: '무겁거나 느려요',
      look: '디자인이 마음에 들지 않아요',
      not_needed: '더 이상 필요 없어요',
      switched: '다른 확장 프로그램으로 바꿨어요',
      other: '기타',
      commentLabel: '그 밖의 의견 (선택, 최대 1000자)',
      submit: '보내기',
      sending: '보내는 중...',
      needReason: '이유를 하나 선택해 주세요.',
      doneTitle: '감사합니다!',
      doneBody: '답변을 보냈습니다. 이 탭은 닫으셔도 됩니다.'
    },
    es: {
      title: 'Gracias por probar youtublur',
      thanks: 'Tu respuesta nos ayuda a mejorar y lleva alrededor de 1 minuto.',
      question: '¿Por qué lo desinstalaste?',
      broken: 'No funcionaba',
      slow: 'Era pesado o lento',
      look: 'No me gusta su aspecto',
      not_needed: 'Ya no lo necesito',
      switched: 'Cambié a otra extensión',
      other: 'Otro',
      commentLabel: '¿Algo más? (opcional, hasta 1000 caracteres)',
      submit: 'Enviar',
      sending: 'Enviando...',
      needReason: 'Elige un motivo.',
      doneTitle: '¡Gracias!',
      doneBody: 'Tu respuesta se ha enviado. Ya puedes cerrar esta pestaña.'
    },
    id: {
      title: 'Terima kasih sudah mencoba youtublur',
      thanks: 'Jawaban singkat Anda membantu kami berbenah (sekitar 1 menit).',
      question: 'Mengapa Anda menghapusnya?',
      broken: 'Tidak berfungsi',
      slow: 'Terlalu berat atau lambat',
      look: 'Tampilannya kurang cocok',
      not_needed: 'Sudah tidak diperlukan',
      switched: 'Beralih ke ekstensi lain',
      other: 'Lainnya',
      commentLabel: 'Ada lagi? (opsional, maks. 1000 karakter)',
      submit: 'Kirim',
      sending: 'Mengirim...',
      needReason: 'Pilih satu alasan.',
      doneTitle: 'Terima kasih!',
      doneBody: 'Jawaban Anda sudah terkirim. Tab ini boleh ditutup.'
    },
    pt_BR: {
      title: 'Obrigado por experimentar o youtublur',
      thanks: 'Sua resposta nos ajuda a melhorar e leva cerca de 1 minuto.',
      question: 'Por que você desinstalou?',
      broken: 'Não funcionou',
      slow: 'Pesado ou lento demais',
      look: 'Não gostei do visual',
      not_needed: 'Não preciso mais',
      switched: 'Troquei por outra extensão',
      other: 'Outro',
      commentLabel: 'Mais alguma coisa? (opcional, até 1000 caracteres)',
      submit: 'Enviar',
      sending: 'Enviando...',
      needReason: 'Escolha um motivo.',
      doneTitle: 'Obrigado!',
      doneBody: 'Sua resposta foi enviada. Você já pode fechar esta guia.'
    },
    zh_CN: {
      title: '感谢试用 youtublur',
      thanks: '您的反馈能帮助我们改进，大约只需 1 分钟。',
      question: '您为什么卸载了它？',
      broken: '无法正常工作',
      slow: '太卡或太慢',
      look: '不喜欢它的外观',
      not_needed: '不再需要了',
      switched: '换用了其他扩展程序',
      other: '其他',
      commentLabel: '还有其他想说的吗？（选填，最多 1000 字）',
      submit: '提交',
      sending: '正在提交...',
      needReason: '请选择一个原因。',
      doneTitle: '谢谢！',
      doneBody: '您的反馈已提交，现在可以关闭此标签页了。'
    },
    zh_TW: {
      title: '感謝試用 youtublur',
      thanks: '您的回饋能幫助我們改進，大約只需 1 分鐘。',
      question: '您為什麼解除安裝了它？',
      broken: '無法正常運作',
      slow: '太卡或太慢',
      look: '不喜歡它的外觀',
      not_needed: '不再需要了',
      switched: '改用其他擴充功能',
      other: '其他',
      commentLabel: '還有其他想說的嗎？（選填，最多 1000 字）',
      submit: '送出',
      sending: '正在送出...',
      needReason: '請選擇一個原因。',
      doneTitle: '謝謝！',
      doneBody: '您的回饋已送出，現在可以關閉此分頁了。'
    }
  };

  // Maps a tag such as "ja", "pt-BR", "zh-Hant-TW" or "en_US" to one of the 8 languages, or null.
  function normalizeLang(raw) {
    if (typeof raw !== 'string') return null;
    var tag = raw.trim().replace(/_/g, '-').toLowerCase();
    if (!tag) return null;
    var parts = tag.split('-');
    var base = parts[0];
    if (base === 'zh') {
      var rest = parts.slice(1);
      var traditional =
        rest.indexOf('hant') !== -1 ||
        (rest.indexOf('hans') === -1 &&
          (rest.indexOf('tw') !== -1 || rest.indexOf('hk') !== -1 || rest.indexOf('mo') !== -1));
      return traditional ? 'zh_TW' : 'zh_CN';
    }
    if (base === 'pt') return 'pt_BR';
    if (base === 'in') return 'id'; // legacy code for Indonesian
    if (SUPPORTED.indexOf(base) !== -1) return base;
    return null;
  }

  function resolveLang(search, navigatorLike) {
    var params = new URLSearchParams(search || '');
    var fromQuery = normalizeLang(params.get('lang'));
    if (fromQuery) return fromQuery;
    var candidates = [];
    if (navigatorLike) {
      if (Array.isArray(navigatorLike.languages)) candidates = candidates.concat(navigatorLike.languages);
      if (navigatorLike.language) candidates.push(navigatorLike.language);
    }
    for (var i = 0; i < candidates.length; i++) {
      var found = normalizeLang(candidates[i]);
      if (found) return found;
    }
    return 'en';
  }

  function sanitizeVersion(raw) {
    if (typeof raw !== 'string') return '';
    var v = raw.trim();
    return /^[0-9A-Za-z.+-]+$/.test(v) && v.length <= MAX_VERSION ? v : '';
  }

  function buildBody(answer) {
    var body = new URLSearchParams();
    body.set(FIELDS.reason, answer.reason);
    body.set(FIELDS.comment, String(answer.comment || '').slice(0, MAX_COMMENT));
    body.set(FIELDS.version, answer.version || '');
    body.set(FIELDS.lang, answer.lang);
    return body;
  }

  function init() {
    var lang = resolveLang(location.search, navigator);
    var t = STRINGS[lang];
    var version = sanitizeVersion(new URLSearchParams(location.search).get('v'));
    var $ = function (id) { return document.getElementById(id); };

    document.documentElement.lang = lang.replace('_', '-');
    document.title = t.title;
    $('title').textContent = t.title;
    $('thanks').textContent = t.thanks;
    $('question').textContent = t.question;
    $('commentLabel').textContent = t.commentLabel;
    $('submit').textContent = t.submit;
    $('doneTitle').textContent = t.doneTitle;
    $('doneBody').textContent = t.doneBody;
    document.querySelectorAll('[data-reason]').forEach(function (el) {
      el.textContent = t[el.getAttribute('data-reason')];
    });

    var form = $('surveyForm');
    var error = $('error');
    var submit = $('submit');
    var sent = false;

    form.addEventListener('change', function () { error.hidden = true; });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (sent) return;
      var checked = form.querySelector('input[name="reason"]:checked');
      if (!checked) {
        error.textContent = t.needReason;
        error.hidden = false;
        return;
      }
      sent = true;
      submit.disabled = true;
      submit.textContent = t.sending;
      var body = buildBody({
        reason: checked.value,
        comment: $('comment').value,
        version: version,
        lang: lang
      });
      // no-cors: the response is opaque, so a resolved fetch is the best signal we get.
      // Show the thanks either way; a failed send must not trap the visitor on the form.
      var finish = function () {
        form.hidden = true;
        $('done').hidden = false;
      };
      fetch(FORM_URL, { method: 'POST', mode: 'no-cors', body: body }).then(finish, finish);
    });
  }

  if (typeof document !== 'undefined' && document.getElementById('surveyForm')) {
    init();
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeLang: normalizeLang, resolveLang: resolveLang, buildBody: buildBody, sanitizeVersion: sanitizeVersion, STRINGS: STRINGS, SUPPORTED: SUPPORTED };
  }
})();

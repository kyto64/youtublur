/**
 * .env の CHROME_CLIENT_ID / CHROME_CLIENT_SECRET（任意: CHROME_REDIRECT_URI）を読み、
 * 認可コードをトークンに交換して GitHub の CHROME_REFRESH_TOKEN を設定する。
 *
 * 1 回目（認可コードなし）: ブラウザ用の認可 URL を表示して終了。
 * 2 回目: AUTH_CODE='...' を付けて実行すると gh secret set まで行う。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

/** ローカルへ飛ばない環境が多いので、既定は Playground（GCP のウェブクライアントにこの URI を登録すること） */
const DEFAULT_REDIRECT_URI = 'https://developers.google.com/oauthplayground';

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`[sync-chrome-refresh-token] .env not found: ${ENV_PATH}`);
    process.exit(1);
  }
  const map = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

function ghRepoSlug() {
  const url = execSync('git remote get-url origin', {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!m) {
    throw new Error('Could not parse owner/repo from git remote origin');
  }
  return `${m[1]}/${m[2]}`;
}

function buildAuthUrl(clientId, redirectUri) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('[sync-chrome-refresh-token] Token endpoint error:', JSON.stringify(json, null, 2));
    process.exit(1);
  }
  if (!json.refresh_token) {
    console.error(
      '[sync-chrome-refresh-token] No refresh_token in response. Try revoking app access at https://myaccount.google.com/permissions and run the auth URL again with prompt=consent.\n',
      JSON.stringify(json, null, 2)
    );
    process.exit(1);
  }
  return json.refresh_token;
}

async function main() {
  const fileEnv = loadEnvFile();
  const clientId = fileEnv.CHROME_CLIENT_ID || process.env.CHROME_CLIENT_ID;
  const clientSecret = fileEnv.CHROME_CLIENT_SECRET || process.env.CHROME_CLIENT_SECRET;
  const redirectUri =
    fileEnv.CHROME_REDIRECT_URI ||
    process.env.CHROME_REDIRECT_URI ||
    DEFAULT_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    console.error(
      '[sync-chrome-refresh-token] CHROME_CLIENT_ID and CHROME_CLIENT_SECRET must be set in .env'
    );
    process.exit(1);
  }

  const authCode = process.env.AUTH_CODE?.trim();
  if (!authCode) {
    const url = buildAuthUrl(clientId, redirectUri);
    console.log('[sync-chrome-refresh-token] Open this URL in a browser (Chrome Web Store の所有者アカウントでログイン):\n');
    console.log(url);
    console.log(
      '\n[sync-chrome-refresh-token] GCP の「OAuth 2.0 クライアント ID」（種類: ウェブアプリ）に、次のリダイレクト URI が登録されているか確認:\n' +
        '  ' +
        redirectUri +
        '\n\n[sync-chrome-refresh-token] 同意後、ブラウザのアドレスバーに `code=` が付いた URL から code をコピー（Playground に戻る場合はそのページの URL でも可）。次を実行:\n' +
        `  AUTH_CODE='paste-code-here' node scripts/sync-chrome-refresh-token.mjs\n` +
        '\n[sync-chrome-refresh-token] ループバックを使う場合は .env に例: CHROME_REDIRECT_URI=http://127.0.0.1:53682/ と GCP に同一 URI を登録。'
    );
    return;
  }

  const refreshToken = await exchangeCode({
    clientId,
    clientSecret,
    redirectUri,
    code: authCode
  });

  const repo = ghRepoSlug();
  execSync('gh secret set CHROME_REFRESH_TOKEN --repo ' + repo, {
    input: refreshToken,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: ROOT
  });
  console.log('[sync-chrome-refresh-token] GitHub secret CHROME_REFRESH_TOKEN updated for', repo);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

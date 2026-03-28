/**
 * CI / ローカル用: Chrome Web Store に zip をアップロードし、オプションで公開する。
 * 失敗時は API が返した JSON（CWSError.cause）をそのまま出して切り分けしやすくする。
 */
import fs from 'node:fs';
import path from 'node:path';
import chromeWebstoreUpload from 'chrome-webstore-upload';

function requireEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim() === '') {
    console.error(`[publish-chrome-webstore] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

function logFailure(context, err) {
  console.error(`\n[publish-chrome-webstore] FAILED: ${context}`);
  console.error(String(err && err.message ? err.message : err));
  if (err && typeof err === 'object' && 'cause' in err && err.cause !== undefined) {
    const c = err.cause;
    console.error(
      '[publish-chrome-webstore] API / OAuth response body (parsed):',
      typeof c === 'string' ? c : JSON.stringify(c, null, 2)
    );
  }
  if (err && typeof err.stack === 'string') {
    console.error(err.stack);
  }
}

async function main() {
  const extensionId = requireEnv('CHROME_EXTENSION_ID');
  const clientId = requireEnv('CHROME_CLIENT_ID');
  const refreshToken = requireEnv('CHROME_REFRESH_TOKEN');
  const clientSecret = process.env.CHROME_CLIENT_SECRET;
  const zipPath = path.resolve(
    process.cwd(),
    process.env.CWS_ZIP_PATH || 'extension.zip'
  );
  const publish =
    process.env.CWS_PUBLISH === '1' || process.env.CWS_PUBLISH === 'true';

  if (!fs.existsSync(zipPath)) {
    console.error(`[publish-chrome-webstore] Zip not found: ${zipPath}`);
    process.exit(1);
  }

  const webStore = chromeWebstoreUpload({
    extensionId,
    clientId,
    clientSecret: clientSecret && clientSecret.trim() !== '' ? clientSecret : undefined,
    refreshToken
  });

  try {
    const uploadRes = await webStore.uploadExisting(zipPath);
    console.log('[publish-chrome-webstore] upload:', JSON.stringify(uploadRes, null, 2));

    if (publish) {
      const target = process.env.CWS_PUBLISH_TARGET || 'default';
      const publishRes = await webStore.publish(target);
      console.log('[publish-chrome-webstore] publish:', JSON.stringify(publishRes, null, 2));
    }
  } catch (err) {
    logFailure('upload or publish', err);
    process.exit(1);
  }
}

main();

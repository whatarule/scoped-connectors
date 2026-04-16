"use strict";
const { readStdin, checkOk, formatMessage } = require("./common");

/**
 * Slack メッセージURL をパースして { channelId, ts } を返す
 * URL形式: https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP
 * @param {string} url
 * @returns {{ channelId: string, ts: string } | null}
 */
function parseSlackUrl(url) {
  const match = url.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/);
  if (!match) return null;
  const channelId = match[1];
  const rawTs = match[2];
  const ts = rawTs.slice(0, 10) + "." + rawTs.slice(10);
  return { channelId, ts };
}

async function main() {
  const data = await readStdin();
  checkOk(data);
  const messages = data.messages || [];
  for (const msg of messages) {
    console.log(formatMessage(msg));
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { parseSlackUrl };

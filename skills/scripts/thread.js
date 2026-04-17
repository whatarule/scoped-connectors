"use strict";

const { fetchSlackApi, formatMessage } = require("./common");
const { ensureChannelCache, ensureUsersCache, resolveChannel } = require("./cache");

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
  const arg1 = process.argv[2];

  if (!arg1) {
    process.stderr.write("使い方: thread.js <channel> <ts> または thread.js <slack URL>\n");
    process.exit(1);
  }

  let channelId, ts;

  if (arg1.startsWith("http")) {
    const parsed = parseSlackUrl(arg1);
    if (!parsed) {
      process.stderr.write("Slack URL のパースに失敗しました\n");
      process.exit(1);
    }
    channelId = parsed.channelId;
    ts = parsed.ts;
  } else {
    ts = process.argv[3];
    if (!ts) {
      process.stderr.write("使い方: thread.js <channel> <ts> または thread.js <slack URL>\n");
      process.exit(1);
    }
    await ensureChannelCache();
    channelId = resolveChannel(arg1);
  }

  await ensureUsersCache();

  const data = await fetchSlackApi("conversations.replies", { channel: channelId, ts });
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

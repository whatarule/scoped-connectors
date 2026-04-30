"use strict";

const { fetchSlackApi, formatMessage } = require("./common");
const { ensureChannelCache, ensureUsersCache, resolveChannel } = require("./cache");

/**
 * YYYY-MM-DD 形式の日付を Unix タイムスタンプに変換する
 * @param {string} dateStr - "2026-04-14" 形式
 * @param {boolean} endOfDay - true なら 23:59:59 にする
 * @returns {string}
 */
function dateToUnixTs(dateStr, endOfDay = false) {
  // YYYY-MM-DD をローカルタイムとして解釈（new Date("YYYY-MM-DD") は UTC になるため手動パース）
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (endOfDay) {
    date.setHours(23, 59, 59);
  }
  return String(Math.floor(date.getTime() / 1000));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stderr.write("使い方: history.js <channel> [limit] [--after YYYY-MM-DD] [--before YYYY-MM-DD]\n");
    process.exit(1);
  }

  // オプション解析
  let after = "";
  let before = "";
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--after" && args[i + 1]) {
      after = args[++i];
    } else if (args[i] === "--before" && args[i + 1]) {
      before = args[++i];
    } else {
      positional.push(args[i]);
    }
  }

  const channelArg = positional[0];
  const limit = positional[1] || "20";

  if (!channelArg) {
    process.stderr.write("使い方: history.js <channel> [limit] [--after YYYY-MM-DD] [--before YYYY-MM-DD]\n");
    process.exit(1);
  }

  await ensureChannelCache();
  await ensureUsersCache();

  const params = { channel: resolveChannel(channelArg), limit };
  if (after) params.oldest = dateToUnixTs(after);
  if (before) params.latest = dateToUnixTs(before, true);

  const data = await fetchSlackApi("conversations.history", params);
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

module.exports = { dateToUnixTs };

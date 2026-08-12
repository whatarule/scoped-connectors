"use strict";

const { fetchSlackApi, fetchSlackApiJson, resolveMentions } = require("./common");
const { ensureChannelCache, ensureUsersCache, readCache } = require("./cache");
const { verifyPublicChannel, detectBroadcastMentions } = require("./policy/slack-post");

const USAGE =
  "使い方: post.js <channel> <text> [--thread-ts <ts>] [--confirm]\n" +
  "  --confirm を付けるまで投稿は行わず、投稿内容の確認だけを表示します。\n";

function parseArgs(argv) {
  let threadTs = "";
  let confirm = false;
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--thread-ts" && argv[i + 1]) {
      threadTs = argv[++i];
    } else if (argv[i] === "--confirm") {
      confirm = true;
    } else {
      positional.push(argv[i]);
    }
  }

  return { channel: positional[0] || "", text: positional.slice(1).join(" "), threadTs, confirm };
}

/**
 * 確認表示を組み立てる。投稿前に人が読むためのもの。
 * @param {object} params
 * @returns {string}
 */
function buildPreview({ channelArg, channelId, text, threadTs, memberCount, broadcasts }) {
  const lines = [
    "--- 投稿内容の確認（まだ投稿していません） ---",
    `投稿先: #${channelArg} (${channelId})`,
  ];

  if (typeof memberCount === "number") {
    lines.push(`参加人数: ${memberCount} 人`);
  }
  if (threadTs) {
    lines.push(`スレッド返信: ${threadTs}`);
  }
  if (broadcasts.length) {
    lines.push(
      `⚠️ ${broadcasts.join(" / ")} が飛びます` +
        (typeof memberCount === "number" ? `（${memberCount} 人に通知されます）` : "")
    );
  }

  lines.push("--- 本文 ---", resolveMentions(text), "---");
  lines.push("この内容で投稿するには --confirm を付けて再実行してください。");
  return lines.join("\n");
}

/**
 * conversations.info の結果を channel ID ごとに1回だけ取得する。
 * public 判定と参加人数の表示で同じ情報を使うため。
 */
function createChannelInfoLoader() {
  const cache = new Map();
  return async function getChannelInfo(channelId) {
    if (!cache.has(channelId)) {
      const data = await fetchSlackApi("conversations.info", { channel: channelId });
      cache.set(channelId, data.channel);
    }
    return cache.get(channelId);
  };
}

function lookupCachedChannelId(name) {
  const cache = readCache();
  if (!cache) return null;
  return cache.get(name) || null;
}

async function main() {
  const args = process.argv.slice(2);
  const { channel, text, threadTs, confirm } = parseArgs(args);

  if (!channel || !text) {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  await ensureChannelCache();
  await ensureUsersCache();

  const getChannelInfo = createChannelInfoLoader();
  const verdict = await verifyPublicChannel(channel, {
    lookupCachedChannelId,
    getChannelInfo,
  });

  if (!verdict.allowed) {
    process.stderr.write(`投稿を中止しました: ${verdict.reason}\n`);
    process.exit(1);
  }

  const channelId = verdict.channelId;
  const broadcasts = detectBroadcastMentions(text);

  let memberCount;
  try {
    const info = await getChannelInfo(channelId);
    if (info && typeof info.num_members === "number") {
      memberCount = info.num_members;
    }
  } catch {
    // 人数は確認表示を補強する情報でしかないため、取得できなくても投稿判断は妨げない
  }

  if (!confirm) {
    console.log(
      buildPreview({ channelArg: channel, channelId, text, threadTs, memberCount, broadcasts })
    );
    return;
  }

  const body = { channel: channelId, text };
  if (threadTs) body.thread_ts = threadTs;

  const data = await fetchSlackApiJson("chat.postMessage", body);
  console.log(`投稿しました: ${data.channel} (${data.ts})`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { parseArgs, buildPreview };

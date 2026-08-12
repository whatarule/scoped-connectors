"use strict";

const { fetchSlackApi, fetchSlackApiJson, resolveMentions } = require("./common");
const { ensureChannelCache, ensureUsersCache, readCache } = require("./cache");
const { verifyPostableChannel, detectBroadcastMentions } = require("./policy/slack-post");

const USAGE =
  "使い方: post.js <channel> <text> [--thread-ts <ts>] [--confirm]\n" +
  "  --confirm を付けるまで投稿は行わず、投稿内容の確認だけを表示します。\n";

function collectArgs(argv) {
  const parsed = { threadTs: "", confirm: false, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--thread-ts" && argv[i + 1]) {
      parsed.threadTs = argv[++i];
    } else if (argv[i] === "--confirm") {
      parsed.confirm = true;
    } else {
      parsed.positional.push(argv[i]);
    }
  }
  return parsed;
}

function parseArgs(argv) {
  const { threadTs, confirm, positional } = collectArgs(argv);
  const [channel = "", ...rest] = positional;
  return { channel, text: rest.join(" "), threadTs, confirm };
}

function buildDestinationLines({ channelArg, channelId, threadTs }) {
  const lines = [`投稿先: #${channelArg} (${channelId})`];
  if (threadTs) {
    lines.push(`スレッド返信: ${threadTs}`);
  }
  return lines;
}

function buildBroadcastWarning(broadcasts) {
  if (!broadcasts.length) return [];
  return [`⚠️ ${broadcasts.join(" / ")} が飛びます`];
}

/**
 * 確認表示を組み立てる。投稿前に人が読むためのもの。
 * @param {object} params
 * @returns {string}
 */
function buildPreview(params) {
  return [
    "--- 投稿内容の確認（まだ投稿していません） ---",
    ...buildDestinationLines(params),
    ...buildBroadcastWarning(params.broadcasts),
    "--- 本文 ---",
    resolveMentions(params.text),
    "---",
    "この内容で投稿するには --confirm を付けて再実行してください。",
  ].join("\n");
}

async function getChannelInfo(channelId) {
  const data = await fetchSlackApi("conversations.info", { channel: channelId });
  return data.channel;
}

function lookupCachedChannelId(name) {
  const cache = readCache();
  if (!cache) return null;
  return cache.get(name) || null;
}

function exitWithError(message) {
  process.stderr.write(message);
  process.exit(1);
}

/**
 * 投稿先を解決する。public でなければここで終了する。
 */
async function resolveDestination(channel, getChannelInfo) {
  const verdict = await verifyPostableChannel(channel, {
    lookupCachedChannelId,
    getChannelInfo,
  });
  if (!verdict.allowed) {
    exitWithError(`投稿を中止しました: ${verdict.reason}\n`);
  }
  return verdict.channelId;
}

function showPreview(params) {
  const broadcasts = detectBroadcastMentions(params.text);
  console.log(buildPreview({ ...params, broadcasts }));
}

async function postMessage({ channelId, text, threadTs }) {
  const body = { channel: channelId, text };
  if (threadTs) body.thread_ts = threadTs;
  const data = await fetchSlackApiJson("chat.postMessage", body);
  console.log(`投稿しました: ${data.channel} (${data.ts})`);
}

async function main() {
  const { channel, text, threadTs, confirm } = parseArgs(process.argv.slice(2));
  if (!channel || !text) {
    exitWithError(USAGE);
  }

  await ensureChannelCache();
  await ensureUsersCache();

  const channelId = await resolveDestination(channel, getChannelInfo);

  if (confirm) {
    await postMessage({ channelId, text, threadTs });
    return;
  }
  showPreview({ channelArg: channel, channelId, text, threadTs });
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { parseArgs, buildPreview };

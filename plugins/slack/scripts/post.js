"use strict";

const { fetchSlackApi, fetchSlackApiJson, resolveMentions } = require("./common");
const { ensureChannelCache, ensureUsersCache, readCache } = require("./cache");
const {
  verifyPostableChannel,
  detectBroadcastMentions,
  buildConfirmToken,
} = require("./policy/slack-post");

const USAGE =
  "使い方: post.js <channel> <text> [--thread-ts <ts>] [--confirm <token>]\n" +
  "  --confirm を付けるまで投稿は行わず、投稿内容の確認だけを表示します。\n" +
  "  <token> は確認表示に出るものをそのまま渡します。\n";

/**
 * 値を伴うオプション。値が無いまま終端に来たら、本文へ混ぜずにエラーにする。
 */
const VALUE_OPTIONS = { "--thread-ts": "threadTs", "--confirm": "confirmToken" };

function collectArgs(argv) {
  const parsed = { threadTs: "", confirmToken: "", confirm: false, positional: [], error: "" };
  for (let i = 0; i < argv.length; i++) {
    const key = VALUE_OPTIONS[argv[i]];
    if (!key) {
      parsed.positional.push(argv[i]);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || VALUE_OPTIONS[value]) {
      parsed.error = `${argv[i]} には値が必要です。\n`;
      return parsed;
    }
    parsed[key] = value;
    i++;
  }
  parsed.confirm = parsed.confirmToken !== "";
  return parsed;
}

function parseArgs(argv) {
  const { threadTs, confirm, confirmToken, positional, error } = collectArgs(argv);
  const [channel = "", ...rest] = positional;
  return { channel, text: rest.join(" "), threadTs, confirm, confirmToken, error };
}

/**
 * 承認する人が読む行なので、指定の形（名前 / ID）に関わらずチャンネル名を出す。
 * private チャンネルは ID 指定しかできないため、名前は conversations.info から取る。
 */
function buildDestinationLines({ channelArg, channelId, channelName, threadTs }) {
  const name = channelName || String(channelArg).replace(/^#/, "");
  const lines = [`投稿先: #${name} (${channelId})`];
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
    `この内容で投稿するには --confirm ${params.confirmToken} を付けて再実行してください。`,
    "本文や投稿先を変えると token も変わります。",
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
 * 投稿先を解決する。投稿できないチャンネルならここで終了する。
 */
async function resolveDestination(channel, getChannelInfo) {
  const verdict = await verifyPostableChannel(channel, {
    lookupCachedChannelId,
    getChannelInfo,
  });
  if (!verdict.allowed) {
    exitWithError(`投稿を中止しました: ${verdict.reason}\n`);
  }
  return verdict;
}

function showPreview(params) {
  const broadcasts = detectBroadcastMentions(params.text);
  console.log(buildPreview({ ...params, broadcasts }));
}

/**
 * 承認された内容と、これから投稿する内容が同じであることを確かめる。
 * 食い違ったら投稿せず、現在の内容に対する token を出して確認をやり直させる。
 */
function requireMatchingToken({ expected, given }) {
  if (given === expected) return;
  exitWithError(
    "投稿を中止しました: 確認した内容と一致しません。\n" +
      "本文・投稿先・スレッドのいずれかが確認時から変わっています。\n" +
      "--confirm を外して確認表示からやり直してください。\n"
  );
}

async function postMessage({ channelId, text, threadTs }) {
  const body = { channel: channelId, text };
  if (threadTs) body.thread_ts = threadTs;
  const data = await fetchSlackApiJson("chat.postMessage", body);
  console.log(`投稿しました: ${data.channel} (${data.ts})`);
}

async function main() {
  const { channel, text, threadTs, confirm, confirmToken, error } = parseArgs(
    process.argv.slice(2)
  );
  if (error) {
    exitWithError(error + USAGE);
  }
  if (!channel || !text) {
    exitWithError(USAGE);
  }

  await ensureChannelCache();
  await ensureUsersCache();

  const { channelId, channelName } = await resolveDestination(channel, getChannelInfo);
  const expectedToken = buildConfirmToken({ channelId, text, threadTs });

  if (confirm) {
    requireMatchingToken({ expected: expectedToken, given: confirmToken });
    await postMessage({ channelId, text, threadTs });
    return;
  }
  showPreview({
    channelArg: channel,
    channelId,
    channelName,
    text,
    threadTs,
    confirmToken: expectedToken,
  });
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { parseArgs, buildPreview };

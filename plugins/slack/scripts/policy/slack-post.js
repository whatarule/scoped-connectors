"use strict";

/**
 * 投稿先チャンネルの検証ポリシー。
 *
 * 投稿できるのは「参加済みのチャンネル」に限る。private チャンネルも対象に含む。
 * private を除外しないのは、除外しても守れるものが無いため——
 * private への投稿はデータを外に出さないので、public 限定にすると
 * 「秘匿情報を扱う話題を閉じた場所へ書く」という逃げ道を塞ぐだけになる。
 *
 * 拒否するのは DM（1対1・グループ）と、参加していない・アーカイブ済みのチャンネル。
 * DM は会話の相手が居る私的な領域で、チャンネルへの投稿とは性質が異なるため対象外とする。
 *
 * 判定は名前指定・ID 指定のどちらでも conversations.info を通す。
 * 取得できない場合は投稿しない（fail closed）。
 */

const { createHash } = require("crypto");

const CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]+$/;

function deny(reason) {
  return { allowed: false, reason };
}

function allow(channelId, channelName) {
  return { allowed: true, reason: "", channelId, channelName: channelName || "" };
}

function requireFunctions(options) {
  for (const key of ["lookupCachedChannelId", "getChannelInfo"]) {
    if (typeof (options && options[key]) !== "function") {
      throw new Error(`${key} function is required.`);
    }
  }
}

/**
 * チャンネル ID の先頭文字から、投稿対象外と確定できるかを判定する。
 * `D` は DM で確定。`C` / `G` はチャンネルの可能性があるため確定できない。
 */
function denyReasonFromIdPrefix(channelId) {
  if (channelId.startsWith("D")) {
    return "DM には投稿できません。";
  }
  if (!CHANNEL_ID_PATTERN.test(channelId)) {
    return "チャンネル ID の形式が不正です。";
  }
  return "";
}

/**
 * conversations.info のレスポンスから、投稿してよいチャンネルか判定する。
 * DM・グループ DM を拒否し、参加していないチャンネル・アーカイブ済みも拒否する。
 */
function channelDenyReason(channel) {
  if (!channel) {
    return "チャンネル情報を取得できませんでした。";
  }
  if (channel.is_im === true || channel.is_mpim === true) {
    return "DM には投稿できません。";
  }
  if (channel.is_member === false) {
    return "参加していないチャンネルには投稿できません。";
  }
  if (channel.is_archived === true) {
    return "アーカイブ済みのチャンネルには投稿できません。";
  }
  return "";
}

/**
 * 名前指定の検証。キャッシュは名前から ID を引くためだけに使う。
 *
 * キャッシュは conversations.list を types=public_channel で引いた結果なので、
 * 載っていることで確定するのは「public チャンネルである」ことだけで、
 * **参加しているかどうかは分からない**（未参加の public チャンネルも一覧に載る）。
 * 参加済みという条件は conversations.info でしか確かめられないため、
 * 名前指定でも ID 指定と同じ検証を通す。
 */
async function verifyByName(name, lookupCachedChannelId, getChannelInfo) {
  const cachedId = lookupCachedChannelId(name);
  if (!cachedId) {
    return deny(
      `チャンネル "${name}" が public チャンネルのキャッシュに見つかりません。` +
        "private チャンネルへ投稿する場合はチャンネル ID で指定してください。"
    );
  }
  return verifyByChannelInfo(cachedId, getChannelInfo);
}

/**
 * conversations.info の結果から投稿可否を判定する。
 * 取得できない場合は投稿しない（fail closed）。
 */
async function verifyByChannelInfo(channelId, getChannelInfo) {
  let channel;
  try {
    channel = await getChannelInfo(channelId);
  } catch (err) {
    return deny(`チャンネル情報を取得できないため拒否しました（${err.message}）。`);
  }
  const reason = channelDenyReason(channel);
  return reason ? deny(reason) : allow(channelId, channel.name);
}

/**
 * ID 直指定の検証。キャッシュを経由しないため API に問い合わせる。
 */
async function verifyById(channelId, getChannelInfo) {
  const prefixDenial = denyReasonFromIdPrefix(channelId);
  if (prefixDenial) {
    return deny(prefixDenial);
  }
  return verifyByChannelInfo(channelId, getChannelInfo);
}

/**
 * 投稿先が参加済みのチャンネル（public / private いずれも可）であることを検証する。
 *
 * @param {string} channelArg - ユーザーが指定したチャンネル名または ID
 * @param {object} options
 * @param {(name: string) => string|null} options.lookupCachedChannelId
 *   チャンネル名から ID を引く。キャッシュにない場合は null
 * @param {(channelId: string) => Promise<object>} options.getChannelInfo
 *   conversations.info の channel オブジェクトを返す
 * @returns {Promise<{allowed: boolean, reason: string, channelId?: string, channelName?: string}>}
 */
async function verifyPostableChannel(channelArg, options) {
  requireFunctions(options);

  const name = String(channelArg || "").replace(/^#/, "");
  if (!name) {
    return deny("チャンネルが指定されていません。");
  }
  if (CHANNEL_ID_PATTERN.test(name)) {
    return verifyById(name, options.getChannelInfo);
  }
  return verifyByName(name, options.lookupCachedChannelId, options.getChannelInfo);
}

/**
 * 本文中のブロードキャストメンションを検出する。
 * 投稿を止めるためではなく、確認時に影響範囲を示すために使う。
 */
function detectBroadcastMentions(text) {
  const found = [];
  for (const keyword of ["channel", "here", "everyone"]) {
    const pattern = new RegExp(`(?:<!${keyword}(?:\\|[^>]*)?>|(?:^|\\s)@${keyword}\\b)`);
    if (pattern.test(text || "")) {
      found.push(`@${keyword}`);
    }
  }
  return found;
}

/**
 * 確認した内容と、実際に投稿する内容を結びつけるためのトークンを計算する。
 *
 * 2段階の確認は「人がプレビューを読んで承認する」ことを前提にしているが、
 * プレビューと `--confirm` は別々の実行なので、そのままでは
 * **A を見せて B を投稿する**ことができてしまい、承認が実質的に効かない。
 * 投稿先・本文・スレッドから決まるトークンを一致条件にすることで、
 * 承認された内容そのものだけが投稿できるようにする。
 *
 * 秘匿目的ではなく取り違えの検出が目的なので、短く読める長さに切り詰める。
 */
function buildConfirmToken({ channelId, text, threadTs }) {
  const payload = JSON.stringify([channelId || "", text || "", threadTs || ""]);
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 8);
}

module.exports = {
  CHANNEL_ID_PATTERN,
  denyReasonFromIdPrefix,
  channelDenyReason,
  verifyPostableChannel,
  detectBroadcastMentions,
  buildConfirmToken,
};

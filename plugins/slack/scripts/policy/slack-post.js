"use strict";

/**
 * 投稿先チャンネルの検証ポリシー。
 *
 * 読み取りは scope（channels:history のみ、groups:history なし）が
 * private チャンネルを API レベルで拒否するため、スクリプト側の検証を必要としない。
 * これに対し chat:write は public / private を区別しないため、
 * 「投稿先が public チャンネルであること」はスクリプト側で確かめるしかない。
 */

const PUBLIC_CHANNEL_ID_PATTERN = /^C[A-Z0-9]+$/;

function deny(reason) {
  return { allowed: false, reason };
}

function allow(channelId) {
  return { allowed: true, reason: "", channelId };
}

/**
 * チャンネル ID の先頭文字から、public チャンネルでないと確定できるかを判定する。
 * `C` は public / private の両方に使われるため、`C` では確定できない。
 * @param {string} channelId
 * @returns {string} 拒否理由。確定できない場合は空文字
 */
function denyReasonFromIdPrefix(channelId) {
  if (channelId.startsWith("D")) {
    return "DM には投稿できません。";
  }
  if (channelId.startsWith("G")) {
    return "private channel / group DM には投稿できません。";
  }
  if (!PUBLIC_CHANNEL_ID_PATTERN.test(channelId)) {
    return "チャンネル ID の形式が不正です。";
  }
  return "";
}

/**
 * conversations.info のレスポンスから public チャンネルか判定する。
 * @param {object} channel - conversations.info の channel オブジェクト
 * @returns {boolean}
 */
function isPublicChannelInfo(channel) {
  if (!channel) return false;
  return channel.is_private !== true && channel.is_im !== true && channel.is_mpim !== true;
}

/**
 * 投稿先が public チャンネルであることを検証する。
 *
 * 検証は2経路ある。
 * 1. チャンネル名から解決した場合: キャッシュは conversations.list を
 *    types=public_channel で引いた結果なので、載っていること自体が public の証明になる
 * 2. チャンネル ID を直接渡された場合: 上記の保証を通らないため conversations.info で確かめる
 *
 * @param {string} channelArg - ユーザーが指定したチャンネル名または ID
 * @param {object} options
 * @param {(name: string) => string|null} options.lookupCachedChannelId
 *   チャンネル名から ID を引く。キャッシュにない場合は null
 * @param {(channelId: string) => Promise<object>} options.getChannelInfo
 *   conversations.info の channel オブジェクトを返す
 * @returns {Promise<{allowed: boolean, reason: string, channelId?: string}>}
 */
async function verifyPublicChannel(channelArg, options) {
  const lookupCachedChannelId = options && options.lookupCachedChannelId;
  const getChannelInfo = options && options.getChannelInfo;

  if (typeof lookupCachedChannelId !== "function") {
    throw new Error("lookupCachedChannelId function is required.");
  }
  if (typeof getChannelInfo !== "function") {
    throw new Error("getChannelInfo function is required.");
  }

  const name = String(channelArg || "").replace(/^#/, "");
  if (!name) {
    return deny("チャンネルが指定されていません。");
  }

  // 経路1: 名前指定。キャッシュに載っていれば public 確定
  if (!/^[CDG][A-Z0-9]+$/.test(name)) {
    const cachedId = lookupCachedChannelId(name);
    if (!cachedId) {
      return deny(
        `チャンネル "${name}" が public チャンネルのキャッシュに見つかりません。` +
          "slack-channels でキャッシュを更新してください。"
      );
    }
    return allow(cachedId);
  }

  // 経路2: ID 直指定。先頭文字で確定できるものは先に落とす
  const prefixDenial = denyReasonFromIdPrefix(name);
  if (prefixDenial) {
    return deny(prefixDenial);
  }

  // `C` は public / private の両方に使われるため API に問い合わせる
  let channel;
  try {
    channel = await getChannelInfo(name);
  } catch (err) {
    return deny(`チャンネル情報を取得できないため拒否しました（${err.message}）。`);
  }

  if (!isPublicChannelInfo(channel)) {
    return deny("public チャンネルではないため投稿できません。");
  }
  return allow(name);
}

/**
 * 本文中のブロードキャストメンションを検出する。
 * 投稿を止めるためではなく、確認時に影響範囲を示すために使う。
 * @param {string} text
 * @returns {string[]} 検出したメンション（例: ["@channel"]）
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

module.exports = {
  PUBLIC_CHANNEL_ID_PATTERN,
  denyReasonFromIdPrefix,
  isPublicChannelInfo,
  verifyPublicChannel,
  detectBroadcastMentions,
};

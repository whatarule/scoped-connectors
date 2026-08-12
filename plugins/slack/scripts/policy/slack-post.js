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

const CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]+$/;

function requireFunctions(options) {
  for (const key of ["lookupCachedChannelId", "getChannelInfo"]) {
    if (typeof (options && options[key]) !== "function") {
      throw new Error(`${key} function is required.`);
    }
  }
}

/**
 * 名前指定の検証。キャッシュは conversations.list を types=public_channel で
 * 引いた結果なので、載っていること自体が public の証明になる。
 */
function verifyByName(name, lookupCachedChannelId) {
  const cachedId = lookupCachedChannelId(name);
  if (!cachedId) {
    return deny(
      `チャンネル "${name}" が public チャンネルのキャッシュに見つかりません。` +
        "slack-channels でキャッシュを更新してください。"
    );
  }
  return allow(cachedId);
}

/**
 * conversations.info の結果から public 判定を下す。
 * 取得できない場合は投稿しない（fail closed）。
 */
async function verifyByChannelInfo(channelId, getChannelInfo) {
  let channel;
  try {
    channel = await getChannelInfo(channelId);
  } catch (err) {
    return deny(`チャンネル情報を取得できないため拒否しました（${err.message}）。`);
  }
  if (!isPublicChannelInfo(channel)) {
    return deny("public チャンネルではないため投稿できません。");
  }
  return allow(channelId);
}

/**
 * ID 直指定の検証。キャッシュによる public の保証を通らないため API に問い合わせる。
 */
async function verifyById(channelId, getChannelInfo) {
  const prefixDenial = denyReasonFromIdPrefix(channelId);
  if (prefixDenial) {
    return deny(prefixDenial);
  }
  return verifyByChannelInfo(channelId, getChannelInfo);
}

/**
 * 投稿先が public チャンネルであることを検証する。
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
  requireFunctions(options);

  const name = String(channelArg || "").replace(/^#/, "");
  if (!name) {
    return deny("チャンネルが指定されていません。");
  }
  if (CHANNEL_ID_PATTERN.test(name)) {
    return verifyById(name, options.getChannelInfo);
  }
  return verifyByName(name, options.lookupCachedChannelId);
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

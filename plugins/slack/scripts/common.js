"use strict";

/**
 * Slack API を呼び出して JSON レスポンスを返す
 * @param {string} endpoint - API エンドポイント（例: "conversations.history"）
 * @param {object} params - クエリパラメータ
 * @returns {Promise<object>}
 */
async function fetchSlackApi(endpoint, params = {}) {
  const token = process.env.SLACK_TOKEN;
  if (!token) {
    process.stderr.write(
      "SLACK_TOKEN が設定されていません。\n" +
        "~/.claude/settings.json の env に SLACK_TOKEN を設定してください。\n"
    );
    process.exit(1);
  }
  const query = new URLSearchParams(params).toString();
  const url = `https://slack.com/api/${endpoint}?${query}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  checkOk(data);
  return data;
}

/**
 * Slack API を JSON POST で呼び出して JSON レスポンスを返す
 * @param {string} endpoint - API エンドポイント
 * @param {object} body - JSON body
 * @param {object} options - オプション
 * @param {boolean} options.skipCheck - true なら ok チェックを呼び出し側で行う
 * @returns {Promise<object>}
 */
async function fetchSlackApiJson(endpoint, body = {}, options = {}) {
  const token = process.env.SLACK_TOKEN;
  if (!token) {
    process.stderr.write(
      "SLACK_TOKEN が設定されていません。\n" +
        "~/.claude/settings.json の env に SLACK_TOKEN を設定してください。\n"
    );
    process.exit(1);
  }
  const url = `https://slack.com/api/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!options.skipCheck) {
    checkOk(data);
  }
  return data;
}

/**
 * ページネーション対応で Slack API の全ページを取得する
 * @param {string} endpoint - API エンドポイント
 * @param {object} params - クエリパラメータ
 * @param {string} dataKey - レスポンス内のデータ配列のキー（例: "channels", "members"）
 * @returns {Promise<Array>}
 */
async function fetchAllPages(endpoint, params, dataKey) {
  let all = [];
  let cursor = "";
  do {
    const p = cursor ? { ...params, cursor } : params;
    const data = await fetchSlackApi(endpoint, p);
    all = all.concat(data[dataKey] || []);
    cursor = (data.response_metadata && data.response_metadata.next_cursor) || "";
  } while (cursor);
  return all;
}


/**
 * data.ok が false ならエラーメッセージを stderr に出力して終了する
 * @param {object} data - Slack API レスポンス
 */
function checkOk(data) {
  if (!data.ok) {
    const errorMsg = data.error || "不明なエラー";
    process.stderr.write(`Slack API エラー: ${errorMsg}\n`);
    process.exit(1);
  }
}

/**
 * Slack の ts を "YYYY-MM-DD HH:MM" 形式に変換する
 * @param {string} ts - Slack タイムスタンプ（例: "1234567890.123456"）
 * @returns {string}
 */
function formatTs(ts) {
  const unixMs = parseFloat(ts) * 1000;
  const date = new Date(unixMs);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * メッセージオブジェクトを整形文字列に変換する
 * @param {object} msg - Slack メッセージオブジェクト
 * @returns {string} "[日時] (ts) ユーザー: テキスト" 形式
 */
function formatMessage(msg) {
  const { resolveUser } = require("./cache");
  const datetime = formatTs(msg.ts);
  const rawUser = msg.user || msg.username || "unknown";
  const user = resolveUser(rawUser);
  const text = resolveMentions(msg.text || "");
  const total = (msg.reply_count || 0) + 1;
  const thread = ` [${total}件のメッセージ]`;
  return `[${datetime}] (${msg.ts}) ${user}: ${text}${thread}`;
}

/**
 * メッセージ本文中のメンションを名前に変換する
 * @param {string} text
 * @returns {string}
 */
function resolveMentions(text) {
  const { resolveUser, resolveUsergroup } = require("./cache");
  text = text.replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id) => {
    return `@${resolveUser(id)}`;
  });
  text = text.replace(/<!subteam\^([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id) => {
    return `@${resolveUsergroup(id)}`;
  });
  return text;
}

module.exports = {
  fetchSlackApi,
  fetchSlackApiJson,
  fetchAllPages,
  checkOk,
  formatTs,
  formatMessage,
  resolveMentions,
};

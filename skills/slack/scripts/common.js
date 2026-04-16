"use strict";

/**
 * stdin から JSON を読み込んで返す
 * @returns {Promise<object>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        // Slack API のレスポンスに含まれる制御文字を除去
        // 改行・CRも含めてすべて除去（API レスポンスは単一行JSON）
        const cleaned = data.replace(/[\x00-\x1F]/g, " ");
        resolve(JSON.parse(cleaned));
      } catch (e) {
        reject(new Error(`JSON パースエラー: ${e.message}`));
      }
    });
    process.stdin.on("error", reject);
  });
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
  const datetime = formatTs(msg.ts);
  const user = msg.user || msg.username || "unknown";
  const text = msg.text || "";
  return `[${datetime}] (${msg.ts}) ${user}: ${text}`;
}

module.exports = { readStdin, checkOk, formatTs, formatMessage };

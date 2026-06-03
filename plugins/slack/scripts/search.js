"use strict";

const { fetchSlackApiJson, formatTs } = require("./common");
const { dateToUnixTs } = require("./history");

const DEFAULT_COUNT = 3;
const MAX_COUNT = 100;
const PAGE_SIZE = 20;
const MAX_PAGES = 5;
const USAGE =
  "使い方: search.js <keyword...> [count] [--after YYYY-MM-DD] [--before YYYY-MM-DD]\n";

function parseArgs(args) {
  const positional = [];
  let after = "";
  let before = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--after") {
      if (!args[i + 1]) throw new Error("--after には YYYY-MM-DD を指定してください");
      after = args[++i];
    } else if (arg === "--before") {
      if (!args[i + 1]) throw new Error("--before には YYYY-MM-DD を指定してください");
      before = args[++i];
    } else if (arg.startsWith("--")) {
      throw new Error(`不明なオプションです: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  let count = DEFAULT_COUNT;
  const last = positional[positional.length - 1];
  if (/^\d+$/.test(last || "")) {
    count = Math.min(Number(positional.pop()), MAX_COUNT);
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("count には 1 以上の整数を指定してください");
  }

  const query = positional.join(" ").trim();
  if (!query) {
    throw new Error("検索キーワードを指定してください");
  }

  return { query, count, after, before };
}

function buildDateFilters({ after = "", before = "" } = {}) {
  const filters = {};
  if (after) filters.after = Number(dateToUnixTs(after));
  if (before) filters.before = Number(dateToUnixTs(before, true));
  return filters;
}

function buildSearchRequest({ query, count, cursor = "", after = "", before = "" }) {
  const request = {
    query,
    limit: Math.min(count, PAGE_SIZE),
    channel_types: ["public_channel"],
    content_types: ["messages"],
    include_context_messages: false,
    disable_semantic_search: true,
  };
  if (cursor) request.cursor = cursor;
  return { ...request, ...buildDateFilters({ after, before }) };
}

function formatUnavailableError(data) {
  const error = data && data.error ? data.error : "unknown_error";
  if (error === "missing_scope") {
    return "Slack Real-time Search API を利用できません: search:read.public scope が不足しています。";
  }
  if (error === "not_allowed_token_type") {
    return "Slack Real-time Search API を利用できません: このトークン種別では許可されていません。";
  }
  if (error === "access_denied" || error === "no_permission") {
    return `Slack Real-time Search API を利用できません: ${error}`;
  }
  if (error === "feature_not_enabled" || error === "assistant_search_context_disabled") {
    return `Slack Real-time Search API を利用できません: ${error}`;
  }
  return `Slack Real-time Search API を利用できません: ${error}`;
}

async function ensureSearchAvailable(fetchApi = fetchSlackApiJson) {
  const data = await fetchApi("assistant.search.info", {}, { skipCheck: true });
  if (!data.ok) {
    throw new Error(formatUnavailableError(data));
  }
  return data;
}

function getResultText(message) {
  return (
    message.text ||
    message.content ||
    (message.message && message.message.text) ||
    message.preview ||
    "unknown"
  );
}

function normalizeMessageResult(message) {
  const ts = message.message_ts || message.ts || message.timestamp || "";
  const permalink = message.permalink || message.url || "";
  const id = ts || permalink || "unknown";
  const datetime = ts && /^\d+(\.\d+)?$/.test(String(ts)) ? formatTs(ts) : "unknown";
  return {
    datetime,
    channelName:
      message.channel_name ||
      (message.channel && message.channel.name) ||
      message.channel_id ||
      "unknown",
    id,
    user:
      message.author_name ||
      message.user_name ||
      message.author_user_id ||
      message.user ||
      "unknown",
    text: getResultText(message),
  };
}

function formatSearchResult(result) {
  return `[${result.datetime}] #${result.channelName} (${result.id}) ${result.user}: ${result.text}`;
}

function getNextCursor(data) {
  return (
    data.next_cursor ||
    (data.response_metadata && data.response_metadata.next_cursor) ||
    ""
  );
}

async function searchMessages(options, fetchApi = fetchSlackApiJson) {
  await ensureSearchAvailable(fetchApi);

  const results = [];
  let cursor = "";

  for (let page = 0; page < MAX_PAGES && results.length < options.count; page++) {
    const request = buildSearchRequest({
      ...options,
      count: options.count - results.length,
      cursor,
    });
    const data = await fetchApi("assistant.search.context", request, { skipCheck: true });
    if (!data.ok) {
      throw new Error(formatUnavailableError(data));
    }

    for (const message of (data.results && data.results.messages) || []) {
      results.push(normalizeMessageResult(message));
      if (results.length >= options.count) break;
    }

    cursor = getNextCursor(data);
    if (!cursor) break;
  }

  return results;
}

async function main() {
  if (process.argv.length <= 2) {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n${USAGE}`);
    process.exit(1);
  }

  try {
    const results = await searchMessages(options);
    for (const result of results) {
      console.log(formatSearchResult(result));
    }
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_COUNT,
  MAX_COUNT,
  PAGE_SIZE,
  MAX_PAGES,
  parseArgs,
  buildDateFilters,
  buildSearchRequest,
  ensureSearchAvailable,
  normalizeMessageResult,
  formatSearchResult,
  getNextCursor,
  searchMessages,
};

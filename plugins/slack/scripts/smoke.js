"use strict";

const { fetchAllPages, fetchSlackApi } = require("./common");
const { getStatus, runAuth } = require("./slack-auth");
const { searchMessages } = require("./search");

const DEFAULT_CHANNEL = "general";
const DEFAULT_QUERY = "test";
const DEFAULT_COUNT = 3;
const MAX_COUNT = 10;

const USAGE = [
  "使い方: smoke.js [--channel <name|id>] [--query <keyword>] [--count N] [--login] [--show-text]",
  "",
  "実 Slack App / Keychain / Slack API の最小 smoke を実行します。",
  "既定では Slack メッセージ本文を表示せず、件数とメタデータだけを表示します。",
  "",
  "options:",
  `  --channel <name|id>  history 確認に使う public channel。既定: ${DEFAULT_CHANNEL}`,
  `  --query <keyword>    search 確認に使う検索語。既定: ${DEFAULT_QUERY}`,
  `  --count N            history / search の確認件数。1-${MAX_COUNT}。既定: ${DEFAULT_COUNT}`,
  "  --login              token 未保存時に slack-auth login を開始する",
  "  --skip-users         users.list / usergroups.list の確認を省略する",
  "  --skip-history       conversations.history の確認を省略する",
  "  --skip-search        assistant.search.context の確認を省略する",
  "  --show-text          history / search の本文を短く表示する",
  "",
].join("\n");

function parseArgs(args) {
  const options = {
    channel: DEFAULT_CHANNEL,
    query: DEFAULT_QUERY,
    count: DEFAULT_COUNT,
    login: false,
    skipUsers: false,
    skipHistory: false,
    skipSearch: false,
    showText: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--channel") {
      if (!args[i + 1]) throw new Error("--channel には channel name または ID を指定してください。");
      options.channel = args[++i];
    } else if (arg === "--query") {
      if (!args[i + 1]) throw new Error("--query には検索語を指定してください。");
      options.query = args[++i];
    } else if (arg === "--count") {
      if (!args[i + 1]) throw new Error("--count には件数を指定してください。");
      options.count = parseCount(args[++i]);
    } else if (arg === "--login") {
      options.login = true;
    } else if (arg === "--skip-users") {
      options.skipUsers = true;
    } else if (arg === "--skip-history") {
      options.skipHistory = true;
    } else if (arg === "--skip-search") {
      options.skipSearch = true;
    } else if (arg === "--show-text") {
      options.showText = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`不明なオプションです: ${arg}`);
    }
  }

  if (!options.channel.trim()) throw new Error("--channel は空にできません。");
  if (!options.query.trim()) throw new Error("--query は空にできません。");
  return options;
}

function parseCount(value) {
  if (!/^\d+$/.test(String(value))) {
    throw new Error("--count には 1 以上の整数を指定してください。");
  }
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new Error(`--count には 1-${MAX_COUNT} の整数を指定してください。`);
  }
  return count;
}

function normalizeChannelName(channel) {
  return String(channel || "").replace(/^#/, "").trim();
}

function isPublicChannelId(channel) {
  return /^C[A-Z0-9]+$/.test(channel);
}

function resolveTargetChannel(channelArg, channels) {
  const normalized = normalizeChannelName(channelArg);
  if (isPublicChannelId(normalized)) {
    const found = channels.find((channel) => channel.id === normalized);
    return {
      id: normalized,
      name: found ? found.name : normalized,
    };
  }

  const found = channels.find((channel) => channel.name === normalized);
  if (!found) {
    throw new Error(`public channel "${channelArg}" が見つかりません。--channel で存在する public channel を指定してください。`);
  }
  return { id: found.id, name: found.name };
}

function redactSecrets(text) {
  return String(text || "").replace(/\bxox[a-zA-Z0-9._-]*\b/g, "[redacted-token]");
}

function truncateText(text, maxLength = 120) {
  const normalized = redactSecrets(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== "")
  );
}

function summarizeHistoryMessage(message, showText) {
  return compactObject({
    ts: message.ts || "unknown",
    user: message.user || message.username || "unknown",
    text: showText ? truncateText(message.text || "") : undefined,
  });
}

function summarizeSearchResult(result, showText) {
  return compactObject({
    datetime: result.datetime || "unknown",
    channel: result.channelName || "unknown",
    id: result.id || "unknown",
    user: result.user || "unknown",
    text: showText ? truncateText(result.text || "") : undefined,
  });
}

async function ensureStoredToken(options, deps) {
  let status = await deps.getStatus();
  if (status.exists) return { status, loginStarted: false };

  if (!options.login) {
    throw new Error("Slack token は保存されていません。先に slack-auth でログインするか、smoke.js --login を実行してください。");
  }

  await deps.runAuth(["login"]);
  status = await deps.getStatus();
  if (!status.exists) {
    throw new Error("slack-auth login 後も Slack token record を確認できませんでした。");
  }
  return { status, loginStarted: true };
}

function buildAuthTestStep(status) {
  if (status.liveCheck !== "auth.test ok") {
    throw new Error("slack-auth status の live auth.test 確認が完了していません。");
  }
  return {
    name: "auth-test",
    ok: true,
    team: status.workspace || "unknown",
    teamId: status.teamId || "unknown",
    userId: status.user || "unknown",
  };
}

async function runSmoke(options = {}, deps = {}) {
  const smokeOptions = { ...parseArgs([]), ...options, help: false };
  const smokeDeps = {
    getStatus,
    runAuth,
    fetchSlackApi,
    fetchAllPages,
    searchMessages,
    ...deps,
  };

  const steps = [];
  const { status, loginStarted } = await ensureStoredToken(smokeOptions, smokeDeps);
  if (loginStarted) {
    steps.push({ name: "login", ok: true });
  }

  steps.push({
    name: "auth-status",
    ok: true,
    store: status.store,
    workspace: status.workspace,
    teamId: status.teamId,
    user: status.user,
    liveCheck: status.liveCheck,
    expiresAt: status.expiresAt,
  });

  steps.push(buildAuthTestStep(status));

  const channels = await smokeDeps.fetchAllPages(
    "conversations.list",
    { types: "public_channel", limit: "1000" },
    "channels"
  );
  const targetChannel = resolveTargetChannel(smokeOptions.channel, channels);
  steps.push({
    name: "channels",
    ok: true,
    count: channels.length,
    target: `#${targetChannel.name} (${targetChannel.id})`,
  });

  if (!smokeOptions.skipUsers) {
    const users = await smokeDeps.fetchSlackApi("users.list", { limit: String(smokeOptions.count) });
    const usergroups = await smokeDeps.fetchSlackApi("usergroups.list");
    steps.push({
      name: "users",
      ok: true,
      users: (users.members || []).filter((member) => !member.deleted).length,
      usergroups: (usergroups.usergroups || []).length,
    });
  }

  if (!smokeOptions.skipHistory) {
    const history = await smokeDeps.fetchSlackApi("conversations.history", {
      channel: targetChannel.id,
      limit: String(smokeOptions.count),
    });
    const messages = history.messages || [];
    steps.push({
      name: "history",
      ok: true,
      channel: `#${targetChannel.name}`,
      count: messages.length,
      samples: messages.slice(0, smokeOptions.count).map((message) =>
        summarizeHistoryMessage(message, smokeOptions.showText)
      ),
    });
  }

  if (!smokeOptions.skipSearch) {
    const results = await smokeDeps.searchMessages({
      query: smokeOptions.query,
      count: smokeOptions.count,
    });
    steps.push({
      name: "search",
      ok: true,
      query: smokeOptions.query,
      count: results.length,
      samples: results.slice(0, smokeOptions.count).map((result) =>
        summarizeSearchResult(result, smokeOptions.showText)
      ),
    });
  }

  return { ok: true, steps };
}

function formatSamples(samples) {
  if (!samples || samples.length === 0) return "";
  return samples
    .map((sample) => `    - ${JSON.stringify(sample)}`)
    .join("\n");
}

function formatSmokeReport(report) {
  const lines = ["Slack smoke result: PASS"];
  for (const step of report.steps) {
    if (step.name === "login") {
      lines.push("OK login: slack-auth login completed");
    } else if (step.name === "auth-status") {
      lines.push(`OK auth status: store=${step.store} workspace=${step.workspace} team_id=${step.teamId} user=${step.user} expires_at=${step.expiresAt}`);
    } else if (step.name === "auth-test") {
      lines.push(`OK auth.test: team=${step.team} team_id=${step.teamId} user_id=${step.userId}`);
    } else if (step.name === "channels") {
      lines.push(`OK channels: ${step.count} public channels; target ${step.target}`);
    } else if (step.name === "users") {
      lines.push(`OK users: ${step.users} users returned; ${step.usergroups} usergroups returned`);
    } else if (step.name === "history") {
      lines.push(`OK history: ${step.count} messages from ${step.channel}`);
      const formatted = formatSamples(step.samples);
      if (formatted) lines.push(formatted);
    } else if (step.name === "search") {
      lines.push(`OK search: ${step.count} results for "${step.query}"`);
      const formatted = formatSamples(step.samples);
      if (formatted) lines.push(formatted);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n${USAGE}`);
    process.exit(1);
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  try {
    const report = await runSmoke(options);
    process.stdout.write(formatSmokeReport(report));
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_CHANNEL,
  DEFAULT_QUERY,
  DEFAULT_COUNT,
  MAX_COUNT,
  USAGE,
  parseArgs,
  parseCount,
  normalizeChannelName,
  resolveTargetChannel,
  redactSecrets,
  truncateText,
  summarizeHistoryMessage,
  summarizeSearchResult,
  ensureStoredToken,
  buildAuthTestStep,
  runSmoke,
  formatSmokeReport,
};

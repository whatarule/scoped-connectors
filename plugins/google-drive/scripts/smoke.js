"use strict";

const { fetchDriveApi, fetchDriveApiRaw } = require("./providers/drive-http");
const { getStatus, runAuth } = require("./auth/cli");
const { loadAllowlist, verifyFileInAllowlist } = require("./read/access-control");
const { readDriveFile } = require("./read");

const DEFAULT_COUNT = 3;
const MAX_COUNT = 10;

const USAGE = [
  "使い方: smoke.js [--profile name] [--file <URL|fileId>] [--count N] [--login] [--skip-list]",
  "",
  "実 OAuth client / OS secure store / Drive API の最小 smoke を実行します。",
  "既定ではファイルのメタデータだけを確認し、内容は取得・出力しません。",
  "",
  "options:",
  "  --profile <name>      config.json の profile と profile 専用 token store を選択する",
  "  --file <URL|fileId>  フォルダ許可リストの関所を通した実読み取りまで確認する。内容は出力しない",
  `  --count N            list の確認件数。1-${MAX_COUNT}。既定: ${DEFAULT_COUNT}`,
  "  --login              token 未保存時に google-drive-auth login を開始する",
  "  --skip-list          files.list の確認を省略する",
  "",
].join("\n");

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

function parseArgs(args) {
  const options = {
    file: "",
    profile: "",
    count: DEFAULT_COUNT,
    login: false,
    skipList: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--file") {
      if (!args[i + 1]) throw new Error("--file には Drive の URL または fileId を指定してください。");
      options.file = args[++i];
    } else if (arg === "--profile") {
      if (!args[i + 1]) throw new Error("--profile には profile 名を指定してください。");
      options.profile = args[++i];
    } else if (arg === "--count") {
      if (!args[i + 1]) throw new Error("--count には件数を指定してください。");
      options.count = parseCount(args[++i]);
    } else if (arg === "--login") {
      options.login = true;
    } else if (arg === "--skip-list") {
      options.skipList = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`不明なオプションです: ${arg}`);
    }
  }

  return options;
}

function redactSecrets(text) {
  return String(text || "")
    .replace(/\bya29[A-Za-z0-9._-]*/g, "[redacted-token]")
    .replace(/\b1\/\/[A-Za-z0-9._-]*/g, "[redacted-token]");
}

function truncateText(text, maxLength = 120) {
  const normalized = redactSecrets(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

async function ensureStoredToken(options, deps) {
  let status = await deps.getStatus({ profile: options.profile });
  if (status.exists) return { status, loginStarted: false };

  if (!options.login) {
    throw new Error("Google Drive token は保存されていません。先に google-drive-auth でログインするか、smoke.js --login を実行してください。");
  }

  const loginArgs = ["login"];
  if (options.profile) loginArgs.push("--profile", options.profile);
  await deps.runAuth(loginArgs);
  status = await deps.getStatus({ profile: options.profile });
  if (!status.exists) {
    throw new Error("google-drive-auth login 後も Google Drive token record を確認できませんでした。");
  }
  return { status, loginStarted: true };
}

function buildAboutStep(status) {
  if (status.liveCheck !== "about.get ok") {
    throw new Error("google-drive-auth status の live about.get 確認が完了していません。");
  }
  return {
    name: "about",
    ok: true,
    user: status.user || "unknown",
    email: status.email || "unknown",
  };
}

function readResultContentType(result) {
  if (result.plan && result.plan.kind === "export") return result.plan.exportMime || "unknown";
  return (result.meta && result.meta.mimeType) || "unknown";
}

async function runSmoke(options = {}, deps = {}) {
  const smokeOptions = { ...parseArgs([]), ...options, help: false };
  const smokeDeps = {
    getStatus,
    runAuth,
    fetchDriveApi,
    fetchDriveApiRaw,
    loadAllowlist,
    verifyFileInAllowlist,
    readDriveFile,
    ...deps,
  };

  const steps = [];
  const { profile, allowedFolderIds } = smokeDeps.loadAllowlist(undefined, {
    profile: smokeOptions.profile,
  });
  const resolvedOptions = { ...smokeOptions, profile: profile || smokeOptions.profile || "default" };
  const { status, loginStarted } = await ensureStoredToken(resolvedOptions, smokeDeps);
  if (loginStarted) {
    steps.push({ name: "login", ok: true });
  }

  steps.push({
    name: "auth-status",
    ok: true,
    store: status.store,
    user: status.user,
    email: status.email,
    scope: status.scope,
    expiresAt: status.expiresAt,
  });

  steps.push(buildAboutStep(status));

  if (!allowedFolderIds.length) {
    throw new Error("フォルダ許可リストが設定されていません。SETUP.md の allowedFolderIds を設定してください。");
  }
  steps.push({ name: "allowlist", ok: true, count: allowedFolderIds.length });

  if (!smokeOptions.skipList) {
    const folderId = allowedFolderIds[0];
    const list = await smokeDeps.fetchDriveApi(
      "files",
      {
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: String(resolvedOptions.count),
        fields: "files(id,name,mimeType)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      },
      { profile: resolvedOptions.profile }
    );
    const files = (list.data && list.data.files) || [];
    steps.push({
      name: "list",
      ok: true,
      folderId,
      count: files.length,
      samples: files.map((file) => ({
        id: file.id || "unknown",
        name: truncateText(file.name || "unnamed", 60),
        mimeType: file.mimeType || "unknown",
      })),
    });
  }

  if (resolvedOptions.file) {
    const result = await smokeDeps.readDriveFile(
      { target: resolvedOptions.file, profile: resolvedOptions.profile, format: null, force: true },
      {
        loadAllowlist: () => ({ profile, allowedFolderIds }),
        verifyFileInAllowlist: smokeDeps.verifyFileInAllowlist,
        fetchDriveApi: smokeDeps.fetchDriveApi,
        fetchDriveApiRaw: smokeDeps.fetchDriveApiRaw,
      }
    );
    steps.push({
      name: "read",
      ok: true,
      file: truncateText(result.meta.name || "unnamed", 60),
      mimeType: result.meta.mimeType || "unknown",
      bytes: result.buffer.length,
      contentType: readResultContentType(result),
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
  const lines = ["Google Drive smoke result: PASS"];
  for (const step of report.steps) {
    if (step.name === "login") {
      lines.push("OK login: google-drive-auth login completed");
    } else if (step.name === "auth-status") {
      lines.push(`OK auth status: store=${step.store} user=${step.user} email=${step.email} expires_at=${step.expiresAt}`);
    } else if (step.name === "about") {
      lines.push(`OK about.get: user=${step.user} email=${step.email}`);
    } else if (step.name === "allowlist") {
      lines.push(`OK allowlist: ${step.count} allowed folders`);
    } else if (step.name === "list") {
      lines.push(`OK list: ${step.count} files in folder ${step.folderId}`);
      const formatted = formatSamples(step.samples);
      if (formatted) lines.push(formatted);
    } else if (step.name === "read") {
      lines.push(`OK read: ${step.file} (${step.mimeType}) ${step.bytes} bytes as ${step.contentType}`);
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
    process.stderr.write(`エラー: ${redactSecrets(err.message)}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_COUNT,
  MAX_COUNT,
  USAGE,
  parseArgs,
  parseCount,
  redactSecrets,
  truncateText,
  ensureStoredToken,
  buildAboutStep,
  readResultContentType,
  runSmoke,
  formatSmokeReport,
};

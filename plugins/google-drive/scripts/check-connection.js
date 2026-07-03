"use strict";

const { fetchDriveApi } = require("./common");

const USAGE = "使い方: check-connection.js\n";

function parseArgs(args) {
  const options = {};

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`不明なオプションです: ${arg}`);
    }
  }

  return options;
}

async function checkConnection() {
  const about = await fetchDriveApi("about", {
    fields: "user(displayName,emailAddress)",
  });

  return {
    tokenSource: about.tokenSource,
    user: about.data && about.data.user ? about.data.user : {},
  };
}

function formatSuccess(result) {
  const user = result.user || {};
  const displayName = user.displayName || "unknown";
  const email = user.emailAddress ? ` <${user.emailAddress}>` : "";
  return [
    "Google Drive API 接続成功",
    `認証元: ${result.tokenSource}`,
    `ユーザー: ${displayName}${email}`,
  ].join("\n");
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
    const result = await checkConnection();
    process.stdout.write(`${formatSuccess(result)}\n`);
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
  parseArgs,
  checkConnection,
  formatSuccess,
};

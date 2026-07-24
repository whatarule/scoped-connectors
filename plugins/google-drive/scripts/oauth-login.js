"use strict";

const oauthLogin = require("./auth/oauth-login");

if (require.main === module) {
  oauthLogin.main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = oauthLogin;

"use strict";

const {
  missingRequiredScopes,
  unexpectedGrantedScopes,
} = require("./token-runtime");

function validateGrantedScopes(tokenResponse) {
  const scopeText = String((tokenResponse && tokenResponse.scope) || "").trim();
  if (!scopeText) {
    throw new Error(
      "Google token response に scope が含まれていません。同意画面で全ての権限を許可してから google-drive-auth で再ログインしてください。"
    );
  }
  const missing = missingRequiredScopes(scopeText);
  const unexpected = unexpectedGrantedScopes(scopeText);
  if (missing.length === 0 && unexpected.length === 0) return;
  const details = [];
  if (missing.length) details.push(`不足 scope: ${missing.join(", ")}`);
  if (unexpected.length) details.push(`許可されていない scope: ${unexpected.join(", ")}`);
  throw new Error(
    `Google token response の OAuth scope が許可された読み取り専用 scope と一致しません: ${details.join(" / ")}。同意画面で全ての権限を許可してから google-drive-auth で再ログインしてください。`
  );
}

function normalizeGoogleEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function extractEmailDomainFromNormalizedEmail(normalizedEmail) {
  return normalizedEmail.includes("@") ? normalizedEmail.split("@").pop() : "";
}

function extractEmailDomain(email) {
  return extractEmailDomainFromNormalizedEmail(normalizeGoogleEmail(email));
}

function verifyAllowedGoogleAccount(user, allowedDomains) {
  const email = normalizeGoogleEmail((user && user.emailAddress) || "");
  const domain = extractEmailDomainFromNormalizedEmail(email);
  if (!domain) {
    throw new Error("Google Drive about.get response からアカウントのメールアドレスを確認できません。");
  }
  if (!allowedDomains.includes(domain)) {
    throw new Error(
      `許可されていない Google アカウントです: ${email}(許可ドメイン: ${allowedDomains.join(", ")})`
    );
  }

  return {
    user_email: email,
    user_name: user.displayName || "",
  };
}

module.exports = {
  validateGrantedScopes,
  extractEmailDomain,
  verifyAllowedGoogleAccount,
};

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { READONLY_SCOPES } = require("../auth/token-runtime");
const {
  validateGrantedScopes,
  extractEmailDomain,
  verifyAllowedGoogleAccount,
} = require("../auth/login-policy");
const legacyLoginPolicy = require("../policy/google-login");

const FULL_SCOPE = READONLY_SCOPES.join(" ");
const OVERBROAD_SCOPE = "https://www.googleapis.com/auth/drive";

describe("legacy google-login policy wrapper", () => {
  it("auth/login-policy と同じ API を export する", () => {
    assert.equal(legacyLoginPolicy.validateGrantedScopes, validateGrantedScopes);
    assert.equal(legacyLoginPolicy.verifyAllowedGoogleAccount, verifyAllowedGoogleAccount);
  });
});

describe("validateGrantedScopes", () => {
  it("必要 scope が揃っていれば成功する", () => {
    validateGrantedScopes({ scope: FULL_SCOPE });
  });

  it("scope がなければ fail closed で再ログインを促す", () => {
    assert.throws(() => validateGrantedScopes({}), /再ログイン/);
  });

  it("不足 scope を列挙して再ログインを促す", () => {
    assert.throws(
      () => validateGrantedScopes({ scope: READONLY_SCOPES[0] }),
      (err) => {
        assert.match(err.message, /不足 scope/);
        assert.match(err.message, new RegExp(READONLY_SCOPES[1].replace(/[/.]/g, "\\$&")));
        assert.match(err.message, /google-drive-auth/);
        return true;
      }
    );
  });

  it("許可されていない scope を列挙して再ログインを促す", () => {
    assert.throws(
      () => validateGrantedScopes({ scope: `${FULL_SCOPE} ${OVERBROAD_SCOPE}` }),
      (err) => {
        assert.match(err.message, /許可されていない scope/);
        assert.match(err.message, new RegExp(OVERBROAD_SCOPE.replace(/[/.]/g, "\\$&")));
        assert.match(err.message, /google-drive-auth/);
        return true;
      }
    );
  });
});

describe("extractEmailDomain", () => {
  it("メールアドレスを trim・小文字化して domain を返す", () => {
    assert.equal(extractEmailDomain(" User@Compass-E.com "), "compass-e.com");
  });

  it("@ がなければ空文字を返す", () => {
    assert.equal(extractEmailDomain("user"), "");
  });
});

describe("verifyAllowedGoogleAccount", () => {
  it("許可ドメインの user を保存 record 用 metadata に変換する", () => {
    assert.deepEqual(
      verifyAllowedGoogleAccount(
        { displayName: "Example User", emailAddress: " User@Compass-E.com " },
        ["compass-e.com"]
      ),
      {
        user_email: "user@compass-e.com",
        user_name: "Example User",
      }
    );
  });

  it("displayName がなければ user_name は空文字にする", () => {
    assert.equal(
      verifyAllowedGoogleAccount({ emailAddress: "user@compass-e.com" }, ["compass-e.com"])
        .user_name,
      ""
    );
  });

  it("emailAddress が確認できなければ拒否する", () => {
    assert.throws(
      () => verifyAllowedGoogleAccount({}, ["compass-e.com"]),
      /メールアドレスを確認できません/
    );
  });

  it("許可外ドメインは token 保存前に拒否する", () => {
    assert.throws(
      () => verifyAllowedGoogleAccount({ emailAddress: "user@gmail.com" }, ["compass-e.com"]),
      (err) => {
        assert.match(err.message, /許可されていない Google アカウント/);
        assert.match(err.message, /user@gmail\.com/);
        assert.match(err.message, /compass-e\.com/);
        return true;
      }
    );
  });
});

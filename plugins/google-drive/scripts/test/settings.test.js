"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CONFIG_PATH_ENV,
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_CLIENT_ID,
  DEFAULT_CONFIG_PATH,
  DEFAULT_PROFILE,
  getConfigPath,
  normalizeDomains,
  normalizeProfileName,
  resolveProfileName,
  resolveProfileConfig,
  resolveClientId,
  resolveAllowedDomains,
  parseLoginArgs,
  parseProfileArgs,
  normalizeAllowedFolderIds,
  loadReadSettings,
} = require("../settings/config");

function writeTempConfig(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-settings-test-"));
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(configPath, content);
  return configPath;
}

test("getConfigPath: env が config path 既定値より優先される", () => {
  assert.equal(getConfigPath({ [CONFIG_PATH_ENV]: "/tmp/drive-config.json" }), "/tmp/drive-config.json");
  assert.equal(getConfigPath({}), DEFAULT_CONFIG_PATH);
});

test("normalizeDomains: 配列とカンマ区切り文字列を同じ形に正規化する", () => {
  assert.deepEqual(normalizeDomains([" Compass-e.com ", "@example.com", ""]), [
    "compass-e.com",
    "example.com",
  ]);
  assert.deepEqual(normalizeDomains("compass-e.com, example.com"), [
    "compass-e.com",
    "example.com",
  ]);
});

test("profile: CLI、env、config default、既定値の順に解決する", () => {
  assert.equal(resolveProfileName({ profile: "SasaeL" }, { defaultProfile: "compass" }, {}), "sasael");
  assert.equal(resolveProfileName({}, { defaultProfile: "compass" }, { GOOGLE_DRIVE_PROFILE: "sasael" }), "sasael");
  assert.equal(resolveProfileName({}, { defaultProfile: "compass" }, {}), "compass");
  assert.equal(resolveProfileName({}, {}, {}), DEFAULT_PROFILE);
  assert.equal(normalizeProfileName(" Team_1 "), "team_1");
  assert.throws(() => normalizeProfileName("../bad"), /profile/);
});

test("resolveProfileConfig: profile 設定をトップレベル既定値へ重ねる", () => {
  const config = {
    allowedDomains: ["common.example.com"],
    profiles: { sasael: { clientId: "sasael.apps.googleusercontent.com" } },
  };
  assert.deepEqual(resolveProfileConfig(config, "sasael", "/tmp/config.json"), {
    ...config,
    clientId: "sasael.apps.googleusercontent.com",
  });
  assert.throws(() => resolveProfileConfig(config, "compass", "/tmp/config.json"), /profiles\.compass/);
});

test("resolveClientId: CLI、env、config、legacy config、既定値の順に解決する", () => {
  assert.equal(
    resolveClientId(
      { clientId: " cli.apps.googleusercontent.com " },
      { clientId: "config.apps.googleusercontent.com" },
      { GOOGLE_DRIVE_CLIENT_ID: "env.apps.googleusercontent.com" }
    ),
    "cli.apps.googleusercontent.com"
  );
  assert.equal(
    resolveClientId(
      { clientId: "" },
      { clientId: "config.apps.googleusercontent.com" },
      { GOOGLE_DRIVE_CLIENT_ID: " env.apps.googleusercontent.com " }
    ),
    "env.apps.googleusercontent.com"
  );
  assert.equal(
    resolveClientId({ clientId: "" }, { client_id: "legacy.apps.googleusercontent.com" }, {}),
    "legacy.apps.googleusercontent.com"
  );
  assert.equal(resolveClientId({ clientId: "" }, {}, {}), DEFAULT_CLIENT_ID);
});

test("resolveAllowedDomains: env は config より優先され、merge せず replace する", () => {
  assert.deepEqual(
    resolveAllowedDomains(
      { allowedDomains: ["config.example.com"] },
      { GOOGLE_DRIVE_ALLOWED_DOMAINS: "env.example.com" }
    ),
    ["env.example.com"]
  );
  assert.deepEqual(resolveAllowedDomains({}, {}), DEFAULT_ALLOWED_DOMAINS);
});

test("parseLoginArgs: configLoader から login option defaults を適用する", () => {
  const loaded = [];
  const options = parseLoginArgs(
    ["--client-id", "cli.apps.googleusercontent.com"],
    { [CONFIG_PATH_ENV]: "/tmp/config.json" },
    (configPath) => {
      loaded.push(configPath);
      return { allowedDomains: ["example.com"] };
    }
  );

  assert.deepEqual(loaded, ["/tmp/config.json"]);
  assert.equal(options.clientId, "cli.apps.googleusercontent.com");
  assert.deepEqual(options.allowedDomains, ["example.com"]);
  assert.equal(options.configPath, "/tmp/config.json");
});

test("parseLoginArgs / parseProfileArgs: profile ごとの OAuth 設定を選択する", () => {
  const config = {
    defaultProfile: "compass",
    profiles: {
      compass: { clientId: "compass.apps.googleusercontent.com", allowedDomains: ["compass-e.com"] },
      sasael: { clientId: "sasael.apps.googleusercontent.com", allowedDomains: ["sasael.co.jp"] },
    },
  };
  const login = parseLoginArgs(["--profile", "sasael"], {}, () => config);
  assert.equal(login.profile, "sasael");
  assert.equal(login.clientId, "sasael.apps.googleusercontent.com");
  assert.deepEqual(login.allowedDomains, ["sasael.co.jp"]);
  assert.equal(parseProfileArgs([], {}, () => config).profile, "compass");
});

test("parseLoginArgs: help は profile config の存在確認を要求しない", () => {
  const options = parseLoginArgs(["--help", "--profile", "sasael"], {}, () => {
    assert.fail("help では config を読み込まない");
  });
  assert.equal(options.help, true);
  assert.equal(options.profile, "sasael");
});

test("normalizeAllowedFolderIds: allowedFolderIds の型と ID 形式を検証する", () => {
  assert.deepEqual(normalizeAllowedFolderIds(undefined, "/tmp/config.json"), []);
  assert.deepEqual(normalizeAllowedFolderIds(["abc123", "DEF-456_x"], "/tmp/config.json"), [
    "abc123",
    "DEF-456_x",
  ]);
  assert.throws(() => normalizeAllowedFolderIds("abc", "/tmp/config.json"), /文字列配列/);
  assert.throws(() => normalizeAllowedFolderIds(["ok", "bad id!"], "/tmp/config.json"), /不正なID/);
});

test("loadReadSettings: config から allowedFolderIds を読み込む", () => {
  const configPath = writeTempConfig('{ "allowedFolderIds": ["abc123"] }');
  assert.deepEqual(loadReadSettings(configPath), {
    configPath,
    profile: "default",
    allowedFolderIds: ["abc123"],
  });
});

test("loadReadSettings: 指定 profile の allowlist を読み込む", () => {
  const configPath = writeTempConfig(JSON.stringify({
    profiles: {
      compass: { allowedFolderIds: ["COMPASS1"] },
      sasael: { allowedFolderIds: ["SASAEL1"] },
    },
  }));
  assert.deepEqual(loadReadSettings(configPath, { profile: "sasael", env: {} }), {
    configPath,
    profile: "sasael",
    allowedFolderIds: ["SASAEL1"],
  });
});

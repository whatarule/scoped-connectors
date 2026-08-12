const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  denyReasonFromIdPrefix,
  isPublicChannelInfo,
  verifyPublicChannel,
  detectBroadcastMentions,
} = require("../policy/slack-post");

const PUBLIC_INFO = { id: "C123", is_private: false, is_im: false, is_mpim: false };
const PRIVATE_INFO = { id: "C999", is_private: true, is_im: false, is_mpim: false };

function options({ cache = {}, info = PUBLIC_INFO, onInfo } = {}) {
  return {
    lookupCachedChannelId: (name) => cache[name] || null,
    getChannelInfo: async (id) => {
      if (onInfo) onInfo(id);
      if (info instanceof Error) throw info;
      return info;
    },
  };
}

describe("denyReasonFromIdPrefix", () => {
  it("D 始まりの ID を DM として拒否する", () => {
    assert.match(denyReasonFromIdPrefix("D123ABC"), /DM/);
  });

  it("G 始まりの ID を private / group DM として拒否する", () => {
    assert.match(denyReasonFromIdPrefix("G123ABC"), /private/);
  });

  it("C 始まりの ID は先頭文字だけでは拒否しない", () => {
    assert.equal(denyReasonFromIdPrefix("C123ABC"), "");
  });

  it("形式が不正な ID を拒否する", () => {
    assert.match(denyReasonFromIdPrefix("channel-name"), /形式/);
  });
});

describe("isPublicChannelInfo", () => {
  it("3つのフラグがいずれも false なら public とみなす", () => {
    assert.equal(isPublicChannelInfo(PUBLIC_INFO), true);
  });

  it("is_private が true なら public とみなさない", () => {
    assert.equal(isPublicChannelInfo(PRIVATE_INFO), false);
  });

  it("is_im が true なら public とみなさない", () => {
    assert.equal(isPublicChannelInfo({ is_im: true }), false);
  });

  it("is_mpim が true なら public とみなさない", () => {
    assert.equal(isPublicChannelInfo({ is_mpim: true }), false);
  });

  it("channel が無い場合は public とみなさない", () => {
    assert.equal(isPublicChannelInfo(null), false);
  });
});

describe("verifyPublicChannel（名前指定）", () => {
  it("キャッシュにある名前を public として許可する", async () => {
    const result = await verifyPublicChannel("general", options({ cache: { general: "C123" } }));
    assert.equal(result.allowed, true);
    assert.equal(result.channelId, "C123");
  });

  it("先頭の # を無視して解決する", async () => {
    const result = await verifyPublicChannel("#general", options({ cache: { general: "C123" } }));
    assert.equal(result.allowed, true);
  });

  it("キャッシュに無い名前は拒否する", async () => {
    const result = await verifyPublicChannel("secret-room", options({ cache: {} }));
    assert.equal(result.allowed, false);
    assert.match(result.reason, /キャッシュに見つかりません/);
  });

  it("名前指定では conversations.info を呼ばない（キャッシュが public を保証するため）", async () => {
    let called = false;
    await verifyPublicChannel(
      "general",
      options({ cache: { general: "C123" }, onInfo: () => (called = true) })
    );
    assert.equal(called, false);
  });

  it("チャンネル未指定を拒否する", async () => {
    const result = await verifyPublicChannel("", options());
    assert.equal(result.allowed, false);
  });
});

describe("verifyPublicChannel（ID 直指定）", () => {
  it("public チャンネルの ID を許可する", async () => {
    const result = await verifyPublicChannel("C123", options({ info: PUBLIC_INFO }));
    assert.equal(result.allowed, true);
    assert.equal(result.channelId, "C123");
  });

  it("C 始まりでも private チャンネルなら拒否する", async () => {
    const result = await verifyPublicChannel("C999", options({ info: PRIVATE_INFO }));
    assert.equal(result.allowed, false);
    assert.match(result.reason, /public チャンネルではない/);
  });

  it("C 始まりの ID では必ず conversations.info で確認する", async () => {
    let called = false;
    await verifyPublicChannel("C123", options({ onInfo: () => (called = true) }));
    assert.equal(called, true);
  });

  it("DM の ID を API 呼び出し前に拒否する", async () => {
    let called = false;
    const result = await verifyPublicChannel(
      "D123",
      options({ onInfo: () => (called = true) })
    );
    assert.equal(result.allowed, false);
    assert.equal(called, false);
  });

  it("conversations.info が失敗したら拒否する（fail closed）", async () => {
    const result = await verifyPublicChannel(
      "C123",
      options({ info: new Error("channel_not_found") })
    );
    assert.equal(result.allowed, false);
    assert.match(result.reason, /取得できない/);
  });
});

describe("detectBroadcastMentions", () => {
  it("@channel を検出する", () => {
    assert.deepEqual(detectBroadcastMentions("お知らせです @channel"), ["@channel"]);
  });

  it("Slack 記法の <!here> を検出する", () => {
    assert.deepEqual(detectBroadcastMentions("<!here> 確認お願いします"), ["@here"]);
  });

  it("複数のブロードキャストを検出する", () => {
    assert.deepEqual(detectBroadcastMentions("@channel @here"), ["@channel", "@here"]);
  });

  it("ブロードキャストが無ければ空配列を返す", () => {
    assert.deepEqual(detectBroadcastMentions("こんにちは @daishi"), []);
  });

  it("単語の一部を誤検出しない", () => {
    assert.deepEqual(detectBroadcastMentions("@channels や @herecomes は対象外"), []);
  });
});

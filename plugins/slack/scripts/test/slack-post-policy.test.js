const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  denyReasonFromIdPrefix,
  channelDenyReason,
  verifyPostableChannel,
  detectBroadcastMentions,
} = require("../policy/slack-post");

const PUBLIC_INFO = { id: "C123", is_private: false, is_member: true };
const PRIVATE_INFO = { id: "C999", is_private: true, is_member: true };
const NOT_JOINED_INFO = { id: "C888", is_private: false, is_member: false };

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

  it("C 始まりの ID は先頭文字だけでは拒否しない", () => {
    assert.equal(denyReasonFromIdPrefix("C123ABC"), "");
  });

  it("G 始まりの ID も先頭文字だけでは拒否しない（private channel の可能性がある）", () => {
    assert.equal(denyReasonFromIdPrefix("G123ABC"), "");
  });

  it("形式が不正な ID を拒否する", () => {
    assert.match(denyReasonFromIdPrefix("channel-name"), /形式/);
  });
});

describe("channelDenyReason", () => {
  it("参加済みの public チャンネルを許可する", () => {
    assert.equal(channelDenyReason(PUBLIC_INFO), "");
  });

  it("参加済みの private チャンネルを許可する", () => {
    assert.equal(channelDenyReason(PRIVATE_INFO), "");
  });

  it("DM を拒否する", () => {
    assert.match(channelDenyReason({ is_im: true }), /DM/);
  });

  it("グループ DM を拒否する", () => {
    assert.match(channelDenyReason({ is_mpim: true }), /DM/);
  });

  it("参加していないチャンネルを拒否する", () => {
    assert.match(channelDenyReason(NOT_JOINED_INFO), /参加していない/);
  });

  it("channel が無い場合は拒否する", () => {
    assert.match(channelDenyReason(null), /取得できません/);
  });
});

describe("verifyPostableChannel（名前指定）", () => {
  it("キャッシュにある名前を許可する", async () => {
    const result = await verifyPostableChannel("general", options({ cache: { general: "C123" } }));
    assert.equal(result.allowed, true);
    assert.equal(result.channelId, "C123");
  });

  it("先頭の # を無視して解決する", async () => {
    const result = await verifyPostableChannel("#general", options({ cache: { general: "C123" } }));
    assert.equal(result.allowed, true);
  });

  it("キャッシュに無い名前は拒否し、ID 指定を案内する", async () => {
    const result = await verifyPostableChannel("secret-room", options({ cache: {} }));
    assert.equal(result.allowed, false);
    assert.match(result.reason, /チャンネル ID で指定/);
  });

  it("名前指定では conversations.info を呼ばない（キャッシュが public を保証するため）", async () => {
    let called = false;
    await verifyPostableChannel(
      "general",
      options({ cache: { general: "C123" }, onInfo: () => (called = true) })
    );
    assert.equal(called, false);
  });

  it("チャンネル未指定を拒否する", async () => {
    const result = await verifyPostableChannel("", options());
    assert.equal(result.allowed, false);
  });
});

describe("verifyPostableChannel（ID 直指定）", () => {
  it("参加済みの public チャンネルの ID を許可する", async () => {
    const result = await verifyPostableChannel("C123", options({ info: PUBLIC_INFO }));
    assert.equal(result.allowed, true);
    assert.equal(result.channelId, "C123");
  });

  it("参加済みの private チャンネルの ID を許可する", async () => {
    const result = await verifyPostableChannel("C999", options({ info: PRIVATE_INFO }));
    assert.equal(result.allowed, true);
  });

  it("参加していないチャンネルを拒否する", async () => {
    const result = await verifyPostableChannel("C888", options({ info: NOT_JOINED_INFO }));
    assert.equal(result.allowed, false);
    assert.match(result.reason, /参加していない/);
  });

  it("ID 直指定では必ず conversations.info で確認する", async () => {
    let called = false;
    await verifyPostableChannel("C123", options({ onInfo: () => (called = true) }));
    assert.equal(called, true);
  });

  it("DM の ID を API 呼び出し前に拒否する", async () => {
    let called = false;
    const result = await verifyPostableChannel("D123", options({ onInfo: () => (called = true) }));
    assert.equal(result.allowed, false);
    assert.equal(called, false);
  });

  it("グループ DM は conversations.info の結果で拒否する", async () => {
    const result = await verifyPostableChannel("G123", options({ info: { is_mpim: true } }));
    assert.equal(result.allowed, false);
    assert.match(result.reason, /DM/);
  });

  it("conversations.info が失敗したら拒否する（fail closed）", async () => {
    const result = await verifyPostableChannel(
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

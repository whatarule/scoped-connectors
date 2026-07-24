const { EventEmitter } = require("node:events");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { promptHiddenInput } = require("../auth/secret-input");
const legacySecretInput = require("../secret-input");

class FakeStdin extends EventEmitter {
  constructor({ isTTY = true } = {}) {
    super();
    this.isTTY = isTTY;
    this.rawModes = [];
    this.resumed = false;
    this.paused = false;
  }

  setRawMode(value) {
    this.rawModes.push(value);
  }

  resume() {
    this.resumed = true;
  }

  pause() {
    this.paused = true;
  }
}

class FakeStderr {
  constructor() {
    this.writes = [];
  }

  write(value) {
    this.writes.push(value);
  }

  toString() {
    return this.writes.join("");
  }
}

describe("legacy secret-input wrapper", () => {
  it("auth/secret-input と同じ API を export する", () => {
    assert.equal(legacySecretInput.promptHiddenInput, promptHiddenInput);
  });
});

describe("promptHiddenInput", () => {
  it("TTY から Enter までの入力を読み、前後の空白を trim する", async () => {
    const stdin = new FakeStdin();
    const stderr = new FakeStderr();
    const promise = promptHiddenInput("secret: ", { stdin, stderr });

    stdin.emit("data", Buffer.from("  typed-secret  \n"));

    assert.equal(await promise, "typed-secret");
    assert.equal(stdin.resumed, true);
    assert.equal(stdin.paused, true);
    assert.deepEqual(stdin.rawModes, [true, false]);
    assert.equal(stderr.toString(), "secret: \n");
  });

  it("Backspace と Delete で直前の文字を消す", async () => {
    const stdin = new FakeStdin();
    const stderr = new FakeStderr();
    const promise = promptHiddenInput("secret: ", { stdin, stderr });

    stdin.emit("data", Buffer.from("ab\bcd\u007fe\r"));

    assert.equal(await promise, "ace");
  });

  it("Ctrl-C で中断し、raw mode と listener を戻す", async () => {
    const stdin = new FakeStdin();
    const stderr = new FakeStderr();
    const promise = promptHiddenInput("secret: ", { stdin, stderr });

    stdin.emit("data", Buffer.from("\u0003"));

    await assert.rejects(promise, /入力が中断/);
    assert.equal(stdin.paused, true);
    assert.deepEqual(stdin.rawModes, [true, false]);
    assert.equal(stdin.listenerCount("data"), 0);
    assert.equal(stderr.toString(), "secret: \n");
  });

  it("非TTYでは対話入力できない", async () => {
    const stdin = new FakeStdin({ isTTY: false });
    const stderr = new FakeStderr();

    await assert.rejects(
      () => promptHiddenInput("secret: ", { stdin, stderr }),
      /TTY のあるターミナル/
    );
    assert.equal(stderr.toString(), "");
  });
});

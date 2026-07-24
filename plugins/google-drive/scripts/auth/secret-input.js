"use strict";

// 入力値を echo せずに1行読む。secret を shell 履歴・ps・ディスクに残さないための入口
function promptHiddenInput(question, streams = {}) {
  const stdin = streams.stdin || process.stdin;
  const stderr = streams.stderr || process.stderr;
  if (!stdin.isTTY) {
    return Promise.reject(
      new Error("client secret を対話入力できません。TTY のあるターミナルで実行してください。")
    );
  }

  stderr.write(question);
  return new Promise((resolve, reject) => {
    stdin.resume();
    if (stdin.setRawMode) stdin.setRawMode(true);
    let value = "";

    const finish = (err, result) => {
      if (stdin.setRawMode) stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stderr.write("\n");
      if (err) reject(err);
      else resolve(result);
    };

    const onData = (buf) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          finish(null, value.trim());
          return;
        }
        if (ch === "\u0003") {
          finish(new Error("client secret の入力が中断されました。"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };

    stdin.on("data", onData);
  });
}

module.exports = {
  promptHiddenInput,
};

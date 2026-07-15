"use strict";

function validateAuthorizationCallback({
  error = "",
  code = "",
  returnedState = "",
  expectedState = "",
  errorResponseBody = "Authorization failed. You can close this tab.",
  invalidResponseBody = "Invalid authorization response. You can close this tab.",
}) {
  if (error) {
    const err = new Error(`認可が失敗しました: ${error}`);
    err.responseBody = errorResponseBody;
    throw err;
  }
  if (!code || returnedState !== expectedState) {
    const err = new Error("認可レスポンスが不正です。");
    err.responseBody = invalidResponseBody;
    throw err;
  }
  return code;
}

module.exports = {
  validateAuthorizationCallback,
};

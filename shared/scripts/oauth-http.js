"use strict";

async function postFormForJson(url, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

module.exports = {
  postFormForJson,
};

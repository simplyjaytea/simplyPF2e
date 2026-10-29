// Endpoint classification in settings.mjs: the DeepSeek first-party host check and the keyless-local
// address check. Both are pure (settings.mjs has no top-level Foundry access).
// Run: node tests/settings.endpoints.test.mjs
import assert from "node:assert/strict";
import { isOfficialDeepSeekEndpoint, isLikelyKeylessLocalEndpoint } from "../scripts/settings.mjs";

// DeepSeek: only the first-party host, case-insensitive and with an optional trailing dot. Suffix or
// lookalike hosts are not first-party.
for (const url of ["https://api.deepseek.com/v1", "https://api.deepseek.com", "https://API.DeepSeek.com/v1", "https://api.deepseek.com./v1"]) {
  assert.equal(isOfficialDeepSeekEndpoint(url), true, `${url} is DeepSeek's API`);
}
for (const url of [
  "https://api.deepseek.com.evil.net/v1",
  "https://deepseek.com/v1",
  "https://evil.example/api.deepseek.com/v1",
  "https://notapi.deepseek.com/v1",
  "http://localhost:11434/v1",
  "", "not a url"
]) {
  assert.equal(isOfficialDeepSeekEndpoint(url), false, `${JSON.stringify(url)} is not DeepSeek's API`);
}

// Keyless local: loopback, the local-name suffixes, private ranges and link-local, with the 172.16/12 bounds.
for (const url of [
  "http://localhost:11434/v1", "http://box.localhost:1234/v1", "http://printer.local/v1",
  "http://127.0.0.1:1234/v1", "http://10.0.0.5/v1", "http://192.168.1.10:8080/v1",
  "http://169.254.1.1/v1", "http://169.254.169.254/latest",
  "http://172.16.0.1/v1", "http://172.31.255.1/v1",
  "http://[::1]:11434/v1", "http://[fe80::1]/v1", "http://[fd00::1]/v1", "http://[fc00::1]/v1"
]) {
  assert.equal(isLikelyKeylessLocalEndpoint(url), true, `${url} is a keyless local address`);
}
for (const url of [
  "http://169.255.0.1/v1", "http://172.15.0.1/v1", "http://172.32.0.1/v1",
  "https://api.openai.com/v1", "https://example.com/v1", "http://1.2.3.4/v1",
  "http://[2001:db8::1]/v1", "", "not a url"
]) {
  assert.equal(isLikelyKeylessLocalEndpoint(url), false, `${JSON.stringify(url)} is not a keyless local address`);
}

console.log("settings.endpoints.test.mjs: DeepSeek host match and keyless-local address ranges pinned");

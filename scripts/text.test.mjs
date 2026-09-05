// Pure HTML escaping independent of Foundry globals.
// Run: node scripts/text.test.mjs
import assert from "node:assert/strict";
import { esc, toHtml } from "./text.mjs";

const originalFoundry = Object.getOwnPropertyDescriptor(globalThis, "foundry");
const hostileText = `<img src="x" onerror='alert(1)'> & already &lt;`;
const escapedText = "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; &amp; already &amp;lt;";

try {
  delete globalThis.foundry;
  assert.equal(esc(hostileText), escapedText, "HTML must be escaped without a Foundry global");

  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(0), "0");
  assert.equal(esc("ordinary text"), "ordinary text");
  assert.equal(toHtml(null), "");
  assert.equal(toHtml(undefined), "");
  assert.equal(toHtml(""), "");
  assert.equal(
    toHtml("  <b>First</b> & friends\ncontinued  \n\n  Second 'paragraph'  "),
    "<p>&lt;b&gt;First&lt;/b&gt; &amp; friends\ncontinued</p><p>Second &#39;paragraph&#39;</p>",
    "paragraph wrapping must preserve text structure and escape every paragraph"
  );

  let nativeCalls = 0;
  for (const nativeHelper of [
    (value) => value,
    () => { throw new Error("native helper must not run"); }
  ]) {
    globalThis.foundry = { utils: { escapeHTML(value) {
      nativeCalls += 1;
      return nativeHelper(value);
    } } };
    assert.equal(esc(hostileText), escapedText, "native helpers must not affect quoted-attribute escaping");
  }
  assert.equal(nativeCalls, 0, "HTML escaping must not consult Foundry helpers");
} finally {
  if (originalFoundry) Object.defineProperty(globalThis, "foundry", originalFoundry);
  else delete globalThis.foundry;
}

console.log("text.test.mjs: pure HTML escaping assertions passed");

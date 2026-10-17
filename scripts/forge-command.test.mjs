// /forge command grammar and the shared request contract. Every typed line is
// routed through the same pattern and runner that the chat registry uses.
// Run: node scripts/forge-command.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FORGE_COMMAND_PATTERN, FORGE_LEVEL_RANGE, parseForgeArguments, runForgeCommand, validateForgeRequest
} from "./forge-command.mjs";

function harness(refusal = null) {
  const notices = [];
  const starts = [];
  // Ordinary chat has no matching pattern, so it is posted. A matched command
  // returns false from its callback and is therefore suppressed.
  const type = (text) => {
    const match = FORGE_COMMAND_PATTERN.exec(text);
    if (!match) return "posted";
    const outcome = runForgeCommand(match[1], {
      refusal: () => refusal,
      notify: (key, data) => notices.push({ key, data }),
      start: (request) => { starts.push(request); return Promise.resolve(true); }
    });
    return outcome === false ? "suppressed" : "posted";
  };
  return { type, notices, starts };
}

// Only a leading command word is a command. Similar words and mid-sentence
// mentions are ordinary chat and must pass through unchanged.
{
  const { type, starts } = harness();
  for (const text of ["hello table", "say /forge swamp 6", "/forgeswamp 6", "/forge-x 6", "/forging 6", "/fo rge 6", "", "   "]) {
    assert.equal(type(text), "posted", `ordinary chat ${JSON.stringify(text)} passes through`);
  }
  assert.equal(type("   /forge swamp hag 6"), "suppressed", "leading whitespace still reaches the command");
  assert.equal(type("/FORGE Swamp Hag 6"), "suppressed", "the command word is case-insensitive");
  assert.equal(starts.length, 2);
}

// Valid input: the brief is normalized, the level is the final word, and the
// intent defaults to generation. Whitespace and line breaks never change meaning.
{
  const { type, starts, notices } = harness();
  assert.equal(type("/forge swamp hag 6"), "suppressed");
  assert.deepEqual(starts.at(-1), { prompt: "swamp hag", level: 6, intent: "generate" });
  assert.equal(type("/forge   swamp \t hag\n   6  "), "suppressed");
  assert.deepEqual(starts.at(-1), { prompt: "swamp hag", level: 6, intent: "generate" });
  assert.equal(type("/forge swamp hag\n6"), "suppressed");
  assert.deepEqual(starts.at(-1), { prompt: "swamp hag", level: 6, intent: "generate" });
  assert.equal(notices.length, 0, "valid commands produce no refusal notice");
}

// The explicit preview option may sit at either end, in any letter case.
{
  const { type, starts } = harness();
  type("/forge --preview swamp hag 6");
  assert.equal(starts.at(-1).intent, "preview");
  type("/forge swamp hag 6 --preview");
  assert.equal(starts.at(-1).intent, "preview");
  type("/forge --PREVIEW swamp hag 6");
  assert.deepEqual(starts.at(-1), { prompt: "swamp hag", level: 6, intent: "preview" });
}

// Digits inside the brief are fine; only the final word is the level.
{
  const { starts } = harness();
  const parsed = parseForgeArguments("swamp 2 hags 6");
  assert.deepEqual(parsed, { ok: true, request: { prompt: "swamp 2 hags", level: 6, intent: "generate" } });
  assert.equal(starts.length, 0);
}

// Refused by the gate: the line is suppressed, the reason is reported, and no
// request is started, so nothing reaches the provider.
{
  const { type, notices, starts } = harness({ code: "disabled", localizeKey: "SIMPLYPF2E.Experimental.Disabled" });
  assert.equal(type("/forge swamp hag 6"), "suppressed");
  assert.deepEqual(notices, [{ key: "SIMPLYPF2E.Experimental.Disabled", data: undefined }]);
  assert.equal(starts.length, 0);
}

// Malformed lines are reported with the specific reason and never start a run.
// Refused and malformed commands are suppressed like valid ones.
{
  const { type, notices, starts } = harness();
  const cases = [
    ["/forge", "SIMPLYPF2E.Chat.ForgeUsage"],
    ["/forge   ", "SIMPLYPF2E.Chat.ForgeUsage"],
    ["/forge --preview", "SIMPLYPF2E.Chat.ForgeUsage"],
    ["/forge 6", "SIMPLYPF2E.Chat.ForgeNoBrief"],
    ["/forge --preview 6", "SIMPLYPF2E.Chat.ForgeNoBrief"],
    ["/forge    6  ", "SIMPLYPF2E.Chat.ForgeNoBrief"],
    ["/forge swamp hag", "SIMPLYPF2E.Chat.ForgeLevel"],
    ["/forge swamp hag six", "SIMPLYPF2E.Chat.ForgeLevel"],
    ["/forge swamp hag 1.5", "SIMPLYPF2E.Chat.ForgeLevel"],
    ["/forge swamp hag +6", "SIMPLYPF2E.Chat.ForgeLevel"],
    ["/forge swamp hag 6 extra", "SIMPLYPF2E.Chat.ForgeLevel"],
    ["/forge swamp hag 25", "SIMPLYPF2E.Chat.ForgeLevel"],
    ["/forge swamp hag -2", "SIMPLYPF2E.Chat.ForgeLevel"],
    ["/forge swamp --preview hag 6", "SIMPLYPF2E.Chat.ForgeOption"],
    ["/forge --force swamp hag 6", "SIMPLYPF2E.Chat.ForgeOption"],
    ["/forge swamp hag 6 --force", "SIMPLYPF2E.Chat.ForgeOption"],
    ["/forge --preview swamp hag 6 --preview", "SIMPLYPF2E.Chat.ForgeOption"]
  ];
  for (const [text, key] of cases) {
    notices.length = 0;
    assert.equal(type(text), "suppressed", `${JSON.stringify(text)} is consumed rather than posted`);
    assert.equal(notices.at(-1)?.key, key, `${JSON.stringify(text)} reports ${key}`);
    assert.equal(starts.length, 0, `${JSON.stringify(text)} never starts a run`);
  }
  // Usage and level messages carry the exact range, so the text cannot drift from the rule.
  const levelNotice = (() => { notices.length = 0; type("/forge swamp hag 25"); return notices[0]; })();
  assert.deepEqual(levelNotice.data, FORGE_LEVEL_RANGE);
}

// The inclusive level boundaries are accepted; the values beyond them are not.
{
  const { type, starts } = harness();
  for (const level of [-1, 0, 24]) {
    assert.equal(type(`/forge swamp hag ${level}`), "suppressed");
    assert.equal(starts.at(-1).level, level);
  }
  assert.equal(starts.length, 3);
}

// The API contract refuses by type rather than coercing: a string level is not
// accepted, and intent must be stated explicitly.
{
  const valid = { prompt: "  swamp   hag ", level: 6, intent: "preview" };
  assert.deepEqual(validateForgeRequest(valid), { ok: true, request: { prompt: "swamp hag", level: 6, intent: "preview" } });
  const refused = [
    [undefined, "SIMPLYPF2E.Chat.ForgeNoBrief"],
    [null, "SIMPLYPF2E.Chat.ForgeNoBrief"],
    [{ prompt: undefined, level: 6, intent: "generate" }, "SIMPLYPF2E.Chat.ForgeNoBrief"],
    [{ prompt: { toString: () => "swamp hag" }, level: 6, intent: "generate" }, "SIMPLYPF2E.Chat.ForgeNoBrief"],
    [{ prompt: "   ", level: 6, intent: "generate" }, "SIMPLYPF2E.Chat.ForgeNoBrief"],
    [{ prompt: "swamp", level: "6", intent: "generate" }, "SIMPLYPF2E.Chat.ForgeLevel"],
    [{ prompt: "swamp", level: 6.5, intent: "generate" }, "SIMPLYPF2E.Chat.ForgeLevel"],
    [{ prompt: "swamp", level: Number.NaN, intent: "generate" }, "SIMPLYPF2E.Chat.ForgeLevel"],
    [{ prompt: "swamp", level: 25, intent: "generate" }, "SIMPLYPF2E.Chat.ForgeLevel"],
    [{ prompt: "swamp", level: 6 }, "SIMPLYPF2E.Chat.ForgeIntent"],
    [{ prompt: "swamp", level: 6, intent: "create" }, "SIMPLYPF2E.Chat.ForgeIntent"]
  ];
  for (const [input, key] of refused) {
    assert.equal(validateForgeRequest(input).key, key, `refused: ${JSON.stringify(input)}`);
    assert.equal(validateForgeRequest(input).ok, false);
  }
}

// The runner starts the request synchronously, so the app's busy reservation is
// in place before the chat callback returns. A rejected start is logged, not thrown.
{
  let started = false;
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const outcome = runForgeCommand("swamp 6", {
      refusal: () => null,
      notify: () => {},
      start: () => { started = true; return Promise.reject(new Error("request failed")); }
    });
    assert.equal(started, true, "start runs before the chat callback returns");
    assert.equal(outcome, false);
    const throwing = runForgeCommand("swamp 6", {
      refusal: () => null,
      notify: () => {},
      start: () => { throw new Error("synchronous failure"); }
    });
    assert.equal(throwing, false, "a synchronous start failure is contained");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logged.length, 2, "both failures are logged");
  } finally {
    console.error = originalError;
  }
}

// Every message this feature can show exists in English, and each parameterized
// message names exactly the placeholders that the code supplies as data.
{
  const lang = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8")).SIMPLYPF2E;
  const messageAt = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
  const placeholders = { ForgeUsage: ["min", "max"], ForgeLevel: ["min", "max"] };
  for (const key of [
    "Chat.ForgeUsage", "Chat.ForgeNoBrief", "Chat.ForgeLevel", "Chat.ForgeOption", "Chat.ForgeIntent", "Chat.ForgeBusy",
    "Chat.ForgeResultPending",
    "Experimental.GMOnly", "Experimental.Disabled", "Settings.ExperimentalTools.Name", "Settings.ExperimentalTools.Hint",
    "Errors.WrongSystem", "Generator.NoApiKey"
  ]) {
    const text = messageAt(key);
    assert.equal(typeof text, "string", `${key} exists in en.json`);
    const expected = placeholders[key.split(".").at(-1)] ?? [];
    const found = [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    assert.deepEqual(found, expected, `${key} placeholders match the data supplied by the code`);
  }
}

console.log("forge-command.test.mjs: grammar, options, level bounds, refusals, the request contract and messages passed");

import { MODULE_ID } from "./settings.mjs";

/*
 * `/forge <brief> <level>` parsing, and the single request contract shared by
 * the chat command and GeneratorApp's public entry point. This file touches no
 * Foundry globals itself; notify, refusal and start are injected by the caller.
 */

/** Matches a typed line that begins with the command word. The rest is captured. */
export const FORGE_COMMAND_PATTERN = /^\s*\/forge(?=\s|$)([\s\S]*)$/i;

const FORGE_PREVIEW_OPTION = "--preview";

/** Monster-mode creature levels: the generator's own Single-creature range. */
export const FORGE_LEVEL_RANGE = Object.freeze({ min: -1, max: 24 });

const WHOLE_NUMBER_TOKEN = /^-?\d+$/;
const isPreviewOption = (token) => token?.toLowerCase() === FORGE_PREVIEW_OPTION;

/**
 * Validate a request for the generator's public entry point. Types are strict:
 * a level sent as a string is refused rather than coerced. Intent is required,
 * so no caller can accidentally create an actor by omitting it.
 */
export function validateForgeRequest(input) {
  const { prompt, level, intent } = input ?? {};
  if (typeof prompt !== "string") return { ok: false, key: "SIMPLYPF2E.Chat.ForgeNoBrief" };
  const brief = prompt.replace(/\s+/g, " ").trim();
  if (!brief) return { ok: false, key: "SIMPLYPF2E.Chat.ForgeNoBrief" };
  if (!Number.isInteger(level) || level < FORGE_LEVEL_RANGE.min || level > FORGE_LEVEL_RANGE.max) {
    return { ok: false, key: "SIMPLYPF2E.Chat.ForgeLevel", data: { ...FORGE_LEVEL_RANGE } };
  }
  if (intent !== "generate" && intent !== "preview") return { ok: false, key: "SIMPLYPF2E.Chat.ForgeIntent" };
  return { ok: true, request: { prompt: brief, level, intent } };
}

/**
 * Parse the text after `/forge`. A single `--preview` may sit at either end.
 * Any other `--` token is rejected instead of being read into the brief, so a
 * misplaced option cannot quietly turn a preview into a creation.
 */
export function parseForgeArguments(args = "") {
  const tokens = String(args ?? "").trim().split(/\s+/).filter(Boolean);
  let intent = "generate";
  if (isPreviewOption(tokens[0])) {
    intent = "preview";
    tokens.shift();
  } else if (isPreviewOption(tokens.at(-1))) {
    intent = "preview";
    tokens.pop();
  }
  if (!tokens.length) return { ok: false, key: "SIMPLYPF2E.Chat.ForgeUsage", data: { ...FORGE_LEVEL_RANGE } };
  if (tokens.some((token) => token.startsWith("--"))) return { ok: false, key: "SIMPLYPF2E.Chat.ForgeOption" };
  // The level is always the final word, so a brief can contain numbers freely.
  const levelToken = tokens.pop();
  if (!WHOLE_NUMBER_TOKEN.test(levelToken)) {
    return { ok: false, key: "SIMPLYPF2E.Chat.ForgeLevel", data: { ...FORGE_LEVEL_RANGE } };
  }
  return validateForgeRequest({ prompt: tokens.join(" "), level: Number(levelToken), intent });
}

/**
 * Run one `/forge` line. Every outcome suppresses the typed line, so a refused
 * or malformed command is reported and never posted to chat. A valid command
 * reaches the provider only through `start`, which owns the busy and gate checks.
 */
export function runForgeCommand(args, { refusal, notify, start }) {
  const blocked = refusal();
  if (blocked) {
    notify(blocked.localizeKey);
    return false;
  }
  const parsed = parseForgeArguments(args);
  if (!parsed.ok) {
    notify(parsed.key, parsed.data);
    return false;
  }
  // The executor runs synchronously, so a synchronous throw from start is caught
  // here and the busy reservation inside start still happens before we return.
  new Promise((resolve) => resolve(start(parsed.request))).catch((err) => {
    console.error(`${MODULE_ID} | /forge request failed`, err);
  });
  return false;
}

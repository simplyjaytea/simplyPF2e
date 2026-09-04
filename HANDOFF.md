# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `d47bbcb` (PR #87) / release **v0.3.5.47**. This session did not merge or release.
- Active branch: `cursor/connection-bank-e6ea`, rebased onto that main tip.
- Feature: a client-side **connection bank** so the GM can save named AI provider profiles (DeepSeek, a custom OpenAI-compatible endpoint, local Ollama, …) and switch the active one without re-entering URL/key/model.
- Live request config is unchanged in shape: `getProviderRequestConfig()` still reads the four live settings (`apiBaseUrl` / `model` / `apiKey` / `apiKeyBaseUrl`) and only releases a key when its binding matches the exact URL. Named profiles live in a new client-scoped `providerBank` object (`config: false`). Switching copies a profile into those live settings; saving copies live settings back onto the active profile. New profiles start with an empty key and never copy another endpoint's secret.
- First Provider Setup open or save migrates the legacy single endpoint/key/model into one named profile (inferred from `describeProvider`, e.g. "DeepSeek"). Generator/item-forge headers show that name and, once two or more profiles exist, a compact `<select>` for one-click switch. Setup has list/select/create/rename/delete; the last profile cannot be deleted. Save & Test / Save & Authorize still authorize the active profile's exact URL.
- Fail-closed invariants kept: empty remote key still blocks; mixed-content HTTPS→HTTP still blocks; unbound keys are not sent; malformed bank entries without ids are dropped. No fuzzy JSON salvage; PR #87's matching-brace parse remains as published on main.
- Rebase onto `d47bbcb` conflicted only in HANDOFF.md, CLAUDE.md, and HISTORY.md (session docs). `scripts/ai.mjs` auto-merged: connection-bank model/key path plus #87 parse diagnostics. After rebase: `node --check` 9/9 touched `.mjs`; all 59 `scripts/*.test.mjs` pass.
- No VPS mutation, no merge to `main`. Live Foundry QA still required: save DeepSeek + a custom provider, switch from the header, confirm generation uses the active profile, and confirm a mismatched/empty remote key stays blocked.

## Next step

Review PR #88 (do not merge to `main` from this agent). After release, live-check two saved connections and a header switch. Dice/random UI unify and the feat prerequisite evaluator remain later slices.

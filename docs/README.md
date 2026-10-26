# Documentation map

Users start with the root [README](../README.md) for installation, supported behavior and user-facing limits. Agents start at [PLAYBOOK.md](../PLAYBOOK.md), then the live session baton in [HANDOFF.md](../HANDOFF.md). [PLAYBOOK.md](../PLAYBOOK.md) owns scope, architecture, invariants and operating rules; [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md) are pointers to it. [HANDOFF.md](../HANDOFF.md) is the live baton, and [HISTORY.md](HISTORY.md), which lives in this folder, is the session log with recurring bug patterns.

## Live ledger

| Record | Purpose |
| --- | --- |
| [Acceptance ledger](acceptance-ledger.md) | The single live native-QA ledger (R01–R25 and N01–N08). Rows are updated in place when native evidence lands. |

## Plans

| Record | Purpose |
| --- | --- |
| [Sprint plan, October 25](plans/sprint-2026-10-25.md) | Three work packages: integrity gate, gated level-shift UI, .74 parity + Batch A runbook; integration/review protocol |
| [QA Batch A runbook, October 25](plans/qa-batch-a-2026-10-25.md) | Operator script for R01/N01/R06/R02/R07/R21 on v0.3.5.74 with ceilings, stop rule and ledger paste-back |
| [Completion execution, October 17](plans/completion-execution-2026-10-17.md) | Execution ledger defining chunks C01–C13, their dependencies and integration status |
| [Completion proposal, October 17](plans/completion-proposal-2026-10-17.md) | Proposed remaining phases, completion criteria and bounded QA/release gates after PR #113 |
| [Completion plan, September 15](plans/completion-plan-2026-09-15.md) | Ordered readiness/roadmap work, Luna delegation and completion gates |
| [NPC prerequisite plan](plans/npc-feat-plan-2026-09-09.md) | Historical design and scope for the automatic ability implementation |

## Reviews

| Record | Purpose |
| --- | --- |
| [Completion-plan review, October 17](reviews/completion-review-2026-10-17.md) | Opus 5.5 high review, parent assessment and outstanding scope decisions |
| [Ship readiness, September 12](reviews/ship-readiness-2026-09-12.md) | Assessment of v0.3.5.70 and prioritized acceptance gaps |
| [Forge/generator audit](reviews/audit-2026-09-05.md) | Historical defects and the .63 baseline audit; later records supersede pending-release statements |

## Evidence

| Record | Purpose |
| --- | --- |
| [Release parity, v0.3.5.74](evidence/release-parity-2026-10-25.md) | Asset digests and 63/63 archive entries verified against the PR #114 merge |
| [Level-shift UI](evidence/level-shift-ui-2026-10-25.md) | Gated Creature Tools level-shift section and `api.levelShift`; confirmed policy; open native rows |
| [Hazard generator design](evidence/hazard-generator-2026-10-26.md) | WP5 H3a: AI hazard concept contract, fail-closed validation and experimental gate; no live Foundry run |
| [Required PC identity](evidence/pc-identity-2026-09-15.md) | First completion slice, source evidence, independent review and pending native QA |
| [NPC automatic abilities](evidence/npc-automatic-abilities-2026-09-09.md) | Implemented package boundary, source evidence and bounded .70 native QA |
| [Consumer readiness](evidence/consumer-readiness-2026-09-08.md) | UI/generation changes and version-specific .65–.69 QA |
| [Repository maintenance, September 12](evidence/repository-maintenance-2026-09-12.md) | Cache fixes, organization and release verification |
| [Preserved live QA inventory](evidence/live-qa-inventory.md) | Historical artifact identities and preservation requirements |

## Chunk records (October 17 execution)

| Record | Purpose |
| --- | --- |
| [C01 — Baseline and QA preparation](evidence/chunks-2026-10-17/c01.md) | Published v0.3.5.73 artifact verification, Node 22 baseline, and the native QA ledger source (§8) |
| [C02 — Experimental gate and `/forge` chat command](evidence/chunks-2026-10-17/c02.md) | Gate and chat-command record |
| [C03 — AI reskin backend](evidence/chunks-2026-10-17/c03.md) | Reskin backend chunk evidence |
| [C04 — Creature tools UI and native elite/weak adapter](evidence/chunks-2026-10-17/c04.md) | Creature tools and elite/weak adapter record |
| [C05 — PC editing contract and recomputation](evidence/chunks-2026-10-17/c05.md) | PC editing contract record |
| [C06 — PC editor UI integration](evidence/chunks-2026-10-17/c06.md) | PC editor UI record |
| [C07 — Archetype design research](evidence/chunks-2026-10-17/c07.md) | Free Archetype design research |
| [C08 — Ordinary multiclass, noncaster catalog](evidence/chunks-2026-10-17/c08.md) | Multiclass catalog record |
| [C09 — Free Archetype implementation](evidence/chunks-2026-10-17/c09.md) | Free Archetype implementation record |
| [C10 — Level-shifting design](evidence/chunks-2026-10-17/c10.md) | Level-shifting design evidence |
| [C11 — Level-shifting implementation](evidence/chunks-2026-10-17/c11.md) | Level-shifting implementation (experimental) record |
| [C12 — Acceptance and integration checks](evidence/chunks-2026-10-17/c12.md) | Integration checks and the N-row native checklist (§5) |
| [C13 — Final documentation and release readiness](evidence/chunks-2026-10-17/c13.md) | Public and maintainer support boundaries and release-selection check |

Runtime modules live under `scripts/`. Production templates, styles and translations live under `templates/`, `styles/` and `lang/`. Regression tests live under `tests/`. Published-source test fixtures live under `tests/fixtures/`; maintenance commands live under `tools/`. Tooling, tests and fixtures are excluded from the module archive.

Run `node tools/check.mjs` with Node 22 to execute the same syntax, regression and JSON gates used in CI. Run `git diff --check` for local patch formatting. These checks do not establish live Foundry/PF2e acceptance.

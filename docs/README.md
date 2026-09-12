# Documentation map

Start with the root [README](../README.md) for installation, supported behavior
and user-facing limits. [CLAUDE.md](../CLAUDE.md) owns the current architecture
and invariants, [AGENTS.md](../AGENTS.md) owns agent operating rules, and
[HANDOFF.md](../HANDOFF.md) holds the live session baton. Older session details
and recurring bug patterns live in [HISTORY.md](../HISTORY.md).

| Record | Purpose |
| --- | --- |
| [Repository maintenance, September 12](repository-maintenance-2026-09-12.md) | Cache fixes, organization and release verification |
| [Preserved live QA inventory](live-qa-inventory.md) | Historical artifact identities and preservation requirements |
| [Ship readiness, September 12](ship-readiness-2026-09-12.md) | Assessment of v0.3.5.70 and prioritized acceptance gaps |
| [NPC automatic abilities](npc-automatic-abilities-2026-09-09.md) | Implemented package boundary, source evidence and bounded .70 native QA |
| [Consumer readiness](consumer-readiness-2026-09-08.md) | UI/generation changes and version-specific .65–.69 QA |
| [NPC prerequisite plan](npc-feat-plan-2026-09-09.md) | Historical design and scope for the automatic ability implementation |
| [Forge/generator audit](audit-2026-09-05.md) | Historical defects and the .63 baseline audit; later records supersede pending-release statements |

Runtime modules and their colocated regression tests live under `scripts/`.
Production templates, styles and translations live under `templates/`,
`styles/` and `lang/`. Published-source test fixtures live under
`tests/fixtures/`; maintenance commands live under `tools/`. Tooling and
fixtures are excluded from the module archive.

Run `node tools/check.mjs` with Node 22 to execute the same syntax, regression
and JSON gates used in CI. Run `git diff --check` for local patch formatting.
These checks do not establish live Foundry/PF2e acceptance.

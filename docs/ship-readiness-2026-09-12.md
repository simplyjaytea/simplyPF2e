# Ship readiness — 2026-09-12

Assessment target: public **v0.3.5.70**, commit `d17a2b507070ed5f403a7bb70176b335f139f7fc` (PR #110). Local audit branch: `codex/ship-readiness-2026-09-12`. The initial checkout was 20 commits behind; this review uses current remote main plus the existing documentation-only QA commits ending at `c8e06d3`.

## Recommendation

Suitable for a **GM-reviewed beta on the exercised paths**. Broad production acceptance for dependable one-click generation remains incomplete. The package is already public; this review does not publish another release or change runtime behavior.

## Verified in this session

- All **88 regression files** passed on Node **22.23.2**, matching CI's major version. All **124 `.mjs` syntax checks**, manifest/localization JSON parsing, and whitespace checks passed.
- GitHub reports successful [PR checks](https://github.com/simplyjaytea/simplyPF2e/actions/runs/34257060796) and [Auto Release](https://github.com/simplyjaytea/simplyPF2e/actions/runs/34257313518) for the released source. No open PRs were returned during the review.
- Both [v0.3.5.70 release assets](https://github.com/simplyjaytea/simplyPF2e/releases/tag/v0.3.5.70) match GitHub's SHA-256 digests. All **48 archive files** match the expected release selection; runtime/documentation bytes match the release commit except the intentionally stamped manifest. The archive manifest matches the standalone asset and pins its download to v0.3.5.70.
- Traced generation preflight, exact selection/completion boundaries, NPC/PC/encounter commit and rollback paths, provider endpoint/key binding, and activation charge handling. Existing PC class substitution and non-atomic cross-client activation limits remain documented.
- Independent reviewer `release_mechanics_review` examined the latest NPC package diff and real PF2e master/8.5.0 sources, including DC resolution, RollOption defaults, package ownership/deduplication and rollback. No new actionable P1/P2 finding was reported against the installed-era 8.5.0 target. A suspected Dueling Parry admission issue was checked against native sources and correctly rejected by the existing unsupported-rule gate.

## What prevents a stronger readiness claim

| Priority | Gap and evidence | Acceptance needed |
| --- | --- | --- |
| First | **Requested PC identity is advisory.** Prior live Rogue/Thief generation produced an Investigator, and name/heritage requests also drifted. Current `generator-app.mjs` accepts the offered ABC result into the concept (lines 1083–1096); exact source validation proves membership, not fidelity to the original request. README explicitly documents this behavior. | Make essential requested choices authoritative or require review of substitutions, then verify that a requested Rogue remains a Rogue. This is a product follow-up, not a new source-identity regression. |
| First | **Rogue is offered but lacks successful native acceptance.** The focused retry failed closed; the subsequent early ABC rejection fix prevents wasted downstream work but does not establish a successful Rogue grant chain. | One ordinary successful Rogue/racket run, plus a representative higher-level case covering feats, skills, HP and loadout. Preserve the narrower existing Fighter/Investigator evidence. |
| Next | **New NPC mechanics have partial combat evidence.** The .70 test verifies one Flurry action, the Stunning toggle, native DC34/condition links, and a supporting unarmed damage roll. | Exercise target saves, combat-turn use and condition application. The successful sheet/link inspection is not that test. |
| Next | **Broader native paths remain open.** Recorded encounter success covers one member; nested kits, duplicate-copy activation, damage/self-buff activation and focus-spell behavior are not fully accepted. | A bounded multi-member encounter with cleanup verification, nested inventory check, and new forged-item copy/activation checks on the supported Foundry/PF2e pair. |

These are existing acceptance/product limits, not failed local tests. Out-of-scope classes, level-2+ Free Archetype, Crane Stance, Deflect Projectile and unsupported resource/choice graphs should retain their current gates; completing every roadmap item is not a shipping prerequisite.

## Evidence limits and next step

The [consumer QA record](consumer-readiness-2026-09-08.md) and [NPC ability QA record](npc-automatic-abilities-2026-09-09.md) establish version-specific installed evidence on Foundry **14.365** / PF2e **8.5.0**. This session did not reconnect to Foundry, make provider requests, install updates, or mutate world documents. Its native conclusions come from those preserved records, not a fresh live run. The manifest's PF2e minimum is 8.4.1; the recorded .70 live evidence does not independently establish that older pair.

Prioritize authoritative PC choices and successful Rogue acceptance before widening production claims. Then close the bounded native checks above. Keep Preview Plan and GM review prominent while those limits remain. Review notes stay on the named local branch; merging a documentation-only PR would still trigger an automatic public release.

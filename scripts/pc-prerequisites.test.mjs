// Fail-closed ordinary feat prerequisites against a staged PC plan.
// PF2e 8.4.1 stores `system.prerequisites.value` as `{ value: string }[]`
// display text (feat/data.ts); there is no actor eligibility API.
import assert from "node:assert/strict";
import { featPrerequisitesMet, grantedAbcFeatures, stagedActorContext } from "./pc-prerequisites.mjs";

const feat = (prerequisites) => ({ system: { prerequisites: { value: prerequisites } } });
const rogue = {
  name: "Rogue",
  system: {
    items: {
      sneak: { uuid: "Compendium.pf2e.classfeatures.Item.Sneak Attack", img: "x.webp", name: "Sneak Attack", level: 1 },
      later: { uuid: "Compendium.pf2e.classfeatures.Item.Deny Advantage", img: "x.webp", name: "Deny Advantage", level: 3 }
    },
    trainedSkills: { value: ["stealth"], additional: 7 }
  }
};
const background = {
  name: "Criminal",
  system: { trainedSkills: { value: ["stealth"], lore: ["Underworld Lore"] } }
};
const context = stagedActorContext({
  level: 1,
  ancestry: { name: "Human" },
  background,
  class: rogue,
  skills: { stealth: 1, "underworld-lore": 1 }
});

assert.deepEqual(grantedAbcFeatures(rogue.system, 1), ["Sneak Attack"],
  "only grants at or below the staged level are possessed");
assert.equal(featPrerequisitesMet(feat([]), context), true, "an explicit empty list is eligible");
assert.equal(featPrerequisitesMet(feat([{ value: "sneak attack" }]), context), true,
  "a possessed class feature satisfies its ordinary name");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Stealth" }]), context), true,
  "proven class/background training satisfies a trained-skill clause");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Athletics" }]), context), false,
  "an unmet skill clause is blocked");
assert.equal(featPrerequisitesMet(feat([{ value: "Deny Advantage" }]), context), false,
  "a later class grant is not possessed at level 1");
assert.equal(featPrerequisitesMet(feat([{ value: "sneak attack 2d6" }]), context), false,
  "extra unpublished qualifier text is not treated as the feature name");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Alcohol Lore, Cooking Lore, or Crafting" }]), context), false,
  "an OR skill list is blocked unless one listed skill is proven");
assert.equal(featPrerequisitesMet(
  feat([{ value: "trained in Alcohol Lore, Underworld Lore, or Crafting" }]), context), true,
  "an OR skill list passes when one listed lore is proven");
assert.equal(featPrerequisitesMet(feat([{ value: "expert in Stealth" }]), context), false,
  "a higher rank than the staged snapshot is not inferred");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in at least one skill" }]), context), true,
  "any proven rank satisfies the published Assurance clause");
assert.equal(featPrerequisitesMet(feat([{ value: "Strength 14" }]), context), false,
  "ability-score text without a proven score is not guessed");
assert.equal(featPrerequisitesMet(feat([{ value: "Strength +2" }]), context), false,
  "ability modifiers are not a score and stay ineligible");
assert.equal(featPrerequisitesMet(feat([{ value: "empiricism or interrogation methodology" }]), context), false,
  "unselected class-path names are not assumed");
assert.equal(featPrerequisitesMet(
  feat([{ value: "empiricism or interrogation methodology" }]),
  stagedActorContext({ level: 1, class: rogue, features: ["Empiricism"] })
), true, "a selected methodology satisfies an OR of path names");
assert.equal(featPrerequisitesMet(
  feat([{ value: "Double Shot" }]),
  stagedActorContext({ level: 6, class: { name: "Fighter" }, feats: ["Double Shot"] })
), true, "an already selected feat satisfies a later named prerequisite");
assert.equal(featPrerequisitesMet({ system: {} }, context), false, "missing prerequisite data is blocked");
assert.equal(featPrerequisitesMet(feat(null), context), false, "a null prerequisite list is blocked");
assert.equal(featPrerequisitesMet(feat([{ value: 1 }]), context), false, "a non-string clause is blocked");
assert.equal(featPrerequisitesMet(feat([{ value: "" }]), context), false, "a blank clause is blocked");
assert.equal(featPrerequisitesMet(feat(["sneak attack"]), context), false,
  "a bare string instead of { value } is blocked");
assert.equal(featPrerequisitesMet(
  feat([{ value: "trained in Stealth and Athletics or Acrobatics" }]), context), false,
  "mixed and/or skill text is not guessed");
assert.equal(featPrerequisitesMet(feat([{ value: "follower of a specific religion or philosophy" }]), context), false,
  "ambiguous leftover prose is not treated as proven");
assert.equal(featPrerequisitesMet(feat([]), null), false, "evaluation without a staged context fails closed");

const restricted = stagedActorContext({ level: 3, skills: { society: 1, stealth: 1, "underworld-lore": 1 },
  allowedSkillFeats: ["society", "arcana", "underworld-lore"] });
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Society" }]), restricted), true,
  "a proven mental-skill rank qualifies for a restricted skill feat");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Underworld Lore" }]), restricted), true,
  "a proven named Lore can qualify through Intelligence");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Stealth" }]), restricted), false,
  "ordinary eligibility does not make a physical skill qualify");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Arcana or Stealth" }]), restricted), false,
  "mentioning a mental skill in an unmet OR branch cannot qualify a physical-skill pick");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Society or Stealth" }]), restricted), true,
  "a satisfied mental-skill OR branch proves a qualifying dependency");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in Society and Stealth" }]), restricted), false,
  "mixed mental/physical AND requirements remain conservatively unavailable");
assert.equal(featPrerequisitesMet(feat([{ value: "trained in at least one skill" }]), restricted), false,
  "a generic skill requirement does not prove the skill this feat is for");
assert.equal(featPrerequisitesMet(feat([]), restricted), false,
  "an empty prerequisite list has no qualifying skill dependency");
assert.equal(featPrerequisitesMet(feat([{ value: "expert in Society" }]), restricted), false,
  "a mental-skill label does not bypass the required native rank");

globalThis.game = { settings: { get: () => ({ feats: ["test.feats"] }) }, packs: new Map([
  ["test.feats", { async getIndex() { return [
    { _id: "free", name: "Free Feat", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] }, prerequisites: { value: [] } } },
    { _id: "dependent", name: "Dependent Feat", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] }, prerequisites: { value: [{ value: "Sneak Attack" }] } } },
    { _id: "unmet", name: "Unmet Feat", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] }, prerequisites: { value: [{ value: "trained in Athletics" }] } } },
    { _id: "missing", name: "Unreadable Feat", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] } } }
  ]; } }]
]) };

const { getFeatCandidates } = await import("./compendium.mjs");
const emptyOnly = await getFeatCandidates({ level: 1, category: "class", requireNoPrerequisites: true });
assert.deepEqual(emptyOnly.map((candidate) => candidate.name), ["Free Feat"],
  "without a staged context the complete-only catalog still uses the empty-array gate");
const staged = await getFeatCandidates({ level: 1, category: "class", prerequisiteContext: context });
assert.deepEqual(staged.map((candidate) => candidate.name), ["Dependent Feat", "Free Feat"],
  "the staged evaluator admits proven ordinary prerequisites and still drops unmet or unreadable data");
const legacy = await getFeatCandidates({ level: 1, category: "class" });
assert.deepEqual(legacy.map((candidate) => candidate.name), ["Dependent Feat", "Free Feat", "Unmet Feat", "Unreadable Feat"],
  "NPC and legacy callers retain prerequisite-bearing candidates");

const { resolveFeatPicks } = await import("./pc-builder.mjs");
const { completionManifest } = await import("./completion.mjs");
const unresolved = await resolveFeatPicks([{ type: "class", level: 1, candidates: [] }], [], { exactContent: true });
const manifest = completionManifest({ mode: "character", concept: {}, resolved: {
  ancestryDoc: { name: "Human" }, backgroundDoc: { name: "Scholar" }, classDoc: { name: "Fighter" }, feats: unresolved
} });
assert.equal(manifest.complete, false, "an earned empty feat slot remains a blocking unresolved record");
assert.equal(manifest.unresolved.some((record) => record.category === "feat"), true,
  "the completion manifest identifies the unsupported entitlement");
console.log("pc-prerequisites.test.mjs: staged-actor prerequisite evaluator passed");

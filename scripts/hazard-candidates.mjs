/** Bound large runtime hazard trait catalogs without inventing trait slugs.
 * Small catalogs remain complete. Large catalogs prioritize the GM's words,
 * a matching hazard theme, then common hazard vocabulary. Numbers here bound
 * prompt size only; they never become generated game statistics.
 */
export const HAZARD_TRAIT_LIMIT = 96;
const COMMON = new Set('trap mechanical magical environmental haunt complex simple auditory visual fear mental emotion poison disease curse alchemical consumable inhaled virulent arcane divine occult primal fire cold electricity acid sonic force vitality void spirit bleed bludgeoning piercing slashing air earth water wood metal holy unholy teleportation polymorph steam technological snare'.split(' '));
const THEMES = [
  { words: /\b(trap|mechanical|machine|gear|spike|blade|snare|clockwork)\b/i, traits: 'mechanical trap snare technological metal steam clockwork' },
  { words: /\b(ghost|haunt|spirit|undead|grave|curse|nightmare)\b/i, traits: 'haunt undead spirit incorporeal curse nightmare fear mental emotion death void occult divine' },
  { words: /\b(magic|magical|rune|arcane|spell|portal)\b/i, traits: 'magical arcane divine occult primal teleportation force polymorph illusion evocation abjuration' },
  { words: /\b(nature|forest|plant|storm|weather|environment|environmental|flood|lava|volcano)\b/i, traits: 'environmental plant fungus animal beast water air earth fire wood cold electricity poison disease primal' }
];

export function hazardTraitCandidates(catalog, brief = '') {
  const available = [...new Set((Array.isArray(catalog) ? catalog : [])
    .filter((slug) => typeof slug === 'string' && /^[a-z][a-z0-9-]*$/.test(slug)))].sort();
  if (available.length <= HAZARD_TRAIT_LIMIT) return available;
  const words = new Set(String(brief).toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? []);
  const themed = new Set(THEMES.filter((theme) => theme.words.test(String(brief)))
    .flatMap((theme) => theme.traits.split(' ')));
  const score = (slug) => (words.has(slug) ? 4 : 0) + (themed.has(slug) ? 2 : 0) + (COMMON.has(slug) ? 1 : 0);
  return available.sort((a, b) => score(b) - score(a) || a.localeCompare(b))
    .slice(0, HAZARD_TRAIT_LIMIT).sort();
}

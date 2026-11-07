// Local regression tests: real calculation/editor/validation modules, fixture data only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const fixtureBase = { hp: 0, ac: 0, mr: 0, mana: 0, ad: '4d6+5', ap: '3d8+7', critChance: 0, critDamage: 0, spe: 0, atkSpe: 0, atkSpePct: 0, abSpe: 0, abSpePct: 0, lethality: 0, magicPen: 0 };
const fixtures = {
  [path.join(root, 'src/data/items.ts')]: { findItem: name => name === 'Sword' ? { stats: { AD: '2d6+3', AP: '1d8' } } : undefined },
  [path.join(root, 'src/data/party.ts')]: { PARTY: { level: 1 } },
  [path.join(root, 'src/data/players.ts')]: { PLAYERS: [], findPlayer: () => undefined },
  [path.join(root, 'src/data/roles.ts')]: { findRoleTable: id => id === 'test' ? { levels: [fixtureBase, { ...fixtureBase, ad: '8d6+10', ap: '6d8+14' }] } : undefined },
};
const cache = {};
function load(filename) {
  filename = path.resolve(filename);
  if (fixtures[filename]) return fixtures[filename];
  if (cache[filename]) return cache[filename].exports;
  const module = { exports: {} }; cache[filename] = module;
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: module.exports, module, require: name => {
    if (!name.startsWith('.')) throw new Error(`Unexpected external dependency: ${name}`);
    return load(path.resolve(path.dirname(filename), name + '.ts'));
  } }, { filename });
  return module.exports;
}
const { playerTotalLine, playerBonusLine } = load(path.join(root, 'src/features/calculos/playerTotals.ts'));
const { rollAbilityDamage } = load(path.join(root, 'src/features/players/abilityDamage.ts'));
const { abilityToDraft, draftToAbility } = load(path.join(root, 'src/features/habilidades/abilityDraft.ts'));
const { parseChampionAbilityPatch } = load(path.join(root, '../server/src/validate.ts'));
const sheet = { roleId: 'test', extra: { ad: '1d6+2', ap: 4 } };
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const stats = { ...playerTotalLine(sheet, ['Sword'], 1), bonus: playerBonusLine(sheet, ['Sword']) };
test('bonus excludes role dice and flat base before rolling', () => {
  assert.equal(stats.ad, '7d6+10'); assert.equal(stats.ap, '4d8+11');
  assert.equal(stats.bonus.ad, '3d6+5'); assert.equal(stats.bonus.ap, '1d8+4');
});
test('bonus does not grow with role level; total does', () => {
  assert.equal(playerTotalLine(sheet, ['Sword'], 2).ad, '11d6+15');
  assert.equal(playerBonusLine(sheet, ['Sword']).ad, '3d6+5');
});
test('legacy abilities default to total', () => {
  const result = rollAbilityDamage({ ad: [1], ap: [1] }, stats, 1, () => 0);
  assert.equal(result.total, 32); assert.equal(result.contributions[0].source, 'total');
  const draft = abilityToDraft({ name: 'Legacy', damage: { ad: [1] } });
  assert.equal(draft.adSource, 'total'); assert.equal(draft.apSource, 'total');
});
test('AD bonus and AP total are independent', () => {
  const result = rollAbilityDamage({ ad: [0.5], ap: [1], adSource: 'bonus', apSource: 'total' }, stats, 1, () => 0);
  assert.equal(result.total, 19); assert.equal(result.contributions[0].source, 'bonus');
});
test('AD total and AP bonus are independent', () => {
  assert.equal(rollAbilityDamage({ ad: [1], ap: [0.5], adSource: 'total', apSource: 'bonus' }, stats, 1, () => 0).total, 19.5);
});
test('both bonus do not roll excluded base dice', () => {
  let calls = 0;
  const result = rollAbilityDamage({ ad: [1], ap: [1], adSource: 'bonus', apSource: 'bonus' }, stats, 1, () => { calls++; return 0; });
  assert.equal(result.total, 13); assert.equal(calls, 4);
});
test('no equipment or extras means zero bonus', () => {
  const bonus = playerBonusLine({ roleId: 'test' }, []);
  assert.equal(bonus.ad, 0); assert.equal(bonus.ap, 0);
  assert.equal(rollAbilityDamage({ ad: [1], adSource: 'bonus' }, { ...stats, bonus }, 1).total, 0);
});
test('missing bonus data errors instead of silently using total', () => {
  assert.throws(() => rollAbilityDamage({ ap: [1], apSource: 'bonus' }, { ad: 10, ap: 10 }, 1));
});
test('editor and backend validation preserve both settings through JSON roundtrip', () => {
  const draft = abilityToDraft({ name: 'Test', damage: { ad: [0.5], ap: [0.3], adSource: 'bonus', apSource: 'total' } });
  const patch = JSON.parse(JSON.stringify({ slot: 'Q', ability: draftToAbility(draft) }));
  const saved = parseChampionAbilityPatch(patch).ability;
  assert.equal(saved.damage.adSource, 'bonus'); assert.equal(saved.damage.apSource, 'total');
  assert.equal(abilityToDraft(saved).adSource, 'bonus'); assert.equal(abilityToDraft(saved).apSource, 'total');
});
test('backend accepts legacy omitted modes and rejects invalid modes', () => {
  assert.equal(parseChampionAbilityPatch({ slot: 'Q', ability: { name: 'Legacy', damage: { ad: [1] } } }).ability.damage.adSource, undefined);
  for (const key of ['adSource', 'apSource']) {
    for (const value of ['invalid', null, 42, true]) {
      assert.throws(() => parseChampionAbilityPatch({ slot: 'Q', ability: { name: 'Test', damage: { ad: [1], [key]: value } } }));
    }
  }
});
const { championDamageContext, championAbilityRankCount } = load(path.join(root, 'src/features/calculos/championDamage.ts'));
const champion = { champion: 'Test Champion', roleId: 'test', role: 'Mago', level: 2, equipamiento: ['Sword'], abilities: {} };
test('champion uses own level, role and equipment, not party level', () => {
  const context = championDamageContext(champion);
  assert.equal(context.level, 2); assert.equal(context.tableLevel, 2);
  assert.equal(context.stats.ad, '10d6+13'); assert.equal(context.stats.ap, '7d8+14');
  assert.equal(context.stats.bonus.ad, '2d6+3'); assert.equal(context.stats.bonus.ap, '1d8');
});
test('champion above role table uses last available base row', () => {
  const context = championDamageContext({ ...champion, level: 20 });
  assert.equal(context.level, 20); assert.equal(context.tableLevel, 2); assert.equal(context.stats.ad, '10d6+13');
});
test('champion with missing level defaults to 1 and zero equipment bonus', () => {
  const context = championDamageContext({ ...champion, level: undefined, equipamiento: [] });
  assert.equal(context.level, 1); assert.equal(context.stats.ad, '4d6+5'); assert.equal(context.stats.bonus.ad, 0);
});
test('champion missing role table uses equipment only', () => {
  const context = championDamageContext({ ...champion, roleId: 'missing', role: 'Unknown' });
  assert.equal(context.stats.ad, '2d6+3'); assert.equal(context.stats.bonus.ad, '2d6+3');
});
test('champion hybrid roll respects independent sources at selected ability rank', () => {
  const context = championDamageContext(champion);
  const result = rollAbilityDamage({ ad: [0.5, 1], ap: [1, 0.5], adSource: 'bonus', apSource: 'total' }, context.stats, 2, () => 0);
  assert.equal(result.total, 15.5);
});
test('champion rank options cover AD and AP lists, minimum rank 1', () => {
  assert.equal(championAbilityRankCount({ name: 'No scaling' }), 1);
  assert.equal(championAbilityRankCount({ name: 'AD only', damage: { ad: [1, 2, 3] } }), 3);
  assert.equal(championAbilityRankCount({ name: 'Hybrid', damage: { ad: [1], ap: [1, 2, 3, 4] } }), 4);
});
test('player PATCH validation preserves item order and duplicate positions', () => {
  const { parsePlayerPatch } = load(path.join(root, '../server/src/validate.ts'));
  const patch = parsePlayerPatch({ equipamiento: ['Sword', 'Boots', 'Sword'], build: ['Z', 'A', 'B'] });
  assert.equal(JSON.stringify(patch.equipamiento), JSON.stringify(['Sword', 'Boots', 'Sword']));
  assert.equal(JSON.stringify(patch.build), JSON.stringify(['Z', 'A', 'B']));
});
console.log(`${passed} scaling source/champion tests passed`);
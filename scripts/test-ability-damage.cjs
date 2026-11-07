const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/features/players/abilityDamage.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const { rollDamageStat, rollAbilityDamage, hasDamageScaling, scalingAtRank } = context.exports;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('mixed stat dice and modifier: lowest rolls', () => assert.equal(rollDamageStat('2d4+2d2+3', () => 0).total, 7));
test('mixed stat dice and modifier: highest rolls', () => assert.equal(rollDamageStat('2d4+2d2+3', () => 0.99999).total, 15));
test('flat stats, decimals and signed terms', () => { assert.equal(rollDamageStat(12).total, 12); assert.equal(rollDamageStat('1d6-2+0,5', () => 0).total, -0.5); });
test('AP only at saved rank, unused AD not rolled', () => {
  let calls = 0;
  const result = rollAbilityDamage({ ap: [0.3, 0.5] }, { ad: 'invalid', ap: '2d6+4' }, 2, () => { calls++; return 0; });
  assert.equal(result.total, 3); assert.equal(calls, 2); assert.equal(result.contributions.length, 1);
});
test('AD only scaling', () => assert.equal(rollAbilityDamage({ ad: [1.5] }, { ad: '2d4+2', ap: 0 }, 1, () => 0.99999).total, 15));
test('hybrid AD + AP', () => assert.equal(rollAbilityDamage({ ad: [0.5], ap: [0.3] }, { ad: 20, ap: 10 }, 1).total, 13));
test('short arrays clamp per stat', () => { assert.equal(scalingAtRank([0.3], 5), 0.3); assert.equal(scalingAtRank([0.1, 0.2], 5), 0.2); });
test('rank zero cannot roll', () => assert.throws(() => rollAbilityDamage({ ap: [1] }, { ad: 0, ap: '1d6' }, 0)));
test('non-damage abilities do not opt into rolling', () => { assert.equal(hasDamageScaling(undefined), false); assert.equal(hasDamageScaling({ type: 'magic' }), false); assert.equal(hasDamageScaling({ ad: [1] }), true); });
test('malformed stats and excessive dice produce errors', () => { for (const stat of ['2d6d4', '2d6++3', 'oops', '1d1', '1001d6', '0d6']) assert.throws(() => rollDamageStat(stat)); });
test('zero scaling does not consume dice', () => { let calls = 0; rollAbilityDamage({ ad: [0, 1], ap: [0] }, { ad: '1d6', ap: '1d6' }, 1, () => { calls++; return 0; }); assert.equal(calls, 0); });
console.log(`${passed} damage tests passed`);
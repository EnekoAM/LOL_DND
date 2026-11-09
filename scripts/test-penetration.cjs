// Local regression: % armor/magic pen (non-stacking, max) and effectiveDefense formula.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

const fixtureBase = {
  hp: 10, ac: 1, mr: 0, mana: 0, ad: 0, ap: 0, critChance: 0, critDamage: 0,
  spe: 0, atkSpe: 0, atkSpePct: 0, abSpe: 0, abSpePct: 0, lethality: 0, magicPen: 0,
};

const items = {
  Dominik: { stats: { AD: 35, LETHALITY: 0, 'Armor pen %': 35 } },
  Reminder: { stats: { AD: 35, 'Armor pen %': 30 } },
  Youmuu: { stats: { AD: 55, LETHALITY: 0.36 } },
  VoidStaff: { stats: { AP: 95, 'Magic pen %': 40 } },
  Cryptbloom: { stats: { AP: 60, 'Magic pen %': 30 } },
};

const fixtures = {
  [path.join(root, 'src/data/items.ts')]: {
    findItem: name => items[name],
  },
  [path.join(root, 'src/data/party.ts')]: { PARTY: { level: 1 } },
  [path.join(root, 'src/data/players.ts')]: {
    PLAYERS: [],
    savePlayerPatch: async () => undefined,
  },
  [path.join(root, 'src/data/roles.ts')]: {
    findRoleTable: id => id === 'tank'
      ? { levels: [fixtureBase] }
      : undefined,
  },
};

const cache = {};
function load(filename) {
  filename = path.resolve(filename);
  if (fixtures[filename]) return fixtures[filename];
  if (cache[filename]) return cache[filename].exports;
  const module = { exports: {} };
  cache[filename] = module;
  let sourcePath = filename;
  if (!fs.existsSync(sourcePath) && fs.existsSync(sourcePath + '.ts')) sourcePath += '.ts';
  const code = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: module.exports,
    module,
    require: name => {
      if (!name.startsWith('.')) throw new Error('Unexpected external dependency: ' + name);
      return load(path.resolve(path.dirname(sourcePath), name.endsWith('.ts') ? name : name + '.ts'));
    },
  }, { filename: sourcePath });
  return module.exports;
}


const {
  effectiveDefense,
  itemStatLine,
  sumStatLines,
  emptyStatLine,
  STAT_COLUMNS,
  isNonStackingKey,
} = load(path.join(root, 'src/features/calculos/statLine.ts'));
const { playerTotalLine, playerStatsDocument } = load(path.join(root, 'src/features/calculos/playerTotals.ts'));

// Formula: 4.5 AC, 35% + 0.36 flat -> 4.5*0.65 = 2.925 - 0.36 = 2.565 -> 3
assert.equal(effectiveDefense(4.5, 35, 0.36), 3);
assert.equal(effectiveDefense(4.5, 0, 0), 5);           // .5 up
assert.equal(effectiveDefense(1.4, 0, 0), 1);
assert.equal(effectiveDefense(2, 0, 5), 0);              // never below 0
assert.equal(effectiveDefense(10, 100, 0), 0);
assert.equal(effectiveDefense('3,5', '40', '0'), 2);     // 3.5*0.6=2.1 -> 2
assert.equal(effectiveDefense(4.5, 150, 0), 0);          // pct clamped to 100
assert.equal(effectiveDefense(4.5, -10, -1), 5);         // negatives ignored

// Item keys map to the new columns
const dom = itemStatLine(items.Dominik.stats);
assert.equal(dom.armorPenPct, 35);
assert.equal(itemStatLine(items.VoidStaff.stats).magicPenPct, 40);
assert.ok(STAT_COLUMNS.some(c => c.key === 'armorPenPct'));
assert.ok(STAT_COLUMNS.some(c => c.key === 'magicPenPct'));
assert.ok(isNonStackingKey('armorPenPct') && isNonStackingKey('magicPenPct') && !isNonStackingKey('lethality'));

// Non-stacking: max, not sum
const both = sumStatLines([dom, itemStatLine(items.Reminder.stats), itemStatLine(items.Youmuu.stats)]);
assert.equal(both.armorPenPct, 35);
assert.equal(both.ad, 125);
assert.equal(both.lethality, 0.36);
const mages = sumStatLines([itemStatLine(items.Cryptbloom.stats), itemStatLine(items.VoidStaff.stats)]);
assert.equal(mages.magicPenPct, 40);

// Old role rows without the new keys still sum (missing = 0)
const legacy = { ...emptyStatLine() };
delete legacy.armorPenPct; delete legacy.magicPenPct;
const withLegacy = sumStatLines([legacy, dom]);
assert.equal(withLegacy.armorPenPct, 35);
assert.equal(sumStatLines([legacy]).magicPenPct, 0);

// Player totals and stored stats
const sheet = { roleId: 'tank' };
const total = playerTotalLine(sheet, ['Dominik', 'Reminder', 'VoidStaff', 'Cryptbloom']);
assert.equal(total.armorPenPct, 35);
assert.equal(total.magicPenPct, 40);
const doc = playerStatsDocument(sheet, ['Dominik', 'Reminder']);
assert.equal(doc['PEN. ARM. %'], 35);
assert.equal(doc['PEN. MÁG. %'], 0);

// Roles hydrate fills missing keys
delete fixtures[path.join(root, 'src/data/roles.ts')];
const roles = load(path.join(root, 'src/data/roles.ts'));
roles.hydrateRoles([{ id: 'x', name: 'X', levels: [legacy] }]);
assert.equal(roles.findRoleTable('x').levels[0].armorPenPct, 0);
assert.equal(roles.findRoleTable('x').levels[0].magicPenPct, 0);

console.log('test-penetration: ok');

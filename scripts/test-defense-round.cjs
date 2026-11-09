// Local regression: AC/MR totals round to nearest int after exact sum (no per-item rounding).
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
  Thornmail: { stats: { AC: 1.5, MR: 0 } },
  Bramble: { stats: { AC: 0.6, MR: 0 } },
  NullMagic: { stats: { AC: 0, MR: 0.5 } },
  FloatNoise: { stats: { AC: 0.1, MR: 0.2 } },
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
  roundDefense,
  formatDefenseStat,
  defenseExact,
  itemStatLine,
  sumStatLines,
  isDefenseKey,
} = load(path.join(root, 'src/features/calculos/statLine.ts'));
const { playerTotalLine, playerStatsDocument } = load(path.join(root, 'src/features/calculos/playerTotals.ts'));
const { draftToItemUpdate } = load(path.join(root, 'src/features/items/itemDraft.ts'));

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS ' + name);
}

test('roundDefense rounds to nearest int after cleaning float noise', () => {
  assert.equal(roundDefense(0.5), 1);
  assert.equal(roundDefense(1.4), 1);
  assert.equal(roundDefense(1.5), 2);
  assert.equal(roundDefense(0.16), 0);
  assert.equal(roundDefense(2.1), 2);
  assert.equal(roundDefense(0.6), 1);
  assert.equal(roundDefense(0.1 + 0.2), 0); // 0.3000... -> 0.3 -> 0
  assert.equal(roundDefense(2.999999999), 3);
  assert.equal(roundDefense('1,75'), 2);
  // Negatives: .5 away from zero
  assert.equal(roundDefense(-1.5), -2);
  assert.equal(roundDefense(-1.4), -1);
});

test('formatDefenseStat shows integer and Exacto tooltip when decimals remain', () => {
  const a = formatDefenseStat(2.1);
  assert.equal(a.text, '2');
  assert.equal(a.exactTitle, 'Exacto: 2,1');
  const b = formatDefenseStat(3);
  assert.equal(b.text, '3');
  assert.equal(b.exactTitle, undefined);
  const c = formatDefenseStat(0.6);
  assert.equal(c.text, '1');
  assert.equal(c.exactTitle, 'Exacto: 0,6');
  const d = formatDefenseStat(1.5);
  assert.equal(d.text, '2');
  assert.equal(d.exactTitle, 'Exacto: 1,5');
});

test('item rows keep exact decimals; only the summed total is rounded', () => {
  const thorn = itemStatLine(items.Thornmail.stats);
  const bramble = itemStatLine(items.Bramble.stats);
  assert.equal(thorn.ac, 1.5);
  assert.equal(bramble.ac, 0.6);
  const sum = sumStatLines([thorn, bramble]);
  assert.equal(sum.ac, 2.1);
  assert.equal(roundDefense(sum.ac), 2);
});

test('player total with role base keeps base exact and rounds stored AC/MR', () => {
  const sheet = { roleId: 'tank' };
  const total = playerTotalLine(sheet, ['Thornmail', 'Bramble'], 1);
  // base ac 1 + 1.5 + 0.6 = 3.1 -> rounds to 3
  assert.equal(total.ac, 3.1);
  const doc = playerStatsDocument(sheet, ['Thornmail', 'Bramble']);
  assert.equal(doc.AC, 3);
  assert.equal(doc.MR, 0);
  assert.equal(isDefenseKey('ac'), true);
  assert.equal(isDefenseKey('spe'), false);
});

test('MR rounds the same way (.5 up)', () => {
  const half = sumStatLines([itemStatLine(items.NullMagic.stats)]);
  assert.equal(half.mr, 0.5);
  assert.equal(roundDefense(half.mr), 1);
  const total = sumStatLines([
    itemStatLine(items.NullMagic.stats),
    itemStatLine({ MR: 0.7 }),
  ]);
  assert.equal(total.mr, 1.2);
  assert.equal(roundDefense(total.mr), 1);
  assert.equal(formatDefenseStat(total.mr).exactTitle, 'Exacto: 1,2');
});

test('item editor accepts decimal AC/MR (text input + Number parse)', () => {
  const item = {
    nombre: 'Test',
    rareza: 'Común',
    imagen: '',
    efecto: { pasiva: '-', activa: '-' },
    stats: { AC: 0, MR: 0, HP: 0, AD: 0, AP: 0 },
    coste: 100,
    cantidad: 1,
  };
  const draft = {
    rareza: 'Común',
    pasiva: '',
    activa: '',
    coste: '100',
    stats: { AC: '1,5', MR: '0.6', HP: '', AD: '', AP: '' },
  };
  const update = draftToItemUpdate(draft, item);
  assert.equal(update.stats.AC, 1.5);
  assert.equal(update.stats.MR, 0.6);
  assert.equal(defenseExact(update.stats.AC), 1.5);
});

console.log(passed + ' defense round tests passed');

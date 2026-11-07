const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/features/calculos/AbilityCard.tsx');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX
} }).outputText;
const context = { exports: {}, require: name => {
  if (name === '../../lib/cx') return { cx: (...args) => args.filter(Boolean).join(' ') };
  if (name === '../../lib/format') return { formatPercentList: values => values.join(',') };
  if (name === 'react/jsx-runtime') return require(name);
  throw new Error('Unexpected dependency: ' + name);
} };
vm.runInNewContext(code, context, { filename });
const Card = context.exports.default;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('damage card supports click, Enter and Space', () => {
  let selected = 0;
  const card = Card({ label: 'Q', name: 'Test', ability: { name: 'Test', damage: { ad: [1] } }, onSelect: () => selected++ });
  assert.equal(card.props.role, 'button'); assert.equal(card.props.tabIndex, 0);
  card.props.onClick();
  const target = {};
  for (const key of ['Enter', ' ']) {
    let prevented = false;
    card.props.onKeyDown({ key, target, currentTarget: target, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
  }
  assert.equal(selected, 3);
});
test('detail/edit child interaction does not select or roll ability', () => {
  let selected = 0;
  const card = Card({ label: 'Q', name: 'Test', ability: { name: 'Test', damage: { ap: [1] } }, onSelect: () => selected++, children: 'Details button' });
  const extra = card.props.children.find(child => child?.props?.className === 'calc-card__extra');
  let stopped = false;
  extra.props.onClick({ stopPropagation: () => { stopped = true; } });
  card.props.onKeyDown({ key: 'Enter', target: {}, currentTarget: {}, preventDefault: () => {} });
  assert.equal(stopped, true); assert.equal(selected, 0);
});
test('ability without damage retains inactive behavior', () => {
  let selected = 0;
  const card = Card({ label: 'P', name: 'Passive', ability: { name: 'Passive' }, onSelect: () => selected++ });
  card.props.onClick(); assert.equal(selected, 0); assert.equal(card.props.tabIndex, undefined);
});
console.log(`${passed} ability card tests passed`);
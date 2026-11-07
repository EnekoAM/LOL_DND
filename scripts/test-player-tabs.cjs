// Evaluate the real tab declarations without mounting the full data-connected sheet.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/features/players/PlayerSheet.tsx'), 'utf8');
const ast = ts.createSourceFile('PlayerSheet.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['SHEET_TABS', 'readTab', 'TABS']);
const declarations = ast.statements.filter(node =>
  (ts.isTypeAliasDeclaration(node) && node.name.text === 'SheetTab') ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.has(d.name.text)))
).map(node => node.getText(ast)).join('\n');
const code = ts.transpileModule(declarations + '\nglobalThis.api = { SHEET_TABS, readTab, TABS };', {
  compilerOptions: { target: ts.ScriptTarget.ES2020 }
}).outputText;
let saved = null;
let blocked = false;
const context = { localStorage: { getItem: () => { if (blocked) throw new Error('Storage blocked'); return saved; } } };
vm.runInNewContext(code, context);
const { SHEET_TABS, TABS, readTab } = context.api;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('legacy saved Build selection opens merged Equipo tab', () => {
  saved = 'build'; assert.equal(readTab('playerSheetTab:Test'), 'equipo');
});
test('all existing current tabs retain their saved selection', () => {
  for (const tab of SHEET_TABS) { saved = tab; assert.equal(readTab('playerSheetTab:Test'), tab); }
});
test('missing or invalid saved selection defaults to General', () => {
  for (const value of [null, '', 'unknown']) { saved = value; assert.equal(readTab('playerSheetTab:Test'), 'general'); }
});
test('blocked browser storage still defaults safely', () => {
  blocked = true; assert.equal(readTab('playerSheetTab:Test'), 'general'); blocked = false;
});
test('one visible Equipment and Build tab replaces separate Build tab', () => {
  assert.equal(TABS.filter(tab => tab.id === 'equipo').length, 1);
  assert.equal(TABS.find(tab => tab.id === 'equipo').label, 'Equipo y build');
  assert.equal(TABS.some(tab => tab.id === 'build'), false);
  assert.equal(SHEET_TABS.includes('build'), false);
  assert.ok(TABS.some(tab => tab.id === 'quest')); assert.ok(TABS.some(tab => tab.id === 'aumentos'));
});
const equipmentPanels = [];
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression)) {
    const expr = node.expression;
    if (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && expr.left.getText(ast) === "tab === 'equipo'") {
      equipmentPanels.push(expr.right.getText(ast));
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
test('merged tab renders equipped section first and desired build below', () => {
  assert.equal(equipmentPanels.length, 2);
  assert.ok(equipmentPanels[0].includes('Equipamiento'));
  assert.ok(equipmentPanels[0].includes('player.equipamiento.length}/{equipmentLimit}'));
  assert.ok(equipmentPanels[1].includes('Build deseada'));
});
test('both sections retain independent add, remove and item-info handlers', () => {
  assert.ok(equipmentPanels[0].includes('onChange={() => openEquipmentSwap(index)}'));
  assert.ok(source.includes('onEquipamientoChange(removeAt(player.equipamiento, swapTarget.index))'));
  assert.ok(equipmentPanels[1].includes('onBuildChange(removeAt(player.build, index))'));
  assert.ok(equipmentPanels[0].includes("setPicker('equipamiento')"));
  assert.ok(equipmentPanels[1].includes("setPicker('build')"));
  for (const panel of equipmentPanels) {
    assert.ok(panel.includes('onInspect={() => inspectItem(itemName)}'));
    assert.ok(panel.includes('removeDisabled={saving}'));
  }
});
console.log(`${passed} player tab tests passed`);
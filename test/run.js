'use strict';

const assert = require('node:assert/strict');
const data = require('../src/data.json');
const { fuzzyFilter } = require('../src/fuzzy');
const { provideEffectCompletions, provideInfoCompletions } = require('../src/completion');
const { validateEffectDocument } = require('../src/diagnostics-effect');
const { findInvalidDynamicEffectRanges } = require('../src/decorations');
const { validateInfoDocument } = require('../src/diagnostics-info');
const { parseRgbaArguments, toHexByte, findRgbaOnLine } = require('../src/colors');

class Position {
    constructor(line, character) { this.line = line; this.character = character; }
    translate(lineDelta = 0, characterDelta = 0) { return new Position(this.line + lineDelta, this.character + characterDelta); }
}
class Range {
    constructor(a, b, c, d) {
        if (a instanceof Position) { this.start = a; this.end = b; }
        else { this.start = new Position(a, b); this.end = new Position(c, d); }
    }
}
class Diagnostic {
    constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; }
}
class CompletionItem {
    constructor(label, kind) { this.label = label; this.kind = kind; }
}
class Color {
    constructor(red, green, blue, alpha) { Object.assign(this, { red, green, blue, alpha }); }
}
const vscode = {
    Position, Range, Diagnostic, CompletionItem, Color,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItemKind: { Property: 9, Value: 11, Module: 8 }
};
class Document {
    constructor(text, languageId) { this.lines = text.split(/\r?\n/); this.lineCount = this.lines.length; this.languageId = languageId; }
    lineAt(line) { return { text: this.lines[line] }; }
}

function labels(items) { return items.map(item => item.label); }
function codes(items) { return items.map(item => item.code); }

assert.equal(data.effect.allKeywords.length, 138);
assert.equal(data.info.allHeaders.length, 67);
assert.equal(data.info.multiStringLengthRules.length, 42);
assert.equal(data.info.maxArgumentCountRules.length, 30);

assert.deepEqual(fuzzyFilter('db', ['.dotBleed', '.dotPoison', '.damage_low_add']), ['.dotBleed']);
assert.equal(fuzzyFilter('dpi', ['.dotPoison', '.damage_low_add'])[0], '.dotPoison');

const effectCompletionDocument = new Document('effect: .name "demo"\n  .do', 'darkest-effect');
const effectItems = provideEffectCompletions(vscode, effectCompletionDocument, new Position(1, 5));
assert(labels(effectItems).includes('.dotBleed'));
assert(!labels(effectItems).includes('.name'));

const effectValueDocument = new Document('effect: .target ta', 'darkest-effect');
const effectValueItems = provideEffectCompletions(vscode, effectValueDocument, new Position(0, 18));
assert(labels(effectValueItems).includes('target'));
assert(labels(effectValueItems).includes('target_group'));

const headerDocument = new Document('ski', 'darkest-info');
assert(labels(provideInfoCompletions(vscode, headerDocument, new Position(0, 3))).includes('skill:'));
const infoKeywordDocument = new Document('skill:\n  .ta', 'darkest-info');
assert(labels(provideInfoCompletions(vscode, infoKeywordDocument, new Position(1, 5))).includes('.target'));

const validEffect = validateEffectDocument(vscode, new Document('effect: .name "demo" .target target .on_hit true', 'darkest-effect'));
assert(!codes(validEffect).includes('effect-keyword'));
const invalidEffect = validateEffectDocument(vscode, new Document('effect: .unknown x .dotBleed 1 .dotPoison 1', 'darkest-effect'));
assert(codes(invalidEffect).includes('effect-keyword'));
assert(codes(invalidEffect).includes('effect-dot-conflict'));
const buffEffect = validateEffectDocument(vscode, new Document('effect: .buff_type combat_stat_add .buff_sub_type damage_low', 'darkest-effect'));
assert(codes(buffEffect).includes('effect-buff-amount'));

const multiTargetInstant = validateEffectDocument(vscode, new Document('effect: .target target .target performer .skill_instant true', 'darkest-effect'));
assert(!codes(multiTargetInstant).includes('effect-skill-instant'));
const unsafeInstant = validateEffectDocument(vscode, new Document('effect: .target target .target target_enemy_group .skill_instant true', 'darkest-effect'));
assert(codes(unsafeInstant).includes('effect-skill-instant'));

const invalidInfo = validateInfoDocument(vscode, new Document('skill: .background_name foo', 'darkest-info'));
assert(codes(invalidInfo).includes('info-keyword-context'));
const unknownHeader = validateInfoDocument(vscode, new Document('mystery: .id foo', 'darkest-info'));
assert(codes(unknownHeader).includes('info-header'));
const deathConflict = validateInfoDocument(vscode, new Document('death_class: .monster_class_id a\ndeath_class: .random_monster_class_ids b', 'darkest-info'));
assert.equal(codes(deathConflict).filter(code => code === 'info-death-class-conflict').length, 2);
const badBoolean = validateInfoDocument(vscode, new Document('skill: .can_miss maybe', 'darkest-info'));
assert(codes(badBoolean).includes('info-value'));

const spawnText = 'spawn: .effects first second third';
const spawnDiagnostics = validateInfoDocument(vscode, new Document(spawnText, 'darkest-info'));
const spawnWarning = spawnDiagnostics.find(item => item.code === 'info-spawn-effects-count');
assert(spawnWarning);
assert.equal(spawnWarning.range.start.character, spawnText.indexOf('third'));

const modeWarning = validateInfoDocument(vscode, new Document('mode: .id "' + 'a'.repeat(33) + '"', 'darkest-info'));
assert(modeWarning.some(item => item.code === 'info-mode-length' && item.severity === vscode.DiagnosticSeverity.Warning));
const modeError = validateInfoDocument(vscode, new Document('mode: .id "' + 'a'.repeat(65) + '"', 'darkest-info'));
assert(modeError.some(item => item.code === 'info-mode-length' && item.severity === vscode.DiagnosticSeverity.Error));

assert.equal(findInvalidDynamicEffectRanges(new Document('skill: .crit_variant_effects foo', 'darkest-info')).length, 1);
assert.equal(findInvalidDynamicEffectRanges(new Document('skill: .target target .mode2_effects foo', 'darkest-info')).length, 1);
assert.equal(findInvalidDynamicEffectRanges(new Document('skill: .custom_variant_effects foo', 'darkest-info')).length, 0);

const hex = parseRgbaArguments(vscode, '#0F8');
assert.equal(Math.round(hex.green * 255), 255);
assert.equal(toHexByte(0.5), '80');
const rgba = parseRgbaArguments(vscode, '10 20 30 128');
assert.equal(Math.round(rgba.alpha * 255), 128);
assert.equal(parseRgbaArguments(vscode, '300 0 0 255'), null);
assert.equal(parseRgbaArguments(vscode, '0000 0 0 0'), null);
const foundRgba = findRgbaOnLine(vscode, 'colour: .id demo .rgba 10 20 30 128 // ignored', 0);
assert(foundRgba);
assert.equal(foundRgba.value, '10 20 30 128');
assert.equal(foundRgba.range.start.character, 23);
assert.equal(findRgbaOnLine(vscode, 'colour: .rgba 10 20 30 128 .rgba #FFF', 0), null);


const manifest = require('../package.json');
const tokenCustomizations = manifest.contributes.configurationDefaults['editor.tokenColorCustomizations'];
const darkThemeKey = '[Default Dark Modern][Dark Modern][Dark+ (default dark)][Visual Studio Dark]';
const lightThemeKey = '[Default Light Modern][Light Modern][Light+ (default light)][Visual Studio Light][Quiet Light]';
const darkRules = tokenCustomizations[darkThemeKey].textMateRules;
const lightRules = tokenCustomizations[lightThemeKey].textMateRules;

function relativeLuminance(hex) {
    const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
    const first = relativeLuminance(foreground);
    const second = relativeLuminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const rule of darkRules) {
    assert(contrastRatio(rule.settings.foreground, '#1E1E1E') >= 4.5, `Dark palette contrast is too low for ${rule.scope}`);
}
for (const rule of lightRules) {
    assert(contrastRatio(rule.settings.foreground, '#FFFFFF') >= 4.5, `Light palette contrast is too low for ${rule.scope}`);
}

const globalRules = tokenCustomizations.textMateRules;
const globalInfoRule = globalRules.find(rule => rule.scope === 'keyword.other.info.darkest');
assert.equal(globalInfoRule.settings.foreground, '#86A8C6');
assert.notEqual(globalInfoRule.settings.foreground, '#244BA5');

const gameEffectColors = {
    'keyword.other.bleed.darkest': '#B10000',
    'keyword.other.poison.darkest': '#BDC241',
    'keyword.other.heal.darkest': '#87C241',
    'keyword.other.stun.darkest': '#C99C45',
    'keyword.other.kill.darkest': '#FF0000',
    'keyword.other.riposte.darkest': '#C3630F',
    'keyword.other.buff.darkest': '#5EC9D6',
    'keyword.other.summon.darkest': '#7FFFD4'
};
for (const [scope, color] of Object.entries(gameEffectColors)) {
    const rule = globalRules.find(candidate => candidate.scope === scope);
    assert(rule, `Missing global Effect color rule for ${scope}`);
    assert.equal(rule.settings.foreground, color);
    assert(!darkRules.some(candidate => candidate.scope === scope), `Dark theme overrides game color for ${scope}`);
    assert(!lightRules.some(candidate => candidate.scope === scope), `Light theme overrides game color for ${scope}`);
}
assert.equal(globalRules[0].settings.foreground, undefined);

console.log('All tests passed.');

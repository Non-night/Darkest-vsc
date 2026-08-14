'use strict';

const {
    data,
    DOT_KEYWORDS,
    effectKeywordSet,
    effectValueMap,
    codeBeforeComment,
    extractKeywords,
    getLogicalColon,
    findEffectBlock,
    collectBlockKeywords,
    parseArgumentsFromText
} = require('./language');
const { addDiagnostic, addWholeLine, validateCommonLine, countWithoutWhitespace } = require('./diagnostics-common');

const CUSTOM_SOURCE_KEYWORDS = new Set(['.dotSource', '.buff_source_type']);
const SAFE_STEAL_STATS = new Set(['hp_dot_bleed', 'hp_dot_poison', 'hp_dot_heal', 'stress_dot', 'shuffle_dot']);
const GUARD_KEYWORDS = new Set(['.guard', '.clearguarded', '.clearguarding']);

function keywordArguments(codeText, keyword, allKeywords) {
    const next = allKeywords.find(item => item.index > keyword.index);
    const end = next ? next.index : codeText.length;
    return parseArgumentsFromText(codeText.slice(0, end), keyword.end);
}

function firstBlockValue(document, block, keywordName) {
    for (let line = block.startLine; line <= block.endLine; line += 1) {
        const codeText = codeBeforeComment(document.lineAt(line).text);
        const keywords = extractKeywords(codeText, false);
        const keyword = keywords.find(item => item.value === keywordName);
        if (!keyword) {
            continue;
        }
        const args = keywordArguments(codeText, keyword, keywords);
        return args.length ? { ...args[0], line, keyword } : { value: null, line, keyword };
    }
    return null;
}

function blockValues(document, block, keywordName) {
    const result = [];
    for (let line = block.startLine; line <= block.endLine; line += 1) {
        const codeText = codeBeforeComment(document.lineAt(line).text);
        const keywords = extractKeywords(codeText, false);
        for (const keyword of keywords.filter(item => item.value === keywordName)) {
            const args = keywordArguments(codeText, keyword, keywords);
            result.push(args.length ? { ...args[0], line, keyword } : { value: null, line, keyword });
        }
    }
    return result;
}

function blockHasKeyword(document, block, keywordName) {
    return collectBlockKeywords(document, block, false).some(item => item.value === keywordName);
}

function validateName(vscode, diagnostics, line, codeText, keyword, keywords) {
    const args = keywordArguments(codeText, keyword, keywords);
    if (!args.length) {
        return;
    }
    const arg = args[0];
    if (!arg.quoted && /\s/.test(codeText.slice(keyword.end).trim())) {
        addDiagnostic(vscode, diagnostics, line, arg.rawIndex, Math.max(1, codeText.length - arg.rawIndex), '.name 的无引号值不能包含空白；请使用双引号包住完整参数', vscode.DiagnosticSeverity.Error, 'effect-name-whitespace');
    }
    const length = countWithoutWhitespace(arg.value);
    if (length === 64) {
        addDiagnostic(vscode, diagnostics, line, arg.index, Math.max(1, arg.length), '.name 长度已达到 64 字符上限', vscode.DiagnosticSeverity.Warning, 'effect-name-length');
    } else if (length > 64) {
        addDiagnostic(vscode, diagnostics, line, arg.index, Math.max(1, arg.length), '.name 长度不能超过 64 字符', vscode.DiagnosticSeverity.Error, 'effect-name-length');
    }
}

function validateIdList(vscode, diagnostics, line, codeText, keyword, keywords) {
    const args = keywordArguments(codeText, keyword, keywords).slice(0, 9);
    for (const arg of args) {
        if (/\s/.test(arg.value)) {
            addDiagnostic(vscode, diagnostics, line, arg.index, Math.max(1, arg.length), keyword.value + ' 的单个参数不应包含空白', keyword.value === '.buff_ids' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error, 'effect-id-whitespace');
        }
        const length = countWithoutWhitespace(arg.value);
        if (length === 64) {
            addDiagnostic(vscode, diagnostics, line, arg.index, Math.max(1, arg.length), '参数长度已达到 64 字符上限', vscode.DiagnosticSeverity.Warning, 'effect-id-length');
        } else if (length > 64) {
            addDiagnostic(vscode, diagnostics, line, arg.index, Math.max(1, arg.length), '参数长度不能超过 64 字符', vscode.DiagnosticSeverity.Error, 'effect-id-length');
        }
    }
    if (args.length === 8) {
        addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '参数数量已达到 8 个，建议检查是否需要拆分', vscode.DiagnosticSeverity.Information, 'effect-id-count');
    } else if (args.length > 8) {
        const extra = args[8];
        addDiagnostic(vscode, diagnostics, line, extra.rawIndex, Math.max(1, extra.raw.length), keyword.value === '.buff_ids' ? '.buff_ids 最多支持 8 个参数，建议拆分为多行' : keyword.value + ' 最多支持 8 个参数', vscode.DiagnosticSeverity.Error, 'effect-id-count');
    }
}

function validateFixedValue(vscode, diagnostics, line, keyword, arg) {
    const validValues = effectValueMap.get(keyword.value);
    if (!validValues || !arg) {
        return;
    }
    const value = arg.value;
    if (data.effect.doubleBoolKeywords.includes(keyword.value)) {
        if (!data.effect.doubleBoolValuesForError.includes(value)) {
            addDiagnostic(vscode, diagnostics, line, arg.index, Math.max(1, arg.length), keyword.value + ' 的参数无效: ' + value, vscode.DiagnosticSeverity.Error, 'effect-value');
        } else if (arg.quoted && data.effect.numBoolValues.includes(value)) {
            addDiagnostic(vscode, diagnostics, line, arg.rawIndex, arg.raw.length, '数字布尔值不能放在引号中', vscode.DiagnosticSeverity.Error, 'effect-quoted-number-bool');
        }
        return;
    }

    if (keyword.value === '.steal_buff_source_type') {
        if (value === 'bsrc_district' || value === 'bsrc_skill') {
            addDiagnostic(vscode, diagnostics, line, arg.index, arg.length, value + ' 在此处存在特殊兼容性行为', vscode.DiagnosticSeverity.Warning, 'effect-source-warning');
        } else if (!validValues.includes(value)) {
            addDiagnostic(vscode, diagnostics, line, arg.index, arg.length, '自定义来源会被游戏视为 combat_end', vscode.DiagnosticSeverity.Warning, 'effect-source-warning');
        }
        return;
    }
    if (keyword.value === '.steal_buff_stat_type') {
        if (!SAFE_STEAL_STATS.has(value)) {
            addDiagnostic(vscode, diagnostics, line, arg.index, arg.length, '此数值会产生“超级真驱散”式行为，请确认这是预期效果', vscode.DiagnosticSeverity.Warning, 'effect-steal-stat');
        }
        return;
    }
    if (keyword.value === '.buff_duration_type' && value === 'none') {
        addDiagnostic(vscode, diagnostics, line, arg.index, arg.length, 'Effect 中 none 会被视为 round', vscode.DiagnosticSeverity.Warning, 'effect-duration-none');
        return;
    }
    if (CUSTOM_SOURCE_KEYWORDS.has(keyword.value) && !validValues.includes(value)) {
        addDiagnostic(vscode, diagnostics, line, arg.index, arg.length, '表外来源会被游戏视为 combat_end', vscode.DiagnosticSeverity.Warning, 'effect-custom-source');
        return;
    }

    const boolValues = new Set(data.effect.strBoolValuesForError);
    const isStringBooleanMap = validValues.every(item => item === 'true' || item === 'false');
    const isValid = isStringBooleanMap ? boolValues.has(value) : validValues.includes(value);
    if (!isValid) {
        addDiagnostic(vscode, diagnostics, line, arg.index, Math.max(1, arg.length), keyword.value + ' 的参数无效: ' + value, vscode.DiagnosticSeverity.Error, 'effect-value');
    }
    if (arg.quoted && data.effect.numBoolValues.includes(value)) {
        addDiagnostic(vscode, diagnostics, line, arg.rawIndex, arg.raw.length, '数字布尔值不能放在引号中', vscode.DiagnosticSeverity.Error, 'effect-quoted-number-bool');
    }
}

function validateBuffRelations(vscode, diagnostics, document, block) {
    const type = firstBlockValue(document, block, '.buff_type');
    if (!type || !type.value) {
        return;
    }
    const amount = firstBlockValue(document, block, '.buff_amount');
    const subType = firstBlockValue(document, block, '.buff_sub_type');
    if (!amount || !amount.value) {
        addDiagnostic(vscode, diagnostics, type.line, type.keyword.index, type.keyword.value.length, '.buff_type 需要同一 Effect 块中的 .buff_amount', vscode.DiagnosticSeverity.Error, 'effect-buff-amount');
    }
    const mapped = data.effect.buffTypeToSubTypesMap[type.value];
    if (data.effect.mustHaveSubBuffTypes.includes(type.value) && (!subType || !subType.value)) {
        addDiagnostic(vscode, diagnostics, type.line, type.keyword.index, type.keyword.value.length, type.value + ' 必须同时提供 .buff_sub_type', vscode.DiagnosticSeverity.Error, 'effect-buff-sub-type');
    } else if (mapped && subType && subType.value && !mapped.includes(subType.value)) {
        addDiagnostic(vscode, diagnostics, subType.line, subType.index, subType.length, subType.value + ' 不属于 ' + type.value + ' 允许的 buff_sub_type', vscode.DiagnosticSeverity.Error, 'effect-buff-sub-type');
    } else if (!mapped && !data.effect.subFreeBuffTypes.includes(type.value) && subType && subType.value) {
        addDiagnostic(vscode, diagnostics, subType.line, subType.index, subType.length, type.value + ' 不支持 buff_sub_type', vscode.DiagnosticSeverity.Error, 'effect-buff-sub-type');
    }
}

function validateGuard(vscode, diagnostics, document, line, codeText, keyword, keywords, block) {
    const args = keywordArguments(codeText, keyword, keywords);
    if (!args.length || args[0].raw !== '"1"') {
        addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, keyword.value + ' 的参数必须精确写为 "1"', vscode.DiagnosticSeverity.Error, 'effect-guard-value');
    }
    const onHit = firstBlockValue(document, block, '.on_hit');
    const onMiss = firstBlockValue(document, block, '.on_miss');
    const enabled = [onHit, onMiss].some(item => item && typeof item.value === 'string' && item.value.toLowerCase() === 'true');
    if (!enabled) {
        return;
    }
    const chance = firstBlockValue(document, block, '.chance');
    if (!chance || !chance.value) {
        return;
    }
    const isPercent = chance.value.endsWith('%');
    const parsed = Number.parseFloat(chance.value.replace(/%$/, ''));
    if (Number.isFinite(parsed) && ((isPercent && parsed < 100) || (!isPercent && parsed < 1))) {
        addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '守护效果无法被低于必中的 chance 正确制约', vscode.DiagnosticSeverity.Warning, 'effect-guard-chance');
    }
}

function validateEffectDocument(vscode, document) {
    const diagnostics = [];
    const processedBuffBlocks = new Set();
    for (let line = 0; line < document.lineCount; line += 1) {
        const text = document.lineAt(line).text;
        if (!text.trim() || /^\s*\/\//.test(text)) {
            continue;
        }
        const codeText = validateCommonLine(vscode, diagnostics, document, line, vscode.DiagnosticSeverity.Warning);
        const keywords = extractKeywords(codeText, false);
        const colon = getLogicalColon(text);
        const block = findEffectBlock(document, colon < 0 ? line - 1 : line);

        if (colon < 0) {
            if (!block) {
                addWholeLine(vscode, diagnostics, document, line, "此行不属于任何 'effect:'", vscode.DiagnosticSeverity.Error, 'effect-outside-block');
            } else if (keywords.length) {
                addWholeLine(vscode, diagnostics, document, line, '建议单条 effect 不在内部换行，如有需求请尽量使用分行写法', vscode.DiagnosticSeverity.Warning, 'effect-multiline');
            } else {
                addWholeLine(vscode, diagnostics, document, line, '错误内容', vscode.DiagnosticSeverity.Error, 'effect-content');
            }
        } else {
            const header = codeText.slice(0, colon + 1).trim();
            if (header !== 'effect:') {
                addDiagnostic(vscode, diagnostics, line, Math.max(0, codeText.indexOf(header)), Math.max(1, header.length), "无效的 Header '" + header + "'，Effect 文件需使用 'effect:'", vscode.DiagnosticSeverity.Error, 'effect-header');
            }
        }

        for (const keyword of keywords) {
            if (!effectKeywordSet.has(keyword.value)) {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '未知的 Effect 关键字: ' + keyword.value, vscode.DiagnosticSeverity.Error, 'effect-keyword');
                continue;
            }
            const args = keywordArguments(codeText, keyword, keywords);
            const firstArg = args[0];
            if (keyword.value === '.name') {
                validateName(vscode, diagnostics, line, codeText, keyword, keywords);
            }
            if (keyword.value === '.buff_ids' || keyword.value === '.set_monster_class_ids') {
                validateIdList(vscode, diagnostics, line, codeText, keyword, keywords);
            }
            if (keyword.value === '.cure') {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '建议改用 .cure_bleed 或 .cure_poison', vscode.DiagnosticSeverity.Information, 'effect-cure');
                if (keywords.some(item => item.index > keyword.index && item.value === '.cure_disease')) {
                    addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '.cure 与后续 .cure_disease 存在冲突', vscode.DiagnosticSeverity.Error, 'effect-cure-disease');
                }
            }
            if (keyword.value === '.heal' && keywords.some(item => item.index > keyword.index && item.value === '.healstress')) {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '.heal 不能位于同一行的 .healstress 之前', vscode.DiagnosticSeverity.Error, 'effect-healstress');
            }
            if (keyword.value === '.daze') {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '.daze 存在特殊游戏行为，请确认兼容性', vscode.DiagnosticSeverity.Information, 'effect-daze');
            }
            if (keyword.value === '.affliction_blockable_chance') {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '该关键字存在导致游戏崩溃的潜在风险', vscode.DiagnosticSeverity.Information, 'effect-affliction-chance');
            }
            if (keyword.value === '.spawn_target_actor_base_class_id' && keywords.some(item => item.index < keyword.index && item.value === '.target')) {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '.spawn_target_actor_base_class_id 前方不应再有 .target', vscode.DiagnosticSeverity.Error, 'effect-spawn-target');
            }
            if (block && keyword.value === '.skill_instant' && firstArg && firstArg.value === 'true') {
                const targets = blockValues(document, block, '.target');
                if (!targets.some(item => item.value !== 'target' && item.value !== 'target_enemy_group')) {
                    addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '.skill_instant true 需要至少一个非 target / target_enemy_group 的 .target', vscode.DiagnosticSeverity.Error, 'effect-skill-instant');
                }
            }
            if (block && keyword.value === '.use_item_id' && !blockHasKeyword(document, block, '.use_item_type')) {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '.use_item_id 需要同一 Effect 块中的 .use_item_type', vscode.DiagnosticSeverity.Error, 'effect-use-item');
            }
            if (block && GUARD_KEYWORDS.has(keyword.value)) {
                validateGuard(vscode, diagnostics, document, line, codeText, keyword, keywords, block);
            }
            validateFixedValue(vscode, diagnostics, line, keyword, firstArg);
        }

        const dotKeywords = keywords.filter(item => DOT_KEYWORDS.has(item.value));
        if (dotKeywords.length > 1) {
            const first = dotKeywords[0].value;
            for (const item of dotKeywords.slice(1)) {
                if (item.value !== first) {
                    addDiagnostic(vscode, diagnostics, line, item.index, item.value.length, '同一 Effect 不能混用不同 Dot 类型；覆盖优先级：腐蚀 > 流血 > 恐惧 > 延迟扰乱 > 愈合', vscode.DiagnosticSeverity.Error, 'effect-dot-conflict');
                }
            }
        }
        if (block && !processedBuffBlocks.has(block.startLine)) {
            processedBuffBlocks.add(block.startLine);
            validateBuffRelations(vscode, diagnostics, document, block);
        }
    }
    return diagnostics;
}

module.exports = { validateEffectDocument, keywordArguments, firstBlockValue, blockValues };

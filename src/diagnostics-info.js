'use strict';

const {
    data,
    SKILL_HEADERS,
    infoHeaderSet,
    infoContextSets,
    allInfoKeywordSet,
    infoValueContexts,
    singleStringRules,
    multiStringRules,
    maxArgumentRules,
    pairKey,
    codeBeforeComment,
    extractKeywords,
    headerMatch
} = require('./language');
const { addDiagnostic, addWholeLine, validateCommonLine, countWithoutWhitespace } = require('./diagnostics-common');

const BOOLEAN_ERROR_VALUES = new Set(['false', 'true', 'False', 'True', 'FALSE', 'TRUE']);
const SKILL_PREFIXES = new Set(
    [...SKILL_HEADERS].flatMap(header => data.info.infoContextMap[header] || []).map(keyword => keyword.slice(1).toLowerCase())
);

function parseArgumentsAcrossLines(document, keywordLine, keyword, blockEndLine) {
    const result = [];
    for (let line = keywordLine; line <= blockEndLine; line += 1) {
        const original = document.lineAt(line).text;
        if (line > keywordLine && headerMatch(original)) {
            break;
        }
        const codeText = codeBeforeComment(original);
        const start = line === keywordLine ? keyword.end : 0;
        const segment = codeText.slice(start);
        const nextKeyword = extractKeywords(segment, true)[0];
        const usable = nextKeyword ? segment.slice(0, nextKeyword.index) : segment;
        const regex = /"([^"]*)"|(\S+)/g;
        for (const match of usable.matchAll(regex)) {
            const quoted = match[1] !== undefined;
            result.push({
                value: quoted ? match[1] : match[2],
                raw: match[0],
                quoted,
                line,
                index: start + match.index + (quoted ? 1 : 0),
                rawIndex: start + match.index,
                length: quoted ? match[1].length : match[0].length
            });
        }
        if (nextKeyword) {
            break;
        }
    }
    return result;
}

function isBooleanList(values) {
    return values.length === 2 && values.includes('true') && values.includes('false');
}

function validateFixedValues(vscode, diagnostics, header, keyword, args) {
    const validValues = infoValueContexts.get(pairKey(header, keyword.value));
    if (!validValues) {
        return;
    }
    const boolean = isBooleanList(validValues);
    if (boolean && args.length > 1) {
        const extra = args[1];
        addDiagnostic(vscode, diagnostics, extra.line, extra.rawIndex, Math.max(1, extra.raw.length), keyword.value + ' 只能有一个布尔参数', vscode.DiagnosticSeverity.Error, 'info-bool-count');
    }
    for (const arg of args) {
        if (/\s/.test(arg.value)) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '固定值参数不能包含空白', vscode.DiagnosticSeverity.Error, 'info-value-whitespace');
        }
        const allowed = boolean ? BOOLEAN_ERROR_VALUES.has(arg.value) : validValues.includes(arg.value);
        if (allowed) {
            continue;
        }
        if (SKILL_HEADERS.has(header) && keyword.value === '.type') {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '自定义技能 type 可被游戏读取，但非友方技能可能失去近战/远程增益和 Trigger', vscode.DiagnosticSeverity.Information, 'info-custom-skill-type');
        } else {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), keyword.value + ' 的参数无效: ' + arg.value, vscode.DiagnosticSeverity.Error, 'info-value');
        }
    }
}

function validateDisabledList(vscode, diagnostics, keyword, args, validValues, maximum) {
    const seen = new Set();
    for (const arg of args) {
        if (/\s/.test(arg.value)) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '参数不能包含空白', vscode.DiagnosticSeverity.Error, 'info-disabled-whitespace');
        }
        if (!validValues.includes(arg.value)) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '无效的枚举值: ' + arg.value, vscode.DiagnosticSeverity.Error, 'info-disabled-value');
        }
        if (seen.has(arg.value)) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '参数重复: ' + arg.value, vscode.DiagnosticSeverity.Error, 'info-disabled-duplicate');
        }
        seen.add(arg.value);
    }
    if (args.length > maximum) {
        const extra = args[maximum];
        addDiagnostic(vscode, diagnostics, extra.line, extra.rawIndex, Math.max(1, extra.raw.length), keyword.value + ' 最多允许 ' + maximum + ' 个参数', vscode.DiagnosticSeverity.Error, 'info-disabled-count');
    }
}

function validateSingleString(vscode, diagnostics, header, keyword, args) {
    let maxLength = singleStringRules.get(pairKey(header, keyword.value));
    let modeSpecial = false;
    if ((header === 'mode:' && keyword.value === '.id') || (SKILL_HEADERS.has(header) && keyword.value === '.valid_modes')) {
        maxLength = 64;
        modeSpecial = true;
    }
    if (!maxLength || !args.length) {
        return;
    }
    if (args.length > 1) {
        const extra = args[1];
        addDiagnostic(vscode, diagnostics, extra.line, extra.rawIndex, Math.max(1, extra.raw.length), keyword.value + ' 只允许一个字符串参数', vscode.DiagnosticSeverity.Error, 'info-single-count');
    }
    const arg = args[0];
    const length = countWithoutWhitespace(arg.value);
    if (modeSpecial) {
        if (length > 64) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '模式名称不能超过 64 字符', vscode.DiagnosticSeverity.Error, 'info-mode-length');
        } else if (length > 32) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '模式名称超过 32 字符，可能存在兼容性问题', vscode.DiagnosticSeverity.Warning, 'info-mode-length');
        }
        return;
    }
    if (length > maxLength) {
        addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '字符串长度不能超过 ' + maxLength + ' 字符', vscode.DiagnosticSeverity.Error, 'info-string-length');
    } else if (length === maxLength) {
        addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '字符串长度已达到 ' + maxLength + ' 字符上限', vscode.DiagnosticSeverity.Warning, 'info-string-length');
    }
}

function getMultiRule(header, keyword) {
    const staticRule = multiStringRules.get(pairKey(header, keyword));
    if (staticRule) {
        return staticRule;
    }
    if (SKILL_HEADERS.has(header) && keyword.endsWith('_effects')) {
        return { header, keyword, maxArgs: 6, maxLength: 64, dynamic: true };
    }
    return null;
}

function validateMultiString(vscode, diagnostics, header, keyword, args) {
    const rule = getMultiRule(header, keyword.value);
    if (!rule) {
        return;
    }
    const softOverflow = keyword.value === '.damage_heal_base_class_ids' || keyword.value === '.incompatible_class_ids';
    if (args.length > rule.maxArgs) {
        const extra = args[rule.maxArgs];
        addDiagnostic(vscode, diagnostics, extra.line, extra.rawIndex, Math.max(1, extra.raw.length), keyword.value + ' 最多允许 ' + rule.maxArgs + ' 个参数' + (softOverflow ? '，建议拆分为多行' : ''), softOverflow ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error, 'info-multi-count');
    }
    if (header === 'spawn:' && keyword.value === '.effects' && args.length > Math.floor(rule.maxArgs / 2)) {
        const firstSuggestArg = args[Math.floor(rule.maxArgs / 2)];
        addDiagnostic(vscode, diagnostics, firstSuggestArg.line, firstSuggestArg.rawIndex, Math.max(1, firstSuggestArg.raw.length), '.effects 参数数不建议超过上限的一半，请留意游戏兼容性', vscode.DiagnosticSeverity.Warning, 'info-spawn-effects-count');
    }
    for (const arg of args) {
        const length = countWithoutWhitespace(arg.value);
        if (length > rule.maxLength) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '单个参数长度不能超过 ' + rule.maxLength + ' 字符', vscode.DiagnosticSeverity.Error, 'info-multi-length');
        } else if (length === rule.maxLength) {
            addDiagnostic(vscode, diagnostics, arg.line, arg.index, Math.max(1, arg.length), '单个参数长度已达到 ' + rule.maxLength + ' 字符上限', vscode.DiagnosticSeverity.Warning, 'info-multi-length');
        }
    }
}

function validateMaxArguments(vscode, diagnostics, header, keyword, args) {
    const maximum = maxArgumentRules.get(pairKey(header, keyword.value));
    if (maximum === undefined || args.length <= maximum) {
        return;
    }
    const extra = args[maximum];
    addDiagnostic(vscode, diagnostics, extra.line, extra.rawIndex, Math.max(1, extra.raw.length), keyword.value + ' 最多允许 ' + maximum + ' 个参数', vscode.DiagnosticSeverity.Error, 'info-argument-count');
}

function isValidDynamicKeyword(header, keyword, previousKeyword) {
    if (!SKILL_HEADERS.has(header) || !keyword.endsWith('_effects')) {
        return false;
    }
    const body = keyword.slice(1).toLowerCase();
    if ([...SKILL_PREFIXES].some(prefix => body.startsWith(prefix))) {
        return false;
    }
    if (/\d/.test(body) && previousKeyword === '.target') {
        return false;
    }
    return true;
}

function validateInfoDocument(vscode, document) {
    const diagnostics = [];
    let currentHeader = null;
    let currentHeaderLine = -1;
    let previousValidKeyword = null;
    const deathMonster = [];
    const deathRandom = [];

    for (let line = 0; line < document.lineCount; line += 1) {
        const text = document.lineAt(line).text;
        if (!text.trim() || /^\s*\/\//.test(text)) {
            continue;
        }
        const codeText = validateCommonLine(vscode, diagnostics, document, line, vscode.DiagnosticSeverity.Error);
        const match = headerMatch(text);
        if (match) {
            currentHeader = match.groups.header;
            currentHeaderLine = line;
            previousValidKeyword = null;
            if (!infoHeaderSet.has(currentHeader)) {
                addWholeLine(vscode, diagnostics, document, line, '未知的 Header: ' + currentHeader, vscode.DiagnosticSeverity.Error, 'info-header');
            }
        }

        const keywords = extractKeywords(codeText, true);
        if (!currentHeader && keywords.length) {
            addWholeLine(vscode, diagnostics, document, line, '此关键字之前缺少 Header', vscode.DiagnosticSeverity.Error, 'info-missing-header');
        }
        const contextKeywords = currentHeader ? infoContextSets.get(currentHeader) : null;
        let blockEndLine = document.lineCount - 1;
        for (let nextLine = line + 1; nextLine < document.lineCount; nextLine += 1) {
            if (headerMatch(document.lineAt(nextLine).text)) {
                blockEndLine = nextLine - 1;
                break;
            }
        }

        for (const keyword of keywords) {
            keyword.line = line;
            let valid = Boolean(contextKeywords && contextKeywords.has(keyword.value));
            if (!valid && isValidDynamicKeyword(currentHeader, keyword.value, previousValidKeyword)) {
                valid = true;
            }
            if (!valid) {
                if (allInfoKeywordSet.has(keyword.value)) {
                    addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, keyword.value + ' 不属于当前 Header ' + (currentHeader || '(无)'), vscode.DiagnosticSeverity.Error, 'info-keyword-context');
                } else {
                    addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '未知或无效的关键字: ' + keyword.value, vscode.DiagnosticSeverity.Error, 'info-keyword');
                }
                continue;
            }

            if (keyword.value === '.was_killed_effects') {
                addDiagnostic(vscode, diagnostics, line, keyword.index, keyword.value.length, '请使用 .was_killed_by_hero_effects', vscode.DiagnosticSeverity.Error, 'info-was-killed-effects');
            }
            if (currentHeader === 'death_class:') {
                if (keyword.value === '.monster_class_id') {
                    deathMonster.push({ line, keyword });
                } else if (keyword.value === '.random_monster_class_ids') {
                    deathRandom.push({ line, keyword });
                }
            }

            const args = parseArgumentsAcrossLines(document, line, keyword, blockEndLine);
            validateSingleString(vscode, diagnostics, currentHeader, keyword, args);
            validateMultiString(vscode, diagnostics, currentHeader, keyword, args);
            validateMaxArguments(vscode, diagnostics, currentHeader, keyword, args);
            validateFixedValues(vscode, diagnostics, currentHeader, keyword, args);

            if (keyword.value === '.disabled_popup_text_types') {
                const values = data.info.keywordValueMap['.disabled_popup_text_types'];
                validateDisabledList(vscode, diagnostics, keyword, args, values, values.length);
            } else if (keyword.value === '.disabled_act_out_combat_start_turn_types') {
                validateDisabledList(vscode, diagnostics, keyword, args, data.info.keywordValueMap['.disabled_act_out_combat_start_turn_types'], 4);
            }
            previousValidKeyword = keyword.value;
        }
    }

    if (deathMonster.length && deathRandom.length) {
        for (const item of [...deathMonster, ...deathRandom]) {
            addDiagnostic(vscode, diagnostics, item.line, item.keyword.index, item.keyword.value.length, 'death_class 文件中 .monster_class_id 与 .random_monster_class_ids 不能同时出现', vscode.DiagnosticSeverity.Error, 'info-death-class-conflict');
        }
    }
    return diagnostics;
}

module.exports = {
    validateInfoDocument,
    parseArgumentsAcrossLines,
    validateFixedValues,
    isValidDynamicKeyword,
    SKILL_PREFIXES
};


'use strict';

const data = require('./data.json');

const EFFECT_LANGUAGE = 'darkest-effect';
const INFO_LANGUAGES = new Set(['darkest-info', 'darkest-art', 'darkest-override']);
const COLOURS_LANGUAGE = 'darkest-colours';
const ALL_LANGUAGES = new Set([EFFECT_LANGUAGE, ...INFO_LANGUAGES, COLOURS_LANGUAGE]);
const SKILL_HEADERS = new Set(['riposte_skill:', 'skill:', 'combat_skill:', 'combat_move_skill:']);
const DOT_KEYWORDS = new Set(['.dotBleed', '.dotPoison', '.dotStress', '.dotHpHeal', '.dotShuffle']);

const effectKeywordSet = new Set(data.effect.allKeywords);
const infoHeaderSet = new Set(data.info.allHeaders);
const infoContextSets = new Map(Object.entries(data.info.infoContextMap).map(([header, values]) => [header, new Set(values)]));
const allInfoKeywordSet = new Set(Object.values(data.info.infoContextMap).flat());
const effectValueMap = new Map(Object.entries(data.effect.keywordToValuesMap));
const infoValueContexts = new Map(data.info.valueContexts.map(item => [pairKey(item.header, item.keyword), item.values]));
const singleStringRules = new Map();
for (const [size, rules] of [[32, data.info.singleString32], [64, data.info.singleString64], [128, data.info.singleString128], [512, data.info.singleString512]]) {
    for (const rule of rules) {
        singleStringRules.set(pairKey(rule.header, rule.keyword), size);
    }
}
const multiStringRules = new Map(data.info.multiStringLengthRules.map(rule => [pairKey(rule.header, rule.keyword), rule]));
const maxArgumentRules = new Map(data.info.maxArgumentCountRules.map(rule => [pairKey(rule.header, rule.keyword), rule.maxArgs]));

function pairKey(header, keyword) {
    return header + '\u0000' + keyword;
}

function commentIndex(text) {
    return text.indexOf('//');
}

function codeBeforeComment(text) {
    const index = commentIndex(text);
    return index < 0 ? text : text.slice(0, index);
}

function inlineCommentIndex(text) {
    const index = commentIndex(text);
    if (index < 0) {
        return -1;
    }
    return text.slice(0, index).trim().length > 0 ? index : -1;
}

function getStringRanges(text) {
    const ranges = [];
    let start = -1;
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] !== '"') {
            continue;
        }
        if (start < 0) {
            start = index;
        } else {
            ranges.push({ start, end: index + 1 });
            start = -1;
        }
    }
    if (start >= 0) {
        ranges.push({ start, end: text.length });
    }
    return ranges;
}

function isInsideRanges(index, ranges) {
    return ranges.some(range => index >= range.start && index < range.end);
}

function isKeywordStart(text, index, ranges = getStringRanges(text)) {
    if (text[index] !== '.' || isInsideRanges(index, ranges)) {
        return false;
    }
    const previous = index > 0 ? text[index - 1] : '';
    if (previous && !/\s/.test(previous)) {
        return false;
    }
    const next = text[index + 1] || '';
    return /[A-Za-z_]/.test(next);
}

function extractKeywords(text, allowDigits = false) {
    const code = codeBeforeComment(text);
    const ranges = getStringRanges(code);
    const regex = allowDigits ? /\.[A-Za-z0-9_]+/g : /\.[A-Za-z_]+/g;
    const result = [];
    for (const match of code.matchAll(regex)) {
        if (isKeywordStart(code, match.index, ranges)) {
            result.push({ value: match[0], index: match.index, end: match.index + match[0].length });
        }
    }
    return result;
}

function getLogicalColon(text) {
    const code = codeBeforeComment(text);
    const ranges = getStringRanges(code).filter(range => code[range.end - 1] === '"');
    for (let index = 0; index < code.length; index += 1) {
        if (code[index] === ':' && !isInsideRanges(index, ranges)) {
            return index;
        }
    }
    return -1;
}

function headerMatch(text) {
    return /^\s*(?<header>[A-Za-z0-9_]+:)/.exec(codeBeforeComment(text));
}

function effectHeaderIndex(text) {
    return codeBeforeComment(text).indexOf('effect:');
}

function findHeaderAbove(document, fromLine) {
    for (let line = fromLine; line >= 0; line -= 1) {
        const text = document.lineAt(line).text;
        if (!text.trim() || /^\s*\/\//.test(text)) {
            continue;
        }
        const match = headerMatch(text);
        if (match) {
            return { header: match.groups.header, line };
        }
    }
    return null;
}

function findInfoBlock(document, lineNumber) {
    const active = findHeaderAbove(document, lineNumber);
    if (!active) {
        return null;
    }
    let endLine = document.lineCount - 1;
    for (let line = active.line + 1; line < document.lineCount; line += 1) {
        if (headerMatch(document.lineAt(line).text)) {
            endLine = line - 1;
            break;
        }
    }
    return { ...active, startLine: active.line, endLine };
}

function findEffectBlock(document, lineNumber) {
    let startLine = -1;
    for (let line = lineNumber; line >= 0; line -= 1) {
        if (effectHeaderIndex(document.lineAt(line).text) >= 0) {
            startLine = line;
            break;
        }
    }
    if (startLine < 0) {
        return null;
    }
    let endLine = document.lineCount - 1;
    for (let line = startLine + 1; line < document.lineCount; line += 1) {
        if (effectHeaderIndex(document.lineAt(line).text) >= 0) {
            endLine = line - 1;
            break;
        }
    }
    return { startLine, endLine };
}

function collectBlockKeywords(document, block, allowDigits) {
    const result = [];
    if (!block) {
        return result;
    }
    for (let line = block.startLine; line <= block.endLine; line += 1) {
        for (const keyword of extractKeywords(document.lineAt(line).text, allowDigits)) {
            result.push({ ...keyword, line });
        }
    }
    return result;
}

function getWordTokenAt(text, character) {
    const before = text.slice(0, character);
    const match = /(?:^|\s)(\.?[A-Za-z0-9_]*)$/.exec(before);
    if (!match) {
        return null;
    }
    const token = match[1];
    return { token, start: character - token.length, end: character };
}

function parseArgumentsFromText(text, startIndex) {
    const code = codeBeforeComment(text).slice(startIndex);
    const args = [];
    const regex = /"([^"]*)"|(\S+)/g;
    for (const match of code.matchAll(regex)) {
        const quoted = match[1] !== undefined;
        args.push({
            value: quoted ? match[1] : match[2],
            raw: match[0],
            quoted,
            index: startIndex + match.index + (quoted ? 1 : 0),
            rawIndex: startIndex + match.index,
            length: quoted ? match[1].length : match[0].length
        });
    }
    return args;
}

module.exports = {
    data,
    EFFECT_LANGUAGE,
    INFO_LANGUAGES,
    COLOURS_LANGUAGE,
    ALL_LANGUAGES,
    SKILL_HEADERS,
    DOT_KEYWORDS,
    effectKeywordSet,
    infoHeaderSet,
    infoContextSets,
    allInfoKeywordSet,
    effectValueMap,
    infoValueContexts,
    singleStringRules,
    multiStringRules,
    maxArgumentRules,
    pairKey,
    commentIndex,
    codeBeforeComment,
    inlineCommentIndex,
    getStringRanges,
    isInsideRanges,
    isKeywordStart,
    extractKeywords,
    getLogicalColon,
    headerMatch,
    effectHeaderIndex,
    findHeaderAbove,
    findInfoBlock,
    findEffectBlock,
    collectBlockKeywords,
    getWordTokenAt,
    parseArgumentsFromText
};

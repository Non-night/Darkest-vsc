'use strict';

const { fuzzyFilter } = require('./fuzzy');
const {
    data,
    DOT_KEYWORDS,
    effectValueMap,
    infoValueContexts,
    infoContextSets,
    pairKey,
    codeBeforeComment,
    extractKeywords,
    findEffectBlock,
    findInfoBlock,
    collectBlockKeywords,
    getWordTokenAt,
    headerMatch
} = require('./language');

function createItems(vscode, candidates, query, range, kind, detail) {
    return fuzzyFilter(query, candidates).map((value, index) => {
        const item = new vscode.CompletionItem(value, kind);
        item.range = range;
        item.insertText = value;
        item.filterText = value.replace(/[._]/g, '');
        item.sortText = String(index).padStart(5, '0');
        item.detail = detail;
        return item;
    });
}

function lineRange(vscode, line, start, end) {
    return new vscode.Range(new vscode.Position(line, start), new vscode.Position(line, end));
}

function lastEffectKeywordBefore(text, character) {
    const keywords = extractKeywords(text.slice(0, character), false);
    return keywords.length ? keywords[keywords.length - 1] : null;
}

function provideEffectCompletions(vscode, document, position) {
    const text = document.lineAt(position.line).text;
    const tokenInfo = getWordTokenAt(text, position.character);
    if (!tokenInfo) {
        return [];
    }
    const range = lineRange(vscode, position.line, tokenInfo.start, tokenInfo.end);
    if (tokenInfo.token.startsWith('.')) {
        if (tokenInfo.start > 0 && !/\s/.test(text[tokenInfo.start - 1])) {
            return [];
        }
        const block = findEffectBlock(document, position.line);
        const used = new Set(collectBlockKeywords(document, block, false).map(item => item.value));
        const hasDot = [...used].some(keyword => DOT_KEYWORDS.has(keyword));
        const candidates = data.effect.allKeywords.filter(keyword => {
            if (used.has(keyword)) {
                return false;
            }
            if (hasDot && DOT_KEYWORDS.has(keyword)) {
                return false;
            }
            return true;
        });
        return createItems(vscode, candidates, tokenInfo.token, range, vscode.CompletionItemKind.Property, 'Darkest Effect 关键字');
    }

    const keyword = lastEffectKeywordBefore(text, tokenInfo.start);
    if (!keyword || !effectValueMap.has(keyword.value)) {
        return [];
    }
    return createItems(vscode, effectValueMap.get(keyword.value), tokenInfo.token, range, vscode.CompletionItemKind.Value, keyword.value + ' 参数');
}

function getInfoKeywordContext(document, position, block) {
    if (!block) {
        return null;
    }
    for (let line = position.line; line >= block.startLine; line -= 1) {
        const limit = line === position.line ? position.character : document.lineAt(line).text.length;
        const text = document.lineAt(line).text.slice(0, limit);
        const keywords = extractKeywords(text, true);
        if (keywords.length) {
            const keyword = keywords[keywords.length - 1];
            return { ...keyword, line };
        }
        if (line !== position.line && headerMatch(document.lineAt(line).text)) {
            break;
        }
    }
    return null;
}

function collectArgumentsBetween(document, keywordContext, position) {
    const values = [];
    for (let line = keywordContext.line; line <= position.line; line += 1) {
        const fullText = codeBeforeComment(document.lineAt(line).text);
        const start = line === keywordContext.line ? keywordContext.end : 0;
        const end = line === position.line ? position.character : fullText.length;
        const text = fullText.slice(start, Math.min(end, fullText.length));
        const regex = /"([^"]*)"|(\S+)/g;
        for (const match of text.matchAll(regex)) {
            const value = match[1] !== undefined ? match[1] : match[2];
            if (!value.startsWith('.')) {
                values.push(value);
            }
        }
    }
    return values;
}

function provideInfoCompletions(vscode, document, position) {
    const text = document.lineAt(position.line).text;
    const before = text.slice(0, position.character);
    const tokenInfo = getWordTokenAt(text, position.character);
    if (!tokenInfo) {
        return [];
    }
    const range = lineRange(vscode, position.line, tokenInfo.start, tokenInfo.end);

    if (!before.includes(':') && /^\s*[A-Za-z0-9_]*$/.test(before) && !tokenInfo.token.startsWith('.')) {
        return createItems(vscode, data.info.allHeaders, tokenInfo.token, range, vscode.CompletionItemKind.Module, 'Darkest Header');
    }

    const block = findInfoBlock(document, position.line);
    if (!block) {
        return [];
    }

    if (tokenInfo.token.startsWith('.')) {
        const candidates = infoContextSets.get(block.header);
        if (!candidates) {
            return [];
        }
        const used = new Set(collectBlockKeywords(document, block, true).map(item => item.value));
        const available = [...candidates].filter(keyword => !used.has(keyword));
        return createItems(vscode, available, tokenInfo.token, range, vscode.CompletionItemKind.Property, block.header + ' 关键字');
    }

    const keywordContext = getInfoKeywordContext(document, position, block);
    if (!keywordContext) {
        return [];
    }
    const values = infoValueContexts.get(pairKey(block.header, keywordContext.value));
    if (!values) {
        return [];
    }
    let candidates = values;
    if (keywordContext.value === '.disabled_popup_text_types' || keywordContext.value === '.disabled_act_out_combat_start_turn_types') {
        const used = new Set(collectArgumentsBetween(document, keywordContext, position));
        candidates = values.filter(value => !used.has(value));
    }
    return createItems(vscode, candidates, tokenInfo.token, range, vscode.CompletionItemKind.Value, keywordContext.value + ' 参数');
}

function registerCompletionProviders(vscode, context) {
    const triggerCharacters = ['.', ' ', '_', ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        { language: 'darkest-effect', scheme: 'file' },
        { provideCompletionItems: (document, position) => provideEffectCompletions(vscode, document, position) },
        ...triggerCharacters
    ));
    for (const language of ['darkest-info', 'darkest-art', 'darkest-override']) {
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
            { language, scheme: 'file' },
            { provideCompletionItems: (document, position) => provideInfoCompletions(vscode, document, position) },
            ...triggerCharacters
        ));
    }
}

module.exports = {
    createItems,
    provideEffectCompletions,
    provideInfoCompletions,
    registerCompletionProviders,
    getInfoKeywordContext,
    collectArgumentsBetween
};

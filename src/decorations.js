'use strict';

const {
    INFO_LANGUAGES,
    allInfoKeywordSet,
    codeBeforeComment
} = require('./language');
const { SKILL_PREFIXES } = require('./diagnostics-info');

// 按 VSIX 的向前扫描方式取得当前动态关键字之前的点号关键字。
function findPreviousDotKeyword(text, currentKeywordStart) {
    let position = currentKeywordStart - 1;
    while (position >= 0) {
        if (text[position] !== '.') {
            position -= 1;
            continue;
        }
        const previousIsDigit = position > 0 && /\d/.test(text[position - 1]);
        const nextIsDigit = position + 1 < currentKeywordStart && /\d/.test(text[position + 1]);
        if (previousIsDigit || nextIsDigit) {
            position -= 1;
            continue;
        }
        let end = position + 1;
        while (end < currentKeywordStart) {
            const character = text[end];
            if (/\s/.test(character) || (character === '.' && end !== position)) {
                break;
            }
            end += 1;
        }
        return end > position + 1 ? text.slice(position, end) : '.';
    }
    return null;
}

function getDocumentTextAndLineStarts(document) {
    const lines = [];
    const starts = [];
    let offset = 0;
    for (let line = 0; line < document.lineCount; line += 1) {
        starts.push(offset);
        const text = document.lineAt(line).text;
        lines.push(text);
        offset += text.length + 1;
    }
    return { text: lines.join('\n'), starts };
}

// TextMate 无法表达跨行“前一个关键字”规则，因此用装饰覆盖 VSIX 判定为错误的动态 _effects 颜色。
function findInvalidDynamicEffectRanges(document) {
    const result = [];
    const wholeDocument = getDocumentTextAndLineStarts(document);
    for (let line = 0; line < document.lineCount; line += 1) {
        const codeText = codeBeforeComment(document.lineAt(line).text);
        const regex = /\.[A-Za-z0-9_]+/g;
        for (const match of codeText.matchAll(regex)) {
            const keyword = match[0];
            if ((match.index > 0 && /\d/.test(codeText[match.index - 1])) || allInfoKeywordSet.has(keyword) || !keyword.endsWith('_effects')) {
                continue;
            }
            const dynamic = /^\.(?<body>[^\s.]+)_effects$/.exec(keyword);
            if (!dynamic) {
                result.push({ line, start: match.index, length: keyword.length });
                continue;
            }
            const body = dynamic.groups.body.toLowerCase();
            const hasReservedPrefix = [...SKILL_PREFIXES].some(prefix => body.startsWith(prefix));
            const absoluteStart = wholeDocument.starts[line] + match.index;
            const previousKeyword = findPreviousDotKeyword(wholeDocument.text, absoluteStart);
            const followsTargetWithDigit = /\d/.test(body) && previousKeyword && previousKeyword.toLowerCase() === '.target';
            if (hasReservedPrefix || followsTargetWithDigit) {
                result.push({ line, start: match.index, length: keyword.length });
            }
        }
    }
    return result;
}

function registerInfoKeywordDecorations(vscode, context) {
    const invalidDecoration = vscode.window.createTextEditorDecorationType({ color: '#FFFF00' });
    context.subscriptions.push(invalidDecoration);

    const updateEditor = editor => {
        if (!editor || !INFO_LANGUAGES.has(editor.document.languageId)) {
            return;
        }
        const ranges = findInvalidDynamicEffectRanges(editor.document).map(item => new vscode.Range(
            item.line,
            item.start,
            item.line,
            item.start + item.length
        ));
        editor.setDecorations(invalidDecoration, ranges);
    };
    const updateDocument = document => {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document === document) {
                updateEditor(editor);
            }
        }
    };

    for (const editor of vscode.window.visibleTextEditors) {
        updateEditor(editor);
    }
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateEditor));
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => editors.forEach(updateEditor)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => updateDocument(event.document)));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(updateDocument));

    return { updateEditor, updateDocument };
}

module.exports = {
    findPreviousDotKeyword,
    findInvalidDynamicEffectRanges,
    registerInfoKeywordDecorations
};


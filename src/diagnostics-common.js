'use strict';

const { codeBeforeComment, inlineCommentIndex } = require('./language');

function range(vscode, line, start, length) {
    const safeStart = Math.max(0, start);
    const safeLength = Math.max(1, length || 1);
    return new vscode.Range(line, safeStart, line, safeStart + safeLength);
}

function addDiagnostic(vscode, diagnostics, line, start, length, message, severity, code) {
    const diagnostic = new vscode.Diagnostic(range(vscode, line, start, length), message, severity);
    diagnostic.source = 'Darkest Dungeon';
    if (code) {
        diagnostic.code = code;
    }
    diagnostics.push(diagnostic);
    return diagnostic;
}

function addWholeLine(vscode, diagnostics, document, line, message, severity, code) {
    const text = document.lineAt(line).text;
    const start = text.search(/\S/);
    addDiagnostic(vscode, diagnostics, line, start < 0 ? 0 : start, Math.max(1, text.trimEnd().length - Math.max(0, start)), message, severity, code);
}

function isChineseOrFullWidth(codePoint) {
    return (codePoint >= 0x3400 && codePoint <= 0x4DBF) ||
        (codePoint >= 0x4E00 && codePoint <= 0x9FFF) ||
        (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
        (codePoint >= 0x20000 && codePoint <= 0x2EBEF) ||
        (codePoint >= 0x30000 && codePoint <= 0x3134F) ||
        (codePoint >= 0x2F800 && codePoint <= 0x2FA1F) ||
        (codePoint >= 0x3000 && codePoint <= 0x303F) ||
        (codePoint >= 0xFF00 && codePoint <= 0xFFEF);
}

function validateChinese(vscode, diagnostics, line, codeText) {
    let runStart = -1;
    let runLength = 0;
    let runText = '';
    const flush = () => {
        if (runStart >= 0) {
            addDiagnostic(vscode, diagnostics, line, runStart, runLength, '不允许出现中文字符或中文标点: ' + runText, vscode.DiagnosticSeverity.Error, 'chinese-character');
        }
        runStart = -1;
        runLength = 0;
        runText = '';
    };
    for (let index = 0; index < codeText.length;) {
        const codePoint = codeText.codePointAt(index);
        const charLength = codePoint > 0xFFFF ? 2 : 1;
        if (isChineseOrFullWidth(codePoint)) {
            if (runStart < 0) {
                runStart = index;
            }
            runLength += charLength;
            runText += codeText.slice(index, index + charLength);
        } else {
            flush();
        }
        index += charLength;
    }
    flush();
}

function validateQuotes(vscode, diagnostics, line, codeText) {
    const quotePositions = [];
    for (let index = 0; index < codeText.length; index += 1) {
        if (codeText[index] === '"') {
            quotePositions.push(index);
        }
    }
    if (quotePositions.length % 2 !== 0) {
        addDiagnostic(vscode, diagnostics, line, quotePositions[quotePositions.length - 1], 1, '单行内引号不成对', vscode.DiagnosticSeverity.Error, 'unpaired-quote');
    }
    let inString = false;
    for (const index of quotePositions) {
        if (!inString) {
            const previous = index > 0 ? codeText[index - 1] : '';
            if (previous && !/\s/.test(previous)) {
                addDiagnostic(vscode, diagnostics, line, index, 1, '引号前极度不建议紧贴普通字符，请用空格分隔，或把整个参数放进引号', vscode.DiagnosticSeverity.Error, 'quote-adjacency');
            }
        } else {
            const next = codeText[index + 1] || '';
            if (next && !/\s/.test(next)) {
                const isKeyword = next === '.';
                addDiagnostic(
                    vscode,
                    diagnostics,
                    line,
                    index,
                    1,
                    isKeyword ? '引号后极度不建议紧贴下一个关键字，请用空格分隔' : '引号后极度不建议紧贴普通字符，请用空格分隔，或把整个参数放进引号',
                    isKeyword ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error,
                    'quote-adjacency'
                );
            }
        }
        inString = !inString;
    }
}

function validateCommonLine(vscode, diagnostics, document, line, inlineSeverity) {
    const text = document.lineAt(line).text;
    const codeText = codeBeforeComment(text);
    const inlineIndex = inlineCommentIndex(text);
    if (inlineIndex >= 0) {
        addDiagnostic(
            vscode,
            diagnostics,
            line,
            inlineIndex,
            Math.max(2, text.length - inlineIndex),
            inlineSeverity === vscode.DiagnosticSeverity.Warning ? '请尽可能避免行内注释以防游戏识别错误' : '不允许行内注释，请将注释放在独立行',
            inlineSeverity,
            'inline-comment'
        );
    }
    validateChinese(vscode, diagnostics, line, codeText);
    validateQuotes(vscode, diagnostics, line, codeText);
    return codeText;
}

function countWithoutWhitespace(value) {
    return String(value || '').replace(/\s/g, '').length;
}

module.exports = {
    range,
    addDiagnostic,
    addWholeLine,
    validateChinese,
    validateQuotes,
    validateCommonLine,
    countWithoutWhitespace
};

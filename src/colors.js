'use strict';

function parseRgbaArguments(vscode, text) {
    const hex3 = /^#([0-9A-Fa-f]{3})$/.exec(text);
    if (hex3) {
        const [r, g, b] = [...hex3[1]].map(value => Number.parseInt(value + value, 16));
        return new vscode.Color(r / 255, g / 255, b / 255, 1);
    }
    const hex6 = /^#([0-9A-Fa-f]{6})$/.exec(text);
    if (hex6) {
        const value = hex6[1];
        return new vscode.Color(Number.parseInt(value.slice(0, 2), 16) / 255, Number.parseInt(value.slice(2, 4), 16) / 255, Number.parseInt(value.slice(4, 6), 16) / 255, 1);
    }
    const rgba = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/.exec(text);
    if (!rgba) {
        return null;
    }
    const values = rgba.slice(1).map(Number);
    if (values.some(value => value < 0 || value > 255)) {
        return null;
    }
    return new vscode.Color(values[0] / 255, values[1] / 255, values[2] / 255, values[3] / 255);
}

function toHexByte(value) {
    return Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0').toUpperCase();
}

function toColorByte(value) {
    return Math.max(0, Math.min(255, Math.round(value * 255)));
}

// 与 VSIX 一致：每行只识别第一个 .rgba，并忽略 // 后的内容。
function findRgbaOnLine(vscode, text, line) {
    const commentIndex = text.indexOf('//');
    const codeText = commentIndex >= 0 ? text.slice(0, commentIndex) : text;
    const match = /\.rgba\s+(?<args>[^\r\n\/]*)/.exec(codeText);
    if (!match || !match.groups.args.length) {
        return null;
    }
    const raw = match.groups.args;
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    const color = parseRgbaArguments(vscode, value);
    if (!color) {
        return null;
    }
    const start = match.index + match[0].length - raw.length + leading;
    return {
        value,
        color,
        range: new vscode.Range(line, start, line, start + value.length)
    };
}

function registerColourProvider(vscode, context) {
    const selector = { language: 'darkest-colours' };
    const provider = {
        provideDocumentColors(document) {
            const configuration = vscode.workspace.getConfiguration('darkestDungeon.colours', document.uri);
            if (!configuration.get('enableAutomaticColorPreview', true)) {
                return [];
            }
            const result = [];
            for (let line = 0; line < document.lineCount; line += 1) {
                const found = findRgbaOnLine(vscode, document.lineAt(line).text, line);
                if (found) {
                    result.push(new vscode.ColorInformation(found.range, found.color));
                }
            }
            return result;
        },
        provideColorPresentations(color, contextInfo) {
            const configuration = vscode.workspace.getConfiguration('darkestDungeon.colours', contextInfo.document.uri);
            if (!configuration.get('enableColorPickerOnClick', true)) {
                return [];
            }
            const label = '#' + toHexByte(color.red) + toHexByte(color.green) + toHexByte(color.blue);
            const presentation = new vscode.ColorPresentation(label);
            presentation.textEdit = new vscode.TextEdit(contextInfo.range, label);
            return [presentation];
        }
    };
    const hoverProvider = {
        provideHover(document, position) {
            const configuration = vscode.workspace.getConfiguration('darkestDungeon.colours', document.uri);
            if (!configuration.get('enableAutomaticColorPreview', true)) {
                return null;
            }
            const found = findRgbaOnLine(vscode, document.lineAt(position.line).text, position.line);
            if (!found || position.character < found.range.start.character || position.character > found.range.end.character) {
                return null;
            }
            const color = found.color;
            const rgba = 'RGBA(' + toColorByte(color.red) + ', ' + toColorByte(color.green) + ', ' + toColorByte(color.blue) + ', ' + toColorByte(color.alpha) + ')';
            const canPick = configuration.get('enableColorPickerOnClick', true);
            const message = canPick ? '点击颜色预览可选择颜色并覆写为 #RRGGBB，当前颜色：' + rgba : '当前颜色：' + rgba;
            return new vscode.Hover(message, found.range);
        }
    };
    context.subscriptions.push(vscode.languages.registerColorProvider(selector, provider));
    context.subscriptions.push(vscode.languages.registerHoverProvider(selector, hoverProvider));
}

module.exports = {
    parseRgbaArguments,
    toHexByte,
    toColorByte,
    findRgbaOnLine,
    registerColourProvider
};


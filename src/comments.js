'use strict';

const { ALL_LANGUAGES } = require('./language');

async function toggleLineComments(vscode) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !ALL_LANGUAGES.has(editor.document.languageId)) {
        return;
    }
    const enabled = vscode.workspace.getConfiguration('darkestDungeon').get('enableCtrlSlashToggleComment', true);
    if (!enabled) {
        await vscode.commands.executeCommand('editor.action.commentLine');
        return;
    }

    const lines = new Set();
    for (const selection of editor.selections) {
        let endLine = selection.end.line;
        if (!selection.isEmpty && selection.end.character === 0 && endLine > selection.start.line) {
            endLine -= 1;
        }
        for (let line = selection.start.line; line <= endLine; line += 1) {
            lines.add(line);
        }
    }
    const entries = [...lines].sort((a, b) => a - b).map(line => {
        const text = editor.document.lineAt(line).text;
        const firstNonWhitespace = text.search(/\S/);
        return { line, text, firstNonWhitespace };
    }).filter(entry => entry.firstNonWhitespace >= 0);
    if (!entries.length) {
        return;
    }
    const remove = entries.every(entry => entry.text.slice(entry.firstNonWhitespace).startsWith('//'));
    await editor.edit(editBuilder => {
        for (const entry of entries) {
            const position = new vscode.Position(entry.line, entry.firstNonWhitespace);
            if (remove) {
                editBuilder.delete(new vscode.Range(position, position.translate(0, 2)));
            } else {
                editBuilder.insert(position, '//');
            }
        }
    }, { undoStopBefore: true, undoStopAfter: true });
}

function registerCommentCommand(vscode, context) {
    context.subscriptions.push(vscode.commands.registerCommand('darkestDungeon.toggleLineComment', () => toggleLineComments(vscode)));
}

module.exports = { toggleLineComments, registerCommentCommand };

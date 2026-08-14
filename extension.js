'use strict';

const { registerCompletionProviders } = require('./src/completion');
const { registerCommentCommand } = require('./src/comments');
const { registerColourProvider } = require('./src/colors');
const { registerDiagnostics } = require('./src/diagnostics');
const { registerInfoKeywordDecorations } = require('./src/decorations');

function activate(context) {
    const vscode = require('vscode');
    registerCompletionProviders(vscode, context);
    registerCommentCommand(vscode, context);
    registerColourProvider(vscode, context);
    registerInfoKeywordDecorations(vscode, context);
    const diagnostics = registerDiagnostics(vscode, context);

    context.subscriptions.push(vscode.commands.registerCommand('darkestDungeon.refreshDiagnostics', () => {
        for (const document of vscode.workspace.textDocuments) {
            diagnostics.update(document);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('darkestDungeon')) {
            for (const document of vscode.workspace.textDocuments) {
                diagnostics.update(document);
            }
        }
    }));
}

function deactivate() {}

module.exports = { activate, deactivate };


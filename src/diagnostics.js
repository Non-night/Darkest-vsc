'use strict';

const { EFFECT_LANGUAGE, INFO_LANGUAGES } = require('./language');
const { validateEffectDocument } = require('./diagnostics-effect');
const { validateInfoDocument } = require('./diagnostics-info');

function registerDiagnostics(vscode, context) {
    const collection = vscode.languages.createDiagnosticCollection('Darkest Dungeon');
    const timers = new Map();
    context.subscriptions.push(collection);

    const update = document => {
        if (document.languageId === EFFECT_LANGUAGE) {
            collection.set(document.uri, validateEffectDocument(vscode, document));
        } else if (INFO_LANGUAGES.has(document.languageId)) {
            collection.set(document.uri, validateInfoDocument(vscode, document));
        } else {
            collection.delete(document.uri);
        }
    };

    const schedule = document => {
        if (document.languageId !== EFFECT_LANGUAGE && !INFO_LANGUAGES.has(document.languageId)) {
            return;
        }
        const key = document.uri.toString();
        const current = timers.get(key);
        if (current) {
            clearTimeout(current);
        }
        timers.set(key, setTimeout(() => {
            timers.delete(key);
            update(document);
        }, 250));
    };

    for (const document of vscode.workspace.textDocuments) {
        update(document);
    }
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(update));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => schedule(event.document)));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(update));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => {
        const key = document.uri.toString();
        const timer = timers.get(key);
        if (timer) {
            clearTimeout(timer);
            timers.delete(key);
        }
        collection.delete(document.uri);
    }));
    context.subscriptions.push({ dispose() { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } });

    return { collection, update, schedule };
}

module.exports = { registerDiagnostics };

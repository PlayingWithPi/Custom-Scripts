'use strict';

const vscode = require('vscode');
const path = require('path');
const { homedir } = require('os');
const { readHtml, writeFile, getSettings } = require('./util');

let panel = null;
let selectionHandler = null;
let lastEditorRef = null;
let updateSelectionTimer = null;
let lastSelection = null;

const langMap = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  shellscript: 'sh'
};

const getConfig = () => {
  const editorSettings = getSettings('editor', ['fontLigatures', 'tabSize']);
  const editor = vscode.window.activeTextEditor;
  if (editor) editorSettings.tabSize = editor.options.tabSize;

  const extensionSettings = getSettings('codesnap', [
    'backgroundColor',
    'boxShadow',
    'containerPadding',
    'roundedCorners',
    'showWindowControls',
    'showWindowTitle',
    'showLineNumbers',
    'realLineNumbers',
    'transparentBackground',
    'target',
    'shutterAction'
  ]);

  const selection = editor && editor.selection;
  const startLine = extensionSettings.realLineNumbers
    ? selection
      ? selection.start.line
      : 0
    : 0;

  let windowTitle = '';
  if (editor && extensionSettings.showWindowTitle) {
    const activeFileName = editor.document.uri.path.split('/').pop();
    windowTitle = `${vscode.workspace.name} - ${activeFileName}`;
  }

  return {
    ...editorSettings,
    ...extensionSettings,
    startLine,
    windowTitle
  };
};

const createPanel = async (context) => {
  const newPanel = vscode.window.createWebviewPanel(
    'codesnap',
    'CodeSnap 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );

  newPanel.webview.html = await readHtml(
    path.resolve(context.extensionPath, 'webview/index.html'),
    newPanel
  );

  newPanel.onDidDispose(() => {
    panel = null;

    if (selectionHandler) {
      selectionHandler.dispose();
      selectionHandler = null;
    }

    if (updateSelectionTimer) {
      clearTimeout(updateSelectionTimer);
      updateSelectionTimer = null;
    }

    lastSelection = null;
  });

  return newPanel;
};

const generateFileName = () => {
  const editor = vscode.window.activeTextEditor;

  let lang = 'code';
  if (editor) {
    lang = editor.document.languageId || 'code';
  }

  lang = langMap[lang] || lang;

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now
    .toTimeString()
    .slice(0, 5)
    .replace(':', '-');

  return `codesnap_${lang}_${date}_${time}.png`;
};

const saveImage = async (data) => {
  const fileName = generateFileName();

  const uri = await vscode.window.showSaveDialog({
    filters: { Images: ['png'] },
    defaultUri: vscode.Uri.file(
      path.join(homedir(), 'Desktop', fileName)
    )
  });

  if (uri) {
    await writeFile(uri.fsPath, Buffer.from(data, 'base64'));
  }
};

const hasOneSelection = (selections) =>
  selections && selections.length === 1 && !selections[0].isEmpty;

const refocusEditor = async () => {
  if (!lastEditorRef) return;

  try {
    await vscode.window.showTextDocument(
      lastEditorRef.document,
      lastEditorRef.viewColumn,
      false
    );
  } catch {
    // Ignore if editor/doc vanished
  }
};

const ensurePanel = async (context) => {
  if (!panel) {
    panel = await createPanel(context);

    panel.webview.onDidReceiveMessage(async ({ type, data }) => {
      if (type === 'save') {
        panel.webview.postMessage({ type: 'flash' });
        await saveImage(data);
        await refocusEditor();
      } else if (type === 'copied') {
        await refocusEditor();
      } else if (type === 'error') {
        await refocusEditor();
        vscode.window.showErrorMessage(`CodeSnap 📸: ${data || 'Unknown error'}`);
      } else {
        vscode.window.showErrorMessage(`CodeSnap 📸: Unknown shutterAction "${type}"`);
      }
    });
  }

  return panel;
};

const updatePanel = async (context) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !hasOneSelection(editor.selections)) return;

  lastEditorRef = {
    document: editor.document,
    viewColumn: editor.viewColumn
  };

  const activePanel = await ensurePanel(context);

  // Copy selected code while the editor still owns focus.
  await vscode.commands.executeCommand(
    'editor.action.clipboardCopyWithSyntaxHighlightingAction'
  );

  // Then focus/reveal CodeSnap so the webview can write the image to the clipboard.
  activePanel.reveal(vscode.ViewColumn.Beside, false);

  // Finally ask the webview to redraw and auto-copy.
  await activePanel.webview.postMessage({ type: 'update', ...getConfig() });
};

const runCommand = async (context) => {
  await ensurePanel(context);

  if (!selectionHandler) {
    selectionHandler = vscode.window.onDidChangeTextEditorSelection((e) => {
      const sel = e.selections[0];

      if (!sel || sel.isEmpty) {
        return;
      }

      const key = `${sel.start.line}:${sel.start.character}-${sel.end.line}:${sel.end.character}`;

      if (updateSelectionTimer) {
        clearTimeout(updateSelectionTimer);
        updateSelectionTimer = null;
      }

      const checkSelectionStability = async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !hasOneSelection(editor.selections)) {
          return;
        }

        const currentSel = editor.selections[0];
        if (!currentSel || currentSel.isEmpty) {
          return;
        }

        const currentKey = `${currentSel.start.line}:${currentSel.start.character}-${currentSel.end.line}:${currentSel.end.character}`;

        // If the selection changed since this check started, wait again.
        if (currentKey !== key) {
          return;
        }

        // Ignore duplicate updates for the exact same final selection.
        if (currentKey === lastSelection) {
          return;
        }

        lastSelection = currentKey;

        try {
          await updatePanel(context);
        } catch (err) {
          const message = err?.message || String(err);
          vscode.window.showErrorMessage(`CodeSnap 📸: ${message}`);
        }
      };

      // Small settle delay to approximate "mouse released / selection finished changing"
      updateSelectionTimer = setTimeout(() => {
        checkSelectionStability();
      }, 650);
    });
  }

  await updatePanel(context);
};

module.exports.activate = (context) =>
  context.subscriptions.push(
    vscode.commands.registerCommand('codesnap.start', () => runCommand(context))
  );
import { $, $$, setVar, calcTextWidth } from './util.js';

const snippetNode = $('#snippet');

const isBlankRow = (row) => {
  const text = (row.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .trim();

  return text === '';
};

const trimOuterBlankLines = (node) => {
  const rows = $$(':scope > div', node);

  let start = 0;
  let end = rows.length - 1;

  while (start <= end && isBlankRow(rows[start])) {
    rows[start].remove();
    start++;
  }

  while (end >= start && isBlankRow(rows[end])) {
    rows[end].remove();
    end--;
  }
};

const setupLines = (node, config) => {
  $$(':scope > br', node).forEach((row) => (row.outerHTML = '<div>&nbsp;</div>'));

  trimOuterBlankLines(node);

  const rows = $$(':scope > div', node);
  setVar('line-number-width', calcTextWidth(rows.length + config.startLine));

  rows.forEach((row, idx) => {
    const newRow = document.createElement('div');
    newRow.classList.add('line');
    row.replaceWith(newRow);

    if (config.showLineNumbers) {
      const lineNum = document.createElement('div');
      lineNum.classList.add('line-number');
      lineNum.textContent = idx + 1 + config.startLine;
      newRow.appendChild(lineNum);
    }

    const span = document.createElement('span');
    span.textContent = ' ';
    row.appendChild(span);

    const lineCodeDiv = document.createElement('div');
    lineCodeDiv.classList.add('line-code');
    const lineCode = document.createElement('span');
    lineCode.innerHTML = row.innerHTML;
    lineCodeDiv.appendChild(lineCode);

    newRow.appendChild(lineCodeDiv);
  });
};

const stripInitialIndent = (node) => {
  const regIndent = /^\s+/u;
  const initialSpans = $$(':scope > div > span:first-child', node);

  if (initialSpans.length === 0) return;
  if (initialSpans.some((span) => !regIndent.test(span.textContent))) return;

  const minIndent = Math.min(
    ...initialSpans.map((span) => span.textContent.match(regIndent)[0].length)
  );

  initialSpans.forEach((span) => {
    span.textContent = span.textContent.slice(minIndent);
  });
};

const getClipboardHtml = (clip) => {
  const html = clip.getData('text/html');
  if (html) return html;

  const text = clip
    .getData('text/plain')
    .split('\n')
    .map((line) => `<div>${line}</div>`)
    .join('');

  return `<div>${text}</div>`;
};

export const pasteCode = (config, clipboard) => {
  snippetNode.innerHTML = getClipboardHtml(clipboard);

  const code = $('div', snippetNode);
  if (!code) return;

  snippetNode.style.fontSize = code.style.fontSize;
  snippetNode.style.lineHeight = code.style.lineHeight;
  snippetNode.innerHTML = code.innerHTML;

  stripInitialIndent(snippetNode);
  setupLines(snippetNode, config);
};
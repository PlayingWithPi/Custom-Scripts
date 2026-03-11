import { $, setVar } from './util.js';
import { pasteCode } from './code.js';
import { takeSnap, cameraFlashAnimation } from './snap.js';

const navbarNode = $('#navbar');
const windowControlsNode = $('#window-controls');
const windowTitleNode = $('#window-title');
const btnSave = $('#save');

let config;
let renderToken = 0;

// Manual save/copy with sound
btnSave.addEventListener('click', () => {
  takeSnap({ ...config, playSound: true });
});

// Manual keyboard trigger with sound
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    takeSnap({ ...config, playSound: true });
  }
});

// Keep copy shortcut support inside the webview
document.addEventListener('copy', () => {
  takeSnap({ ...config, shutterAction: 'copy', playSound: false });
});

document.addEventListener('paste', (e) => {
  pasteCode(config, e.clipboardData);
});

window.addEventListener('message', ({ data: { type, ...cfg } }) => {
  if (type === 'update') {
    config = cfg;
    renderToken += 1;
    const currentRenderToken = renderToken;

    const {
      fontLigatures,
      tabSize,
      backgroundColor,
      boxShadow,
      containerPadding,
      roundedCorners,
      showWindowControls,
      showWindowTitle,
      windowTitle
    } = config;

    setVar('ligatures', fontLigatures ? 'normal' : 'none');
    if (typeof fontLigatures === 'string') setVar('font-features', fontLigatures);
    setVar('tab-size', tabSize);
    setVar('container-background-color', backgroundColor);
    setVar('box-shadow', boxShadow);
    setVar('container-padding', containerPadding);
    setVar('window-border-radius', roundedCorners ? '12px' : 0);

    navbarNode.hidden = !showWindowControls && !showWindowTitle;
    windowControlsNode.hidden = !showWindowControls;
    windowTitleNode.hidden = !showWindowTitle;

    windowTitleNode.textContent = windowTitle;

    document.execCommand('paste');

    // The webview must actually be focused for clipboard image write to work reliably.
    btnSave.focus();

    // Auto path: silent, because autoplay policy blocks audio here.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (currentRenderToken !== renderToken) return;
        takeSnap({ ...config, playSound: false });
      });
    });
  } else if (type === 'flash') {
    cameraFlashAnimation();
  }
});
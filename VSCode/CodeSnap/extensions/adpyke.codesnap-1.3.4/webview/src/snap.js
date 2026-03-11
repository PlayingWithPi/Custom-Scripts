import { $, $$, redraw, once, setVar } from './util.js';

const vscode = acquireVsCodeApi();
const windowNode = $('#window');
const snippetContainerNode = $('#snippet-container');
const flashFx = $('#flash-fx');
const shutterSound = $('#shutter-sound');

const SNAP_SCALE = 2;

export const cameraFlashAnimation = async () => {
  flashFx.style.display = 'block';
  redraw(flashFx);
  flashFx.style.opacity = '0';
  await once(flashFx, 'transitionend');
  flashFx.style.display = 'none';
  flashFx.style.opacity = '1';
};

const playShutterSound = async () => {
  if (!shutterSound) return false;

  try {
    shutterSound.pause();
    shutterSound.currentTime = 0;
    shutterSound.volume = 0.65;

    const playPromise = shutterSound.play();
    if (playPromise && typeof playPromise.then === 'function') {
      await playPromise;
    }

    return true;
  } catch (err) {
    console.error('Shutter sound playback failed:', err);
    return false;
  }
};

export const takeSnap = async (config) => {
  if (!config) return;

  windowNode.style.resize = 'none';

  if (config.transparentBackground || config.target === 'window') {
    setVar('container-background-color', 'transparent');
  }

  try {
    const target = config.target === 'container' ? snippetContainerNode : windowNode;

    const url = await domtoimage.toPng(target, {
      bgColor: 'transparent',
      scale: SNAP_SCALE,
      postProcess: (node) => {
        $$('#snippet-container, #snippet, .line, .line-code span', node).forEach(
          (span) => (span.style.width = 'unset')
        );
        $$('.line-code', node).forEach((span) => (span.style.width = '100%'));
      }
    });

    const data = url.slice(url.indexOf(',') + 1);

    if (config.shutterAction === 'copy') {
      const binary = atob(data);
      const array = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([array], { type: 'image/png' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);

      if (config.playSound) {
        await playShutterSound();
      }

      cameraFlashAnimation();
      vscode.postMessage({ type: 'copied' });
    } else {
      if (config.playSound) {
        await playShutterSound();
      }

      vscode.postMessage({ type: config.shutterAction, data });
    }
  } catch (err) {
    const message = err?.message || String(err);
    vscode.postMessage({
      type: 'error',
      data: `Failed to create/copy snapshot: ${message}`
    });
  } finally {
    windowNode.style.resize = 'horizontal';
    setVar('container-background-color', config.backgroundColor);
  }
};
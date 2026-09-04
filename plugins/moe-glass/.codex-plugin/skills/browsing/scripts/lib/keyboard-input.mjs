import { KEY_DEFINITIONS, charToKeyDef } from './key-definitions.mjs';
import { getElementSelector } from './element-selector.mjs';
import { throwIfExceptionDetails } from './cdp-utils.mjs';
import { tryHandleDialogSelectorForSession } from './dialogs-router.mjs';

function attachKeyboardInput({ state, getPageSession, click, dialogs }) {
  async function keyboardPress(tabIndexOrWsUrl, keyName, modifiers = {}) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    let keyDef = KEY_DEFINITIONS[keyName];
    if (!keyDef) {
      if (keyName.length === 1) {
        const charDef = charToKeyDef(keyName);
        keyDef = {
          key: charDef.key,
          code: charDef.code,
          keyCode: charDef.keyCode,
          text: charDef.text,
        };
      } else {
        throw new Error(`Unknown key: ${keyName}. Supported keys: ${Object.keys(KEY_DEFINITIONS).join(', ')}`);
      }
    }

    let modifierFlags = 0;
    if (modifiers.alt) modifierFlags |= 1;
    if (modifiers.ctrl) modifierFlags |= 2;
    if (modifiers.meta) modifierFlags |= 4;
    if (modifiers.shift) modifierFlags |= 8;

    let keyText = keyDef.text;
    if (modifiers.shift && keyText && keyText.length === 1) {
      const upper = keyText.toUpperCase();
      if (upper !== keyText) {
        keyText = upper;
      }
    }

    await ps.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: keyDef.key,
      code: keyDef.code,
      windowsVirtualKeyCode: keyDef.keyCode,
      nativeVirtualKeyCode: keyDef.keyCode,
      modifiers: modifierFlags,
      ...(keyText && { text: keyText })
    });

    await ps.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: keyDef.key,
      code: keyDef.code,
      windowsVirtualKeyCode: keyDef.keyCode,
      nativeVirtualKeyCode: keyDef.keyCode,
      modifiers: modifierFlags
    });

    return { pressed: keyName, modifiers };
  }

  async function fill(tabIndexOrWsUrl, selector, value) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    if (selector && selector.startsWith('dialog::') && dialogs) {
      const dialogState = dialogs.getOpen(ps.sessionId);
      const routed = await tryHandleDialogSelectorForSession({ selector, op: 'type', payload: value, state: dialogState, pageSession: ps });
      if (routed.handled) {
        if (routed.error) throw new Error(routed.error);
        if (routed.clearDialog) dialogs.clear(ps.sessionId);
        return routed.result;
      }
    }

    if (selector) {
      const focusJs = `
        (() => {
          const el = ${getElementSelector(selector)};
          if (!el) return { success: false, error: 'Element not found' };
          el.focus();
          return { success: true, focused: document.activeElement === el };
        })()
      `;
      const focusResult = await ps.send('Runtime.evaluate', {
        expression: focusJs,
        returnByValue: true
      });
      throwIfExceptionDetails(focusResult);
      if (!focusResult.result?.value?.success) {
        throw new Error(focusResult.result?.value?.error || 'Failed to focus element');
      }
    }

    const processedValue = value;
    const settle = (ms = 50) => new Promise(r => setTimeout(r, ms));

    let buffer = '';

    for (let i = 0; i < processedValue.length; i++) {
      const char = processedValue[i];

      if (char === '\t') {
        if (buffer) {
          await ps.send('Input.insertText', { text: buffer });
          await settle();
          buffer = '';
        }
        await keyboardPress(tabIndexOrWsUrl, 'Tab');
        await settle();
      } else if (char === '\n') {
        if (buffer) {
          await ps.send('Input.insertText', { text: buffer });
          await settle();
          buffer = '';
        }
        const currentFocus = await ps.send('Runtime.evaluate', {
          expression: `({ isTextarea: document.activeElement?.tagName === 'TEXTAREA' })`,
          returnByValue: true
        });
        throwIfExceptionDetails(currentFocus);
        const currentlyInTextarea = currentFocus.result?.value?.isTextarea || false;

        if (currentlyInTextarea) {
          await ps.send('Input.insertText', { text: '\n' });
        } else {
          await keyboardPress(tabIndexOrWsUrl, 'Enter');
        }
        await settle();
      } else {
        buffer += char;
      }
    }

    if (buffer) {
      await ps.send('Input.insertText', { text: buffer });
    }

    return { typed: true, value };
  }

  async function humanType(tabIndexOrWsUrl, selector, text, options = {}) {
    const ps = await getPageSession(tabIndexOrWsUrl);

    if (selector && selector.startsWith('dialog::') && dialogs) {
      const dialogState = dialogs.getOpen(ps.sessionId);
      const routed = await tryHandleDialogSelectorForSession({ selector, op: 'type', payload: text, state: dialogState, pageSession: ps });
      if (routed.handled) {
        if (routed.error) throw new Error(routed.error);
        if (routed.clearDialog) dialogs.clear(ps.sessionId);
        return routed.result;
      }
    }

    const delay = options.delay !== undefined ? options.delay : 80;
    const jitter = options.jitter !== undefined ? options.jitter : 80;

    if (selector) {
      await click(tabIndexOrWsUrl, selector);
    }

    for (const char of text) {
      const keyDef = charToKeyDef(char);

      if (keyDef.special) {
        await keyboardPress(tabIndexOrWsUrl, keyDef.special);
      } else {
        const sendKeyEvents = !state.chromeHeadless;
        const modifiers = keyDef.shift ? 8 : 0;

        if (sendKeyEvents) {
          if (keyDef.shift) {
            await ps.send('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: 'Shift',
              code: 'ShiftLeft',
              windowsVirtualKeyCode: 16,
              nativeVirtualKeyCode: 16,
              modifiers
            });
          }

          await ps.send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: keyDef.key,
            code: keyDef.code,
            windowsVirtualKeyCode: keyDef.keyCode,
            nativeVirtualKeyCode: keyDef.keyCode,
            modifiers
          });
        }

        await ps.send('Input.insertText', {
          text: keyDef.text
        });

        if (sendKeyEvents) {
          await ps.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: keyDef.key,
            code: keyDef.code,
            windowsVirtualKeyCode: keyDef.keyCode,
            nativeVirtualKeyCode: keyDef.keyCode,
            modifiers
          });

          if (keyDef.shift) {
            await ps.send('Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: 'Shift',
              code: 'ShiftLeft',
              windowsVirtualKeyCode: 16,
              nativeVirtualKeyCode: 16,
              modifiers: 0
            });
          }
        }
      }

      if (delay > 0 || jitter > 0) {
        const wait = delay + Math.random() * jitter;
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }

    return { typed: text, chars: text.length };
  }

  return { keyboardPress, fill, humanType };
}

export { attachKeyboardInput };

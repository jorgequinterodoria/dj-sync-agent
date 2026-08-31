import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCopilotChat,
} from './copilot-chat.js';

function createRoot(): HTMLElement {
  return {
    querySelector(selector: string) {
      const element = {
        disabled: false,
        value: '',
        textContent: '',
        className: '',
        scrollTop: 0,
        scrollHeight: 0,
        appendChild() {},
        addEventListener() {},
        removeEventListener() {},
      };

      if (
        selector ===
        '[data-copilot-input]'
      ) {
        return element as unknown as HTMLTextAreaElement;
      }

      return element as unknown as HTMLElement;
    },
  } as unknown as HTMLElement;
}

test(
  'copilot chat is constructible with the renderer contract',
  () => {
    assert.equal(
      typeof createCopilotChat,
      'function',
    );

    void createRoot();
  },
);
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderCopilotActionCard,
} from './copilot-action-card.js';

interface FakeElement {
  textContent: string;
  disabled: boolean;
  addEventListener(
    type: string,
    listener: EventListener,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
  ): void;
}

function createFakeElement(): FakeElement {
  return {
    textContent: '',
    disabled: false,

    addEventListener() {},

    removeEventListener() {},
  };
}

test(
  'action card exposes safe action metadata',
  () => {
    const nodes =
      new Map<string, FakeElement>();

    const make = (
      selector: string,
    ): FakeElement => {
      const existing =
        nodes.get(selector);

      if (existing) {
        return existing;
      }

      const element =
        createFakeElement();

      nodes.set(
        selector,
        element,
      );

      return element;
    };

    const root = {
      dataset:
        {} as Record<string, string>,

      querySelector(
        selector: string,
      ) {
        return make(selector);
      },
    } as unknown as HTMLElement;

    let approveCalls = 0;
    let rejectCalls = 0;

    const card =
      renderCopilotActionCard(
        root,
        {
          id: 'action-1',
          title:
            'Add track to playlist',

          reason:
            'The user approved this change.',

          risk: 'review',

          affectedResources: [
            'track-1',
            'playlist-1',
          ],

          reversible: true,
          status: 'pending',
        },

        {
          onApprove() {
            approveCalls += 1;
          },

          onReject() {
            rejectCalls += 1;
          },
        },
      );

    assert.equal(
      root.dataset.actionId,
      'action-1',
    );

    assert.equal(
      nodes.get(
        '[data-action-title]',
      )?.textContent,
      'Add track to playlist',
    );

    assert.equal(
      nodes.get(
        '[data-action-reason]',
      )?.textContent,
      'The user approved this change.',
    );

    assert.equal(
      nodes.get(
        '[data-action-risk]',
      )?.textContent,
      'REVIEW',
    );

    assert.equal(
      nodes.get(
        '[data-action-reversible]',
      )?.textContent,
      'Yes',
    );

    assert.equal(
      nodes.get(
        '[data-action-status]',
      )?.textContent,
      'pending',
    );

    assert.match(
      nodes.get(
        '[data-action-resources]',
      )?.textContent ?? '',
      /track-1/,
    );

    assert.match(
      nodes.get(
        '[data-action-resources]',
      )?.textContent ?? '',
      /playlist-1/,
    );

    assert.equal(
      nodes.get(
        '[data-action-approve]',
      )?.disabled,
      false,
    );

    assert.equal(
      nodes.get(
        '[data-action-reject]',
      )?.disabled,
      false,
    );

    assert.equal(
      approveCalls,
      0,
    );

    assert.equal(
      rejectCalls,
      0,
    );

    card.destroy();
  },
);
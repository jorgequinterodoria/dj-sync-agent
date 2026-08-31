import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateToolPlan,
} from './plan-validator.js';

import type {
  ToolPlan,
} from '../agent/tool-plan.js';

function createReadPlan(): ToolPlan {
  return {
    schemaVersion: 1,
    requiresApproval: false,
    steps: [
      {
        id: 'search',
        tool: 'library.search',
        arguments: {
          text: 'house',
        },
        reason:
          'Find candidate tracks.',
        dependsOn: [],
        risk: 'read',
      },
    ],
  };
}

test(
  'plan validator accepts a valid read plan',
  () => {
    const result =
      validateToolPlan(
        createReadPlan(),
        {
          availableTools:
            new Set([
              'library.search',
            ]),
        },
      );

    assert.equal(
      result.valid,
      true,
    );

    assert.deepEqual(
      result.errors,
      [],
    );
  },
);

test(
  'plan validator rejects unknown tools',
  () => {
    const result =
      validateToolPlan(
        createReadPlan(),
        {
          availableTools:
            new Set(),
        },
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.errors.some(
        (error) =>
          /Unknown tool/.test(
            error,
          ),
      ),
    );
  },
);

test(
  'plan validator rejects write without approval',
  () => {
    const writePlan: ToolPlan = {
      schemaVersion: 1,
      requiresApproval: true,
      steps: [
        {
          id: 'modify',
          tool: 'playlist.modify',
          arguments: {},
          reason:
            'Apply the requested change.',
          dependsOn: [],
          risk: 'write',
        },
      ],
    };

    const result =
      validateToolPlan(
        writePlan,
        {
          availableTools:
            new Set([
              'playlist.modify',
            ]),
        },
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.errors.some(
        (error) =>
          /requires approval/i.test(
            error,
          ),
      ),
    );
  },
);

test(
  'plan validator accepts approved write plan',
  () => {
    const writePlan: ToolPlan = {
      schemaVersion: 1,
      requiresApproval: true,
      steps: [
        {
          id: 'modify',
          tool: 'playlist.modify',
          arguments: {},
          reason:
            'Apply the user-approved change.',
          dependsOn: [],
          risk: 'write',
        },
      ],
    };

    const result =
      validateToolPlan(
        writePlan,
        {
          availableTools:
            new Set([
              'playlist.modify',
            ]),
          approvalGranted: true,
        },
      );

    assert.equal(
      result.valid,
      true,
    );

    assert.deepEqual(
      result.errors,
      [],
    );
  },
);

test(
  'plan validator rejects self dependencies',
  () => {
    const selfPlan: ToolPlan = {
      schemaVersion: 1,
      requiresApproval: false,
      steps: [
        {
          id: 'search',
          tool: 'library.search',
          arguments: {
            text: 'house',
          },
          reason:
            'Find candidates.',
          dependsOn: ['search'],
          risk: 'read',
        },
      ],
    };

    const result =
      validateToolPlan(
        selfPlan,
        {
          availableTools:
            new Set([
              'library.search',
            ]),
        },
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.errors.some(
        (error) =>
          /cannot depend on itself/i.test(
            error,
          ),
      ),
    );
  },
);

test(
  'plan validator detects dependency cycles',
  () => {
    const cyclePlan: ToolPlan = {
      schemaVersion: 1,
      requiresApproval: false,
      steps: [
        {
          id: 'a',
          tool: 'library.search',
          arguments: {},
          reason: 'Search.',
          dependsOn: ['b'],
          risk: 'read',
        },
        {
          id: 'b',
          tool: 'history.get',
          arguments: {},
          reason: 'Read history.',
          dependsOn: ['a'],
          risk: 'read',
        },
      ],
    };

    const result =
      validateToolPlan(
        cyclePlan,
        {
          availableTools:
            new Set([
              'library.search',
              'history.get',
            ]),
        },
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.errors.some(
        (error) =>
          /future step|cycle/i.test(
            error,
          ),
      ),
    );
  },
);
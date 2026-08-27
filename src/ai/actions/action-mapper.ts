import {
  validateDJAction,
} from './action-types.js';

import type {
  DJAction,
  ValidatedDJAction,
} from './action-types.js';

export interface ActionMapper {
  validate(
    action: unknown,
  ): ValidatedDJAction;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null
  );
}

export function createActionMapper(): ActionMapper {
  return {
    validate(action) {
      if (!isRecord(action)) {
        throw new Error(
          'DJ action must be an object.',
        );
      }

      if (
        typeof action.type !==
        'string'
      ) {
        throw new Error(
          'DJ action type is required.',
        );
      }

      return validateDJAction(
        action as unknown as DJAction,
      );
    },
  };
}
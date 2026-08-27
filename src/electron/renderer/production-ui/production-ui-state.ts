import type {
  ProductionActivityItem,
  ProductionActionPreview,
  ProductionConnectionState,
  ProductionCopilotMessage,
  ProductionCopilotState,
  ProductionSyncState,
  ProductionTrack,
  ProductionUiSnapshot,
} from './production-ui-types.js';

export type ProductionUiAction =
  | {
      readonly type:
        'connection.set';
      readonly value:
        ProductionConnectionState;
    }
  | {
      readonly type:
        'sync.set';
      readonly value:
        ProductionSyncState;
      readonly detail:
        string;
    }
  | {
      readonly type:
        'track.set';
      readonly value:
        ProductionTrack | null;
    }
  | {
      readonly type:
        'copilot.set';
      readonly value:
        ProductionCopilotState;
    }
  | {
      readonly type:
        'message.add';
      readonly value:
        ProductionCopilotMessage;
    }
  | {
      readonly type:
        'messages.replace';
      readonly value:
        readonly ProductionCopilotMessage[];
    }
  | {
      readonly type:
        'action.set';
      readonly value:
        ProductionActionPreview | null;
    }
  | {
      readonly type:
        'activity.add';
      readonly value:
        ProductionActivityItem;
    }
  | {
      readonly type:
        'error.set';
      readonly value:
        string | null;
    }
  | {
      readonly type:
        'busy.set';
      readonly value:
        boolean;
    };

export function reduceProductionUiState(
  state: ProductionUiSnapshot,
  action: ProductionUiAction,
): ProductionUiSnapshot {
  switch (action.type) {
    case 'connection.set':
      return {
        ...state,
        connection:
          action.value,
      };

    case 'sync.set':
      return {
        ...state,
        sync:
          action.value,
        syncDetail:
          action.detail,
      };

    case 'track.set':
      return {
        ...state,
        track:
          action.value,
      };

    case 'copilot.set':
      return {
        ...state,
        copilot:
          action.value,
      };

    case 'message.add':
      return {
        ...state,
        copilotMessages: [
          ...state.copilotMessages,
          action.value,
        ],
      };

    case 'messages.replace':
      return {
        ...state,
        copilotMessages: [
          ...action.value,
        ],
      };

    case 'action.set':
      return {
        ...state,
        pendingAction:
          action.value,
      };

    case 'activity.add':
      return {
        ...state,
        activities: [
          ...state.activities,
          action.value,
        ].slice(-100),
      };

    case 'error.set':
      return {
        ...state,
        error:
          action.value,
      };

    case 'busy.set':
      return {
        ...state,
        busy:
          action.value,
      };
  }
}

export function createInitialProductionUiSnapshot():
  ProductionUiSnapshot {
  return {
    connection:
      'connecting',

    sync:
      'idle',

    syncDetail:
      'Waiting for the synchronization service.',

    track:
      null,

    copilot:
      'idle',

    copilotMessages: [],

    pendingAction:
      null,

    activities: [],

    error:
      null,

    busy:
      false,
  };
}

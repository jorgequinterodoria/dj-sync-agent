export type ProductionConnectionState =
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'disconnected';

export type ProductionCopilotState =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'error';

export type ProductionSyncState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface ProductionTrack {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album?: string | null;
  readonly bpm?: number | null;
  readonly key?: string | null;
  readonly artworkUrl?: string | null;
}

export interface ProductionActivityItem {
  readonly id: string;
  readonly timestamp: string;
  readonly label: string;
  readonly detail?: string | null;
  readonly status:
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
}

export interface ProductionCopilotMessage {
  readonly id: string;
  readonly role:
    | 'user'
    | 'assistant'
    | 'system';
  readonly content: string;
  readonly createdAt: string;
}

export interface ProductionActionPreview {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly risk:
    | 'write'
    | 'review';
  readonly affectedResources:
    readonly string[];
  readonly reversible: boolean;
  readonly status:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'executed'
    | 'failed';
}

export interface ProductionUiSnapshot {
  readonly connection:
    ProductionConnectionState;

  readonly sync:
    ProductionSyncState;

  readonly syncDetail:
    string;

  readonly track:
    ProductionTrack | null;

  readonly copilot:
    ProductionCopilotState;

  readonly copilotMessages:
    readonly ProductionCopilotMessage[];

  readonly pendingAction:
    ProductionActionPreview | null;

  readonly activities:
    readonly ProductionActivityItem[];

  readonly error:
    string | null;

  readonly busy:
    boolean;
}

export interface ProductionUiCallbacks {
  readonly onSendMessage:
    (message: string) =>
      Promise<void>;

  readonly onApproveAction:
    (actionId: string) =>
      Promise<void>;

  readonly onRejectAction:
    (actionId: string) =>
      Promise<void>;

  readonly onStartSync:
    () => Promise<void>;

  readonly onStopSync:
    () => Promise<void>;

  readonly onRefresh:
    () => Promise<void>;
}

export interface ProductionUiMountOptions {
  readonly root:
    HTMLElement;

  readonly callbacks:
    ProductionUiCallbacks;

  readonly initial:
    ProductionUiSnapshot;
}

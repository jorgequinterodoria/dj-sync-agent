import { redactSecrets } from '../../security/secret-redactor.js';

export type ActionAuditEvent =
  | 'requested'
  | 'previewed'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'expired';

export interface ActionAuditRecord {
  readonly event: ActionAuditEvent;
  readonly actionId: string;
  readonly approvalId?: string;
  readonly deviceId: string;
  readonly requestId: string;
  readonly timestamp: string;
  readonly result?: unknown;
}

export interface ActionAudit {
  append(record: ActionAuditRecord): void;
  list(): readonly ActionAuditRecord[];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Action audit ${field} is required.`);
  return normalized;
}

export class InMemoryActionAudit implements ActionAudit {
  private readonly records: ActionAuditRecord[] = [];

  public append(record: ActionAuditRecord): void {
    const safe = redactSecrets(record) as ActionAuditRecord;
    this.records.push({
      ...safe,
      actionId: required(safe.actionId, 'action id'),
      deviceId: required(safe.deviceId, 'device id'),
      requestId: required(safe.requestId, 'request id'),
      timestamp: required(safe.timestamp, 'timestamp'),
    });
  }

  public list(): readonly ActionAuditRecord[] {
    return this.records.map((record) => ({ ...record }));
  }
}

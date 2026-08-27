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

function required(
  value: string,
  field: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      `Action audit ${field} is required.`,
    );
  }

  return normalized;
}

export class InMemoryActionAudit
  implements ActionAudit {
  private readonly records: ActionAuditRecord[] =
    [];

  public append(
    record: ActionAuditRecord,
  ): void {
    this.records.push({
      ...record,
      actionId:
        required(
          record.actionId,
          'action id',
        ),
      deviceId:
        required(
          record.deviceId,
          'device id',
        ),
      requestId:
        required(
          record.requestId,
          'request id',
        ),
      timestamp:
        required(
          record.timestamp,
          'timestamp',
        ),
    });
  }

  public list():
    readonly ActionAuditRecord[] {
    return this.records.map(
      (record) => ({
        ...record,
      }),
    );
  }
}

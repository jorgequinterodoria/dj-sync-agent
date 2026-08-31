export interface DJSyncActionAuditRecord {
  readonly actionId: string;
  readonly approvalId?: string;
  readonly deviceId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly actionHash: string;
  readonly status:
    | 'requested'
    | 'previewed'
    | 'approved'
    | 'rejected'
    | 'executed'
    | 'failed'
    | 'expired';
  readonly timestamp: string;
  readonly error?: string;
  readonly resultMetadata?: unknown;
}

export interface DJSyncAuditRepository {
  append(
    record: DJSyncActionAuditRecord,
  ): Promise<void>;

  list(
    input: {
      readonly deviceId: string;
      readonly limit?: number;
    },
  ): Promise<
    readonly DJSyncActionAuditRecord[]
  >;
}

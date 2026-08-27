import {
  hashActionPreview,
} from './action-preview.js';

import type {
  ActionPreview,
} from './action-preview.js';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired';

export interface ApprovalDecision {
  readonly status: ApprovalStatus;
  readonly approvalId: string;
  readonly previewId: string;
  readonly actionHash: string;
  readonly deviceId: string;
  readonly requestId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly token?: string;
}

export interface ApprovalGateRequest {
  readonly preview: ActionPreview;
  readonly deviceId: string;
  readonly requestId: string;
  readonly now: string;
  readonly ttlMs?: number;
}

export interface ApprovalGate {
  request(
    input: ApprovalGateRequest,
  ): ApprovalDecision;

  approve(
    approvalId: string,
  ): ApprovalDecision;

  reject(
    approvalId: string,
  ): ApprovalDecision;

  consume(
    input: {
      readonly approvalId: string;
      readonly token: string;
      readonly preview: ActionPreview;
      readonly deviceId: string;
      readonly requestId: string;
      readonly now: string;
    },
  ): ApprovalDecision;

  get(
    approvalId: string,
  ): ApprovalDecision | undefined;
}

interface InternalApproval
  extends ApprovalDecision {
  readonly consumed: boolean;
}

function required(
  value: string,
  name: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return normalized;
}

function parseTime(
  value: string,
): number {
  const timestamp =
    Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(
      'Invalid approval timestamp.',
    );
  }

  return timestamp;
}

function randomToken(): string {
  return [
    Math.random()
      .toString(36)
      .slice(2),

    Math.random()
      .toString(36)
      .slice(2),
  ].join('');
}

export class InMemoryApprovalGate
  implements ApprovalGate {
  private readonly approvals =
    new Map<string, InternalApproval>();

  public request(
    input: ApprovalGateRequest,
  ): ApprovalDecision {
    const deviceId =
      required(
        input.deviceId,
        'Approval device id',
      );

    const requestId =
      required(
        input.requestId,
        'Approval request id',
      );

    const now =
      parseTime(input.now);

    const ttlMs =
      input.ttlMs ?? 5 * 60_000;

    if (
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0
    ) {
      throw new Error(
        'Approval TTL must be positive.',
      );
    }

    const approvalId =
      randomToken();

    const decision: InternalApproval = {
      status: 'pending',
      approvalId,
      previewId:
        input.preview.id,
      actionHash:
        hashActionPreview(
          input.preview,
        ),
      deviceId,
      requestId,
      issuedAt:
        new Date(now)
          .toISOString(),
      expiresAt:
        new Date(
          now + ttlMs,
        ).toISOString(),
      token:
        randomToken(),
      consumed: false,
    };

    this.approvals.set(
      approvalId,
      decision,
    );

    return this.publicDecision(
      decision,
    );
  }

  public approve(
    approvalId: string,
  ): ApprovalDecision {
    const current =
      this.requireApproval(
        approvalId,
      );

    if (
      current.status !== 'pending'
    ) {
      return this.publicDecision(
        current,
      );
    }

    const updated: InternalApproval = {
      ...current,
      status: 'approved',
    };

    this.approvals.set(
      approvalId,
      updated,
    );

    return this.publicDecision(
      updated,
    );
  }

  public reject(
    approvalId: string,
  ): ApprovalDecision {
    const current =
      this.requireApproval(
        approvalId,
      );

    if (
      current.status !== 'pending'
    ) {
      return this.publicDecision(
        current,
      );
    }

    const updated: InternalApproval = {
      ...current,
      status: 'rejected',
    };

    this.approvals.set(
      approvalId,
      updated,
    );

    return this.publicDecision(
      updated,
    );
  }

  public consume(
    input: {
      readonly approvalId: string;
      readonly token: string;
      readonly preview: ActionPreview;
      readonly deviceId: string;
      readonly requestId: string;
      readonly now: string;
    },
  ): ApprovalDecision {
    const current =
      this.requireApproval(
        input.approvalId,
      );

    const now =
      parseTime(input.now);

    if (
      parseTime(
        current.expiresAt,
      ) <= now
    ) {
      const expired: InternalApproval = {
        ...current,
        status: 'expired',
      };

      this.approvals.set(
        input.approvalId,
        expired,
      );

      throw new Error(
        'Approval has expired.',
      );
    }

    if (
      current.status !== 'approved'
    ) {
      throw new Error(
        `Approval is not executable: ${current.status}.`,
      );
    }

    if (current.consumed) {
      throw new Error(
        'Approval has already been consumed.',
      );
    }

    if (
      current.token !==
      input.token
    ) {
      throw new Error(
        'Approval token is invalid.',
      );
    }

    if (
      current.deviceId !==
      required(
        input.deviceId,
        'Approval device id',
      )
    ) {
      throw new Error(
        'Approval device mismatch.',
      );
    }

    if (
      current.requestId !==
      required(
        input.requestId,
        'Approval request id',
      )
    ) {
      throw new Error(
        'Approval request mismatch.',
      );
    }

    if (
      current.previewId !==
      input.preview.id
    ) {
      throw new Error(
        'Approval preview mismatch.',
      );
    }

    if (
      current.actionHash !==
      hashActionPreview(
        input.preview,
      )
    ) {
      throw new Error(
        'Approval action hash mismatch.',
      );
    }

    const updated: InternalApproval = {
      ...current,
      consumed: true,
    };

    this.approvals.set(
      input.approvalId,
      updated,
    );

    return this.publicDecision(
      updated,
    );
  }

  public get(
    approvalId: string,
  ): ApprovalDecision | undefined {
    const current =
      this.approvals.get(
        approvalId,
      );

    return current === undefined
      ? undefined
      : this.publicDecision(
          current,
        );
  }

  private requireApproval(
    approvalId: string,
  ): InternalApproval {
    const normalized =
      required(
        approvalId,
        'Approval id',
      );

    const approval =
      this.approvals.get(
        normalized,
      );

    if (!approval) {
      throw new Error(
        'Approval not found.',
      );
    }

    return approval;
  }

  private publicDecision(
    approval: InternalApproval,
  ): ApprovalDecision {
    return {
      status:
        approval.status,
      approvalId:
        approval.approvalId,
      previewId:
        approval.previewId,
      actionHash:
        approval.actionHash,
      deviceId:
        approval.deviceId,
      requestId:
        approval.requestId,
      issuedAt:
        approval.issuedAt,
      expiresAt:
        approval.expiresAt,
      ...(approval.status ===
        'approved'
        ? {
            token:
              approval.token,
          }
        : {}),
    };
  }
}

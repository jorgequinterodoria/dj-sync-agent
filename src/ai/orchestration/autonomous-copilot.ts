import type { CopilotContext } from '../context/copilot-context-types.js';
import type { ToolPlan, ToolPlanStep } from '../agent/tool-plan.js';
import type { ActionPreview } from '../actions/action-preview.js';
import type { ApprovalDecision } from '../actions/approval-gate.js';
import type { ValidatedDJAction } from '../actions/action-types.js';

export type AutonomousCopilotStatus =
  | 'planning'
  | 'executing'
  | 'awaiting_approval'
  | 'replanning'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface AutonomousCopilotRequest {
  readonly requestId: string;
  readonly deviceId: string;
  readonly userMessage: string;
  readonly currentTrackId?: string;
  readonly signal?: AbortSignal;
}

export interface AutonomousCopilotContextProvider {
  build(input: {
    readonly userMessage: string;
    readonly currentTrackId?: string;
    readonly signal: AbortSignal;
  }): Promise<CopilotContext>;
}

export interface AutonomousCopilotPlanner {
  plan(input: { readonly request: AutonomousCopilotRequest; readonly context: CopilotContext; readonly signal: AbortSignal }): Promise<ToolPlan>;
  replan?(input: { readonly request: AutonomousCopilotRequest; readonly context: CopilotContext; readonly previousPlan: ToolPlan; readonly failedStep: ToolPlanStep; readonly signal: AbortSignal }): Promise<ToolPlan | null>;
}

export interface AutonomousReadToolExecutor {
  execute(input: { readonly tool: string; readonly arguments: unknown; readonly requestId: string; readonly deviceId: string; readonly signal: AbortSignal }): Promise<unknown>;
}

export interface AutonomousActionPort {
  prepare(input: { readonly action: ValidatedDJAction; readonly reason: string; readonly deviceId: string; readonly requestId: string }): { readonly preview: ActionPreview; readonly approval: ApprovalDecision };
  approve(approvalId: string): ApprovalDecision;
  reject(approvalId: string): ApprovalDecision;
  execute(input: { readonly preview: ActionPreview; readonly approvalId: string; readonly token: string; readonly deviceId: string; readonly requestId: string }): Promise<unknown>;
}

export interface AutonomousActionMapper {
  validate(action: unknown): ValidatedDJAction;
}

export interface AutonomousAuthorization {
  assertAllowed(input: {
    readonly toolName: string;
    readonly risk: 'read' | 'write' | 'review' | 'execute';
    readonly deviceId: string;
    readonly requestId: string;
    readonly actionType?: string;
  }): void;
}

export interface PendingAutonomousAction {
  readonly stepId: string;
  readonly preview: ActionPreview;
  readonly approval: ApprovalDecision;
}

export interface AutonomousCopilotState {
  readonly requestId: string;
  readonly deviceId: string;
  readonly status: AutonomousCopilotStatus;
  readonly completedStepIds: readonly string[];
  readonly pendingApprovalId?: string;
  readonly pendingActionStepId?: string;
  readonly results: readonly unknown[];
  readonly error?: string;
  readonly replans: number;
  readonly toolCalls: number;
}

export interface AutonomousCopilotResult {
  readonly status: AutonomousCopilotStatus;
  readonly response: string;
  readonly context: CopilotContext;
  readonly plan: ToolPlan;
  readonly state: AutonomousCopilotState;
  readonly pendingAction?: PendingAutonomousAction;
}

export interface AutonomousCopilotOptions {
  readonly contextProvider: AutonomousCopilotContextProvider;
  readonly planner: AutonomousCopilotPlanner;
  readonly reads: AutonomousReadToolExecutor;
  readonly actionMapper: AutonomousActionMapper;
  readonly actions: AutonomousActionPort;
  readonly authorization?: AutonomousAuthorization;
  readonly maxReplans?: number;
  readonly maxToolCalls?: number;
  readonly maxAttemptsPerStep?: number;
}

interface MutableState {
  status: AutonomousCopilotStatus;
  readonly completed: Set<string>;
  readonly results: unknown[];
  pendingApprovalId: string | undefined;
  pendingActionStepId: string | undefined;
  error: string | undefined;
  replans: number;
  toolCalls: number;
  readonly attempts: Map<string, number>;
}

interface PendingSession {
  readonly request: AutonomousCopilotRequest;
  readonly context: CopilotContext;
  plan: ToolPlan;
  readonly state: MutableState;
  pendingAction: PendingAutonomousAction;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function signalOf(signal: AbortSignal | undefined): AbortSignal {
  return signal ?? new AbortController().signal;
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Autonomous Copilot request was cancelled.');
}

function snapshot(state: MutableState, requestId: string, deviceId: string): AutonomousCopilotState {
  return {
    requestId,
    deviceId,
    status: state.status,
    completedStepIds: [...state.completed],
    ...(state.pendingApprovalId !== undefined ? { pendingApprovalId: state.pendingApprovalId } : {}),
    ...(state.pendingActionStepId !== undefined ? { pendingActionStepId: state.pendingActionStepId } : {}),
    results: [...state.results],
    ...(state.error !== undefined ? { error: state.error } : {}),
    replans: state.replans,
    toolCalls: state.toolCalls,
  };
}

function riskOf(step: ToolPlanStep): 'read' | 'write' | 'review' {
  return step.risk;
}

export class AutonomousCopilot {
  private readonly options: AutonomousCopilotOptions;
  private readonly maxReplans: number;
  private readonly maxToolCalls: number;
  private readonly maxAttemptsPerStep: number;
  private readonly activeRequests = new Set<string>();
  private readonly pendingRequests = new Map<string, PendingSession>();

  public constructor(options: AutonomousCopilotOptions) {
    this.options = options;
    this.maxReplans = options.maxReplans ?? 2;
    this.maxToolCalls = options.maxToolCalls ?? 16;
    this.maxAttemptsPerStep = options.maxAttemptsPerStep ?? 2;

    if (!Number.isInteger(this.maxReplans) || this.maxReplans < 0) throw new Error('Autonomous Copilot maxReplans must be a non-negative integer.');
    if (!Number.isInteger(this.maxToolCalls) || this.maxToolCalls < 1) throw new Error('Autonomous Copilot maxToolCalls must be a positive integer.');
    if (!Number.isInteger(this.maxAttemptsPerStep) || this.maxAttemptsPerStep < 1) throw new Error('Autonomous Copilot maxAttemptsPerStep must be a positive integer.');
  }

  public async run(request: AutonomousCopilotRequest): Promise<AutonomousCopilotResult> {
    const normalized: AutonomousCopilotRequest = {
      ...request,
      requestId: required(request.requestId, 'Autonomous Copilot request id'),
      deviceId: required(request.deviceId, 'Autonomous Copilot device id'),
      userMessage: required(request.userMessage, 'Autonomous Copilot user message'),
    };
    const signal = signalOf(request.signal);
    const requestId = normalized.requestId;

    if (this.activeRequests.has(requestId) || this.pendingRequests.has(requestId)) {
      throw new Error(`Autonomous Copilot request is already active or awaiting approval: ${requestId}`);
    }

    this.activeRequests.add(requestId);
    let suspended = false;

    try {
      throwIfCancelled(signal);
      const state: MutableState = {
        status: 'planning',
        completed: new Set<string>(),
        results: [],
        pendingApprovalId: undefined,
        pendingActionStepId: undefined,
        error: undefined,
        replans: 0,
        toolCalls: 0,
        attempts: new Map<string, number>(),
      };

      const context = await this.options.contextProvider.build({
        userMessage: normalized.userMessage,
        ...(normalized.currentTrackId !== undefined ? { currentTrackId: normalized.currentTrackId } : {}),
        signal,
      });
      throwIfCancelled(signal);

      let plan = await this.options.planner.plan({
        request: normalized,
        context,
        signal,
      });
      throwIfCancelled(signal);

      while (true) {
        const execution = await this.executePlan({ request: normalized, context, plan, state, signal });

        if (execution.pendingAction) {
          const session: PendingSession = {
            request: normalized,
            context,
            plan,
            state,
            pendingAction: execution.pendingAction,
          };
          this.pendingRequests.set(requestId, session);
          suspended = true;
          return {
            status: 'awaiting_approval',
            response: 'Approval is required before the proposed DJ action can execute.',
            context,
            plan,
            state: snapshot(state, requestId, normalized.deviceId),
            pendingAction: execution.pendingAction,
          };
        }

        if (!execution.failedStep) {
          state.status = 'completed';
          return {
            status: 'completed',
            response: `Autonomous Copilot completed ${state.completed.size} executed step${state.completed.size === 1 ? '' : 's'}.`,
            context,
            plan,
            state: snapshot(state, requestId, normalized.deviceId),
          };
        }

        if (!this.options.planner.replan || state.replans >= this.maxReplans) {
          state.status = 'failed';
          state.error = execution.failedStep.error;
          return {
            status: 'failed',
            response: `Autonomous Copilot stopped: ${state.error}`,
            context,
            plan,
            state: snapshot(state, requestId, normalized.deviceId),
          };
        }

        state.status = 'replanning';
        const nextPlan = await this.options.planner.replan({
          request: normalized,
          context,
          previousPlan: plan,
          failedStep: execution.failedStep.step,
          signal,
        });
        throwIfCancelled(signal);

        if (!nextPlan) {
          state.status = 'failed';
          state.error = execution.failedStep.error;
          return {
            status: 'failed',
            response: `Autonomous Copilot stopped: ${state.error}`,
            context,
            plan,
            state: snapshot(state, requestId, normalized.deviceId),
          };
        }

        state.replans += 1;
        plan = nextPlan;
      }
    } finally {
      this.activeRequests.delete(requestId);
      if (!suspended) this.pendingRequests.delete(requestId);
    }
  }

  public async approveAndResume(input: {
    readonly request: AutonomousCopilotRequest;
    readonly pendingAction: PendingAutonomousAction;
    readonly signal?: AbortSignal;
  }): Promise<AutonomousCopilotResult> {
    const requestId = required(input.request.requestId, 'Autonomous Copilot request id');
    const deviceId = required(input.request.deviceId, 'Autonomous Copilot device id');
    const session = this.pendingRequests.get(requestId);
    if (!session) throw new Error('No pending approval exists for this request.');

    if (session.request.deviceId !== deviceId) throw new Error('Pending approval device mismatch.');
    if (session.pendingAction.stepId !== input.pendingAction.stepId) throw new Error('Pending action step mismatch.');
    if (session.pendingAction.preview.id !== input.pendingAction.preview.id) throw new Error('Pending action preview mismatch.');
    if (session.pendingAction.approval.approvalId !== input.pendingAction.approval.approvalId) throw new Error('Pending approval id mismatch.');

    const signal = signalOf(input.signal);
    throwIfCancelled(signal);

    const approval = this.options.actions.approve(session.pendingAction.approval.approvalId);
    if (approval.status !== 'approved' || approval.token === undefined) throw new Error(`Approval is not executable: ${approval.status}.`);

    session.state.status = 'executing';
    session.state.pendingApprovalId = undefined;
    session.state.pendingActionStepId = undefined;

    let actionResult: unknown;
    try {
      actionResult = await this.options.actions.execute({
        preview: session.pendingAction.preview,
        approvalId: approval.approvalId,
        token: approval.token,
        deviceId,
        requestId,
      });
    } catch (error: unknown) {
      session.state.status = 'failed';
      session.state.error = error instanceof Error ? error.message : String(error);
      this.pendingRequests.delete(requestId);

      return {
        status: 'failed',
        response: `Autonomous Copilot action failed: ${session.state.error}`,
        context: session.context,
        plan: session.plan,
        state: snapshot(session.state, requestId, deviceId),
      };
    }

    session.state.completed.add(session.pendingAction.stepId);
    session.state.results.push(actionResult);
    this.pendingRequests.delete(requestId);

    const resumed = await this.driveSession(session, signal);
    if (resumed.status === 'awaiting_approval' && resumed.pendingAction) {
      session.plan = resumed.plan;
      session.pendingAction = resumed.pendingAction;
      session.state.status = 'awaiting_approval';
      session.state.pendingApprovalId = resumed.pendingAction.approval.approvalId;
      session.state.pendingActionStepId = resumed.pendingAction.stepId;
      this.pendingRequests.set(requestId, session);
    }
    return resumed;
  }

  public rejectPending(input: { readonly requestId: string; readonly approvalId: string }): AutonomousCopilotResult {
    const requestId = required(input.requestId, 'Autonomous Copilot request id');
    const session = this.pendingRequests.get(requestId);
    if (!session) throw new Error('No pending approval exists for this request.');
    if (session.pendingAction.approval.approvalId !== input.approvalId) throw new Error('Pending approval id mismatch.');

    this.options.actions.reject(input.approvalId);
    session.state.status = 'rejected';
    session.state.pendingApprovalId = undefined;
    session.state.pendingActionStepId = undefined;
    this.pendingRequests.delete(requestId);

    return {
      status: 'rejected',
      response: 'The proposed DJ action was rejected.',
      context: session.context,
      plan: session.plan,
      state: snapshot(session.state, requestId, session.request.deviceId),
    };
  }

  private async driveSession(session: PendingSession, signal: AbortSignal): Promise<AutonomousCopilotResult> {
    let plan = session.plan;
    while (true) {
      const execution = await this.executePlan({ request: session.request, context: session.context, plan, state: session.state, signal });
      if (execution.pendingAction) {
        return {
          status: 'awaiting_approval',
          response: 'Approval is required before the next proposed DJ action can execute.',
          context: session.context,
          plan,
          state: snapshot(session.state, session.request.requestId, session.request.deviceId),
          pendingAction: execution.pendingAction,
        };
      }
      if (!execution.failedStep) {
        session.state.status = 'completed';
        return {
          status: 'completed',
          response: 'Approved action executed and the remaining plan completed successfully.',
          context: session.context,
          plan,
          state: snapshot(session.state, session.request.requestId, session.request.deviceId),
        };
      }
      if (!this.options.planner.replan || session.state.replans >= this.maxReplans) {
        session.state.status = 'failed';
        session.state.error = execution.failedStep.error;
        return {
          status: 'failed',
          response: `Autonomous Copilot stopped: ${session.state.error}`,
          context: session.context,
          plan,
          state: snapshot(session.state, session.request.requestId, session.request.deviceId),
        };
      }
      session.state.status = 'replanning';
      const nextPlan = await this.options.planner.replan({
        request: session.request,
        context: session.context,
        previousPlan: plan,
        failedStep: execution.failedStep.step,
        signal,
      });
      throwIfCancelled(signal);
      if (!nextPlan) {
        session.state.status = 'failed';
        session.state.error = execution.failedStep.error;
        return {
          status: 'failed',
          response: `Autonomous Copilot stopped: ${session.state.error}`,
          context: session.context,
          plan,
          state: snapshot(session.state, session.request.requestId, session.request.deviceId),
        };
      }
      session.state.replans += 1;
      plan = nextPlan;
    }
  }

  private async executePlan(input: {
    readonly request: AutonomousCopilotRequest;
    readonly context: CopilotContext;
    readonly plan: ToolPlan;
    readonly state: MutableState;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly failedStep?: { readonly step: ToolPlanStep; readonly error: string };
    readonly pendingAction?: PendingAutonomousAction;
  }> {
    if (input.plan.steps.length > 100) {
      return {
        failedStep: {
          step: input.plan.steps[0] ?? {
            id: 'plan', tool: 'unknown', arguments: null, reason: 'plan validation', dependsOn: [], risk: 'read',
          },
          error: 'Autonomous Copilot plan exceeds the maximum of 100 steps.',
        },
      };
    }

    for (const step of input.plan.steps) {
      throwIfCancelled(input.signal);
      if (input.state.completed.has(step.id)) continue;

      if (!step.dependsOn.every((dependency) => input.state.completed.has(dependency))) {
        return { failedStep: { step, error: `Step ${step.id} has an incomplete dependency.` } };
      }

      const attempts = input.state.attempts.get(step.id) ?? 0;
      if (attempts >= this.maxAttemptsPerStep) {
        return { failedStep: { step, error: `Step ${step.id} exceeded the maximum number of attempts.` } };
      }
      input.state.attempts.set(step.id, attempts + 1);

      const risk = riskOf(step);
      this.options.authorization?.assertAllowed({
        toolName: step.tool,
        risk,
        deviceId: input.request.deviceId,
        requestId: input.request.requestId,
      });

      if (risk === 'read') {
        if (input.state.toolCalls >= this.maxToolCalls) {
          return { failedStep: { step, error: 'Autonomous Copilot exceeded the maximum number of tool calls.' } };
        }
        try {
          const result = await this.options.reads.execute({
            tool: step.tool,
            arguments: step.arguments,
            requestId: input.request.requestId,
            deviceId: input.request.deviceId,
            signal: input.signal,
          });
          input.state.toolCalls += 1;
          input.state.completed.add(step.id);
          input.state.results.push(result);
        } catch (error: unknown) {
          input.state.toolCalls += 1;
          return { failedStep: { step, error: error instanceof Error ? error.message : String(error) } };
        }
        continue;
      }

      const validated = this.options.actionMapper.validate(step.arguments);
      this.options.authorization?.assertAllowed({
        toolName: step.tool,
        risk,
        deviceId: input.request.deviceId,
        requestId: input.request.requestId,
        actionType: validated.action.type,
      });

      const prepared = this.options.actions.prepare({
        action: validated,
        reason: step.reason,
        deviceId: input.request.deviceId,
        requestId: input.request.requestId,
      });

      input.state.pendingApprovalId = prepared.approval.approvalId;
      input.state.pendingActionStepId = step.id;
      input.state.status = 'awaiting_approval';

      return {
        pendingAction: {
          stepId: step.id,
          preview: prepared.preview,
          approval: prepared.approval,
        },
      };
    }
    return {};
  }
}

export function createAutonomousCopilot(options: AutonomousCopilotOptions): AutonomousCopilot {
  return new AutonomousCopilot(options);
}

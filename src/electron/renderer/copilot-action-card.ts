export interface CopilotActionCardData {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly risk: 'write' | 'review';
  readonly affectedResources: readonly string[];
  readonly reversible: boolean;
  readonly status:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'executed'
    | 'failed';
}

export interface CopilotActionCardCallbacks {
  readonly onApprove: () => void;
  readonly onReject: () => void;
}

function text(
  parent: Element,
  selector: string,
  value: string,
): void {
  const element =
    parent.querySelector(
      selector,
    );

  if (element) {
    element.textContent = value;
  }
}

export function renderCopilotActionCard(
  root: HTMLElement,
  data: CopilotActionCardData,
  callbacks: CopilotActionCardCallbacks,
): {
  destroy(): void;
} {
  root.dataset.actionId = data.id;

  text(
    root,
    '[data-action-title]',
    data.title,
  );

  text(
    root,
    '[data-action-reason]',
    data.reason,
  );

  text(
    root,
    '[data-action-risk]',
    data.risk.toUpperCase(),
  );

  text(
    root,
    '[data-action-reversible]',
    data.reversible
      ? 'Yes'
      : 'No',
  );

  text(
    root,
    '[data-action-status]',
    data.status,
  );

  const resources =
    root.querySelector(
      '[data-action-resources]',
    );

  if (resources) {
    resources.textContent =
      data.affectedResources.length > 0
        ? data.affectedResources.join(
            '\n',
          )
        : 'None';
  }

  const approve =
    root.querySelector<HTMLButtonElement>(
      '[data-action-approve]',
    );

  const reject =
    root.querySelector<HTMLButtonElement>(
      '[data-action-reject]',
    );

  const terminal =
    data.status !== 'pending';

  if (approve) {
    approve.disabled =
      terminal;
  }

  if (reject) {
    reject.disabled =
      terminal;
  }

  approve?.addEventListener(
    'click',
    callbacks.onApprove,
  );

  reject?.addEventListener(
    'click',
    callbacks.onReject,
  );

  return {
    destroy() {
      approve?.removeEventListener(
        'click',
        callbacks.onApprove,
      );

      reject?.removeEventListener(
        'click',
        callbacks.onReject,
      );
    },
  };
}

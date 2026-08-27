export type RendererCopilotEvent =
  | {
      readonly type: 'started';
      readonly conversationId: string;
    }
  | {
      readonly type: 'assistant';
      readonly content: string;
    }
  | {
      readonly type: 'tool';
      readonly toolName: string;
      readonly status: 'started' | 'completed' | 'failed';
    }
  | {
      readonly type: 'completed';
      readonly response: string;
      readonly toolCalls: number;
    }
  | {
      readonly type: 'error';
      readonly message: string;
    };

export interface CopilotRendererApi {
  send(
    input: {
      readonly conversationId: string;
      readonly message: string;
    },
    onEvent: (
      event: RendererCopilotEvent,
    ) => void,
  ): Promise<void>;

  cancel(
    conversationId: string,
  ): Promise<void>;
}

export interface CopilotChatOptions {
  readonly root: HTMLElement;
  readonly api: CopilotRendererApi;
  readonly conversationId: string;
}

interface UiMessage {
  readonly role:
    | 'user'
    | 'assistant'
    | 'tool';

  readonly content: string;
}

function requireElement<T extends Element>(
  root: HTMLElement,
  selector: string,
): T {
  const element =
    root.querySelector<T>(selector);

  if (!element) {
    throw new Error(
      `Copilot chat element missing: ${selector}`,
    );
  }

  return element;
}

export function createCopilotChat(
  options: CopilotChatOptions,
): {
  destroy(): void;
} {
  const messages =
    requireElement<HTMLDivElement>(
      options.root,
      '[data-copilot-messages]',
    );

  const input =
    requireElement<HTMLTextAreaElement>(
      options.root,
      '[data-copilot-input]',
    );

  const sendButton =
    requireElement<HTMLButtonElement>(
      options.root,
      '[data-copilot-send]',
    );

  const cancelButton =
    requireElement<HTMLButtonElement>(
      options.root,
      '[data-copilot-cancel]',
    );

  const state =
    requireElement<HTMLElement>(
      options.root,
      '[data-copilot-state]',
    );

  const append = (
    message: UiMessage,
  ): HTMLDivElement => {
    const node =
      document.createElement('div');

    node.className =
      `copilot-chat__message copilot-chat__message--${message.role}`;

    node.textContent =
      message.content;

    messages.appendChild(node);
    messages.scrollTop =
      messages.scrollHeight;

    return node;
  };

  let running = false;

  const renderRunning = (
    value: boolean,
  ): void => {
    running = value;
    sendButton.disabled = value;
    cancelButton.disabled = !value;
    input.disabled = value;
    state.textContent =
      value ? 'Thinking…' : 'Ready';
  };

  const onSend = async (): Promise<void> => {
    const message =
      input.value.trim();

    if (!message || running) {
      return;
    }

    input.value = '';
    append({
      role: 'user',
      content: message,
    });

    const assistant =
      append({
        role: 'assistant',
        content: '',
      });

    renderRunning(true);

    try {
      await options.api.send(
        {
          conversationId:
            options.conversationId,
          message,
        },
        (event) => {
          switch (event.type) {
            case 'started':
              state.textContent =
                'Thinking…';
              break;

            case 'tool':
              state.textContent =
                `${event.toolName} · ${event.status}`;
              append({
                role: 'tool',
                content:
                  `${event.toolName} · ${event.status}`,
              });
              break;

            case 'assistant':
              assistant.textContent =
                event.content;
              messages.scrollTop =
                messages.scrollHeight;
              break;

            case 'completed':
              state.textContent =
                'Ready';
              assistant.textContent =
                event.response;
              break;

            case 'error':
              state.textContent =
                'Error';
              assistant.textContent =
                event.message;
              break;
          }
        },
      );
    } catch (error: unknown) {
      state.textContent = 'Error';
      assistant.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      renderRunning(false);
    }
  };

  const onCancel = (): void => {
    void options.api.cancel(
      options.conversationId,
    );
  };

  sendButton.addEventListener(
    'click',
    () => void onSend(),
  );

  cancelButton.addEventListener(
    'click',
    onCancel,
  );

  input.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Enter' &&
        !event.shiftKey
      ) {
        event.preventDefault();
        void onSend();
      }
    },
  );

  renderRunning(false);

  return {
    destroy() {
      sendButton.removeEventListener(
        'click',
        () => void onSend(),
      );

      cancelButton.removeEventListener(
        'click',
        onCancel,
      );
    },
  };
}

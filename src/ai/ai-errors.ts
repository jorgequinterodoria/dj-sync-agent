export type AIErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'authentication_failed'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_error'
  | 'invalid_response';

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly statusCode: number | null;
  readonly retryable: boolean;

  constructor(
    code: AIErrorCode,
    message: string,
    options: {
      statusCode?: number | null;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AIProviderError';
    this.code = code;
    this.statusCode = options.statusCode ?? null;
    this.retryable = options.retryable ?? false;
  }
}

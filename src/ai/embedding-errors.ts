export type EmbeddingErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'authentication'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response'
  | 'network'
  | 'unsupported_url';

export class EmbeddingProviderError extends Error {
  public readonly code: EmbeddingErrorCode;

  public constructor(
    code: EmbeddingErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'EmbeddingProviderError';
    this.code = code;
  }
}

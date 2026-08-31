import {
  AIProviderError,
} from './ai-errors.js';

import {
  AnthropicProvider,
} from './anthropic-provider.js';

import {
  OpenAICompatibleProvider,
} from './openai-compatible-provider.js';

import type {
  AIProvider,
  AIProviderId,
} from './ai-provider.js';

export interface AIProviderFactoryConfig {
  provider:
    AIProviderId;

  apiKey:
    string;

  baseUrl?:
    string | null;

  timeoutMs?:
    number;
}

export function createAIProvider(
  config:
    AIProviderFactoryConfig,
): AIProvider {
  const provider =
    config.provider;

  const apiKey =
    config.apiKey.trim();

  if (!apiKey) {
    throw new AIProviderError(
      'not_configured',
      'AI provider API key is required.',
    );
  }

  if (
    provider ===
    'anthropic'
  ) {
    const baseUrl =
      config.baseUrl
        ?.trim();

    const options: {
      apiKey:
        string;

      baseUrl?:
        string;

      timeoutMs?:
        number;
    } = {
      apiKey,
    };

    if (baseUrl) {
      options.baseUrl =
        baseUrl;
    }

    if (
      config.timeoutMs !==
      undefined
    ) {
      options.timeoutMs =
        config.timeoutMs;
    }

    return new AnthropicProvider(
      options,
    );
  }

  if (
    provider ===
    'openai'
  ) {
    const options: {
      id:
        'openai';

      baseUrl:
        string;

      apiKey:
        string;

      timeoutMs?:
        number;
    } = {
      id:
        'openai',

      baseUrl:
        config.baseUrl
          ?.trim() ||
        'https://api.openai.com/v1',

      apiKey,
    };

    if (
      config.timeoutMs !==
      undefined
    ) {
      options.timeoutMs =
        config.timeoutMs;
    }

    return new OpenAICompatibleProvider(
      options,
    );
  }

  const options: {
    id:
      'openai-compatible';

    baseUrl:
      string;

    apiKey:
      string;

    timeoutMs?:
      number;
  } = {
    id:
      'openai-compatible',

    baseUrl:
      config.baseUrl
        ?.trim() || '',

    apiKey,
  };

  if (
    config.timeoutMs !==
    undefined
  ) {
    options.timeoutMs =
      config.timeoutMs;
  }

  return new OpenAICompatibleProvider(
    options,
  );
}
import { AIProvider } from './AIProvider';
import { GeminiProvider } from './GeminiProvider';

let customProviderInstance: AIProvider | null = null;

export function setAIProvider(provider: AIProvider | null): void {
  customProviderInstance = provider;
}

export function getAIProvider(): AIProvider {
  if (customProviderInstance) {
    return customProviderInstance;
  }

  const providerType = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

  switch (providerType) {
    case 'gemini':
      return new GeminiProvider();
    default:
      throw new Error(`Unsupported AI_PROVIDER: '${providerType}'. Supported providers: 'gemini'.`);
  }
}

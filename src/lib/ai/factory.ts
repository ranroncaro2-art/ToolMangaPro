import { AIProvider } from './types';
import { OpenAIProvider, GeminiProvider, ClaudeProvider } from './providers';

export class AIProviderFactory {
  static getProvider(provider: 'openai' | 'gemini' | 'claude'): AIProvider {
    switch (provider) {
      case 'openai':
        return new OpenAIProvider();
      case 'gemini':
        return new GeminiProvider();
      case 'claude':
        return new ClaudeProvider();
      default:
        throw new Error(`Unsupported AI Provider: ${provider}`);
    }
  }
}

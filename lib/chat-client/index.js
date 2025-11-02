/**
 * lib-maia-chat
 * Unified chat interface for multiple AI providers
 */

import { BaseChatProvider } from './providers/base-provider.js';
import { AnthropicProvider } from './providers/anthropic.js';

/**
 * Main ChatClient class
 */
export class ChatClient {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();

    // Initialize providers based on config
    this.initializeProviders();
  }

  /**
   * Initialize available providers
   */
  initializeProviders() {
    // Anthropic
    if (this.config.anthropic?.apiKey) {
      this.providers.set('anthropic', new AnthropicProvider(
        this.config.anthropic.apiKey,
        {}
      ));
    }

    // TODO: Add other providers
    // - DigitalOcean GenAI
    // - OpenAI/ChatGPT
    // - Google Gemini
    // - DeepSeek
  }

  /**
   * Get a provider by name
   */
  getProvider(name) {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider '${name}' not available`);
    }
    return provider;
  }

  /**
   * Chat with a specific provider
   */
  async chat(providerName, messages, options = {}, onUpdate = null) {
    const provider = this.getProvider(providerName);
    return await provider.chat(messages, options, onUpdate);
  }

  /**
   * List available providers
   */
  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(name) {
    return this.providers.has(name);
  }
}

// Export provider classes
export { BaseChatProvider, AnthropicProvider };
export { SSEParser, DelimitedParser } from './streaming/stream-parser.js';
export { StreamingMessageBuilder } from './streaming/message-builder.js';


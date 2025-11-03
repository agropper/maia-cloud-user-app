/**
 * DeepSeek R1 provider with streaming support
 */

import { BaseChatProvider } from './base-provider.js';
import OpenAI from 'openai';
import { StreamingMessageBuilder } from '../streaming/message-builder.js';

export class DeepSeekProvider extends BaseChatProvider {
  constructor(apiKey, config = {}) {
    super('deepseek', config);
    this.apiKey = apiKey;
    this.client = null;
    
    if (apiKey) {
      this.client = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://api.deepseek.com/v1'
      });
    }
  }

  validateConfig() {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is required');
    }
    return true;
  }

  /**
   * Chat with DeepSeek
   */
  async chat(messages, options = {}, onUpdate = null) {
    if (!this.client) {
      throw new Error('DeepSeek client not initialized');
    }

    const formattedMessages = this.formatMessages(messages);
    const model = options.model || 'deepseek-chat';
    const temperature = options.temperature || 0.7;
    const maxTokens = options.maxTokens || 4096;
    const system = options.system;

    // OpenAI format expects messages with name field
    const openAIMessages = formattedMessages.map(msg => {
      const formatted = {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      };
      if (msg.name) {
        formatted.name = msg.name;
      }
      return formatted;
    });

    // Add system message if provided
    if (system) {
      openAIMessages.unshift({ role: 'system', content: system });
    }

    try {
      // If streaming requested and callback provided
      if (options.stream && onUpdate) {
        return await this.streamChat(openAIMessages, {
          model,
          temperature,
          max_tokens: maxTokens
        }, onUpdate);
      }

      // Non-streaming request
      const response = await this.client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: openAIMessages
      });

      const content = response.choices[0]?.message?.content || '';

      return {
        role: 'assistant',
        content,
        model: model,
        usage: response.usage
      };

    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Stream chat response
   */
  async streamChat(messages, params, onUpdate) {
    const streamBuilder = new StreamingMessageBuilder(onUpdate);

    try {
      const stream = await this.client.chat.completions.create({
        ...params,
        messages,
        stream: true
      });

      // Handle OpenAI streaming format
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          streamBuilder.addChunk({ type: 'text', text: delta });
        }
      }

      streamBuilder.complete({
        model: params.model
      });

      return {
        role: 'assistant',
        content: streamBuilder.getContent(),
        model: params.model
      };
    } catch (error) {
      // Re-throw with proper error formatting
      throw this.handleError(error);
    }
  }

  /**
   * Mock chat for testing
   */
  async mockChat(messages, options, onUpdate) {
    const streamBuilder = new StreamingMessageBuilder(onUpdate);
    const mockResponse = "I'm DeepSeek, an AI assistant created by DeepSeek. I'm powered by DeepSeek R1.";
    
    // Simulate streaming
    for (let i = 0; i < mockResponse.length; i += 5) {
      const chunk = mockResponse.slice(i, i + 5);
      streamBuilder.addChunk({ type: 'text', text: chunk });
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    streamBuilder.complete({ model: 'deepseek-chat' });

    return {
      role: 'assistant',
      content: streamBuilder.getContent(),
      model: 'deepseek-chat',
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    };
  }
}


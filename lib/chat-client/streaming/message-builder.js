/**
 * Message builder for streaming responses
 * Accumulates chunks and manages message state
 */

export class StreamingMessageBuilder {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.accumulatedContent = '';
    this.deltaContent = '';
    this.isComplete = false;
  }

  /**
   * Add a chunk to the message
   */
  addChunk(chunk, metadata = {}) {
    // Extract text content from various chunk formats
    const text = this.extractText(chunk);
    
    if (text) {
      this.deltaContent = text;
      this.accumulatedContent += text;
      
      // Notify listener
      this.onUpdate({
        delta: this.deltaContent,
        content: this.accumulatedContent,
        isComplete: false,
        ...metadata
      });
    }
  }

  /**
   * Mark message as complete
   */
  complete(metadata = {}) {
    this.isComplete = true;
    this.onUpdate({
      delta: '',
      content: this.accumulatedContent,
      isComplete: true,
      ...metadata
    });
  }

  /**
   * Extract text from various chunk formats
   */
  extractText(chunk) {
    // Handle different provider formats
    
    // Anthropic format: { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
    if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
      return chunk.delta.text;
    }
    
    // Anthropic format: { type: 'content_block', content: [{ type: 'text', text: '...' }] }
    if (chunk.type === 'content_block' && chunk.content) {
      return chunk.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text)
        .join('');
    }
    
    // OpenAI format: { choices: [{ delta: { content: '...' } }] }
    if (chunk.choices && chunk.choices[0]?.delta?.content) {
      return chunk.choices[0].delta.content;
    }
    
    // Plain text
    if (typeof chunk === 'string') {
      return chunk;
    }
    
    // Object with text property
    if (chunk.text) {
      return chunk.text;
    }
    
    return '';
  }

  /**
   * Get the accumulated content
   */
  getContent() {
    return this.accumulatedContent;
  }

  /**
   * Reset the builder
   */
  reset() {
    this.accumulatedContent = '';
    this.deltaContent = '';
    this.isComplete = false;
  }
}


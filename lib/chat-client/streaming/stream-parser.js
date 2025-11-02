/**
 * Streaming response parser utilities
 * Handles Server-Sent Events (SSE) and other streaming formats
 */

/**
 * Parse Server-Sent Events stream
 */
export class SSEParser {
  constructor(onChunk, onComplete, onError) {
    this.onChunk = onChunk;
    this.onComplete = onComplete;
    this.onError = onError;
    this.buffer = '';
  }

  /**
   * Process incoming SSE data
   */
  async processSSE(response) {
    if (!response.body) {
      throw new Error('Response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (this.buffer) {
            // Process any remaining buffer
            this.processChunk(this.buffer);
          }
          this.onComplete();
          break;
        }

        this.buffer += decoder.decode(value, { stream: true });
        const lines = this.buffer.split('\n\n');
        
        // Keep the last incomplete line in buffer
        this.buffer = lines.pop() || '';
        
        // Process complete lines
        for (const line of lines) {
          if (line.trim()) {
            this.processChunk(line);
          }
        }
      }
    } catch (error) {
      this.onError(error);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process a single SSE chunk
   */
  processChunk(chunk) {
    // SSE format: "data: {...}" or "event: type\ndata: {...}"
    const lines = chunk.split('\n');
    let data = null;
    let eventType = 'message';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          data = JSON.parse(line.slice(6));
        } catch (e) {
          // If not JSON, treat as plain text
          data = line.slice(6);
        }
      } else if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      }
    }

    if (data !== null) {
      this.onChunk(data, eventType);
    }
  }
}

/**
 * Parse streaming response with simple newline delimiter
 */
export class DelimitedParser {
  constructor(onChunk, onComplete, onError) {
    this.onChunk = onChunk;
    this.onComplete = onComplete;
    this.onError = onError;
    this.buffer = '';
  }

  async processDelimited(response) {
    if (!response.body) {
      throw new Error('Response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          this.onComplete();
          break;
        }

        this.buffer += decoder.decode(value, { stream: true });
        const lines = this.buffer.split('\n');
        
        // Keep last incomplete line in buffer
        this.buffer = lines.pop() || '';
        
        // Process complete lines
        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              this.onChunk(data);
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      this.onError(error);
    } finally {
      reader.releaseLock();
    }
  }
}


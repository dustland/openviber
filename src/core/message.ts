/**
 * Message types for Viber - Using AI SDK v6 types directly
 */

import type { ModelMessage } from 'ai';

// Extend CoreMessage to include our metadata
export interface ViberMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'data' | 'tool';
  content: any;
  id?: string;  // Message ID (includes agent prefix for tracking)
  metadata?: {
    agentName?: string;
    timestamp?: number;
    [key: string]: any;
  };
}

// Use ViberMessage as our Message type
export type Message = ViberMessage;

/**
 * Get text content from a message
 */
export function getTextContent(message: Message): string {
  if (!message || !message.content) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((part: any) => part && part.type === 'text')
      .map((part: any) => part.text || '')
      .join(' ');
  }

  return '';
}

/**
 * Queued message with metadata
 */
export interface QueuedMessage {
  id: string;
  content: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  timestamp: number;
  edited?: boolean;
  error?: string;
  metadata?: any;
}

/**
 * Queue state for UI
 */
export interface QueueState {
  current?: QueuedMessage;
  queue: QueuedMessage[];
  processing: boolean;
}

/**
 * Queue listener type
 */
export type QueueListener = (state: QueueState) => void;

/**
 * Enhanced Message Queue with management capabilities
 */
export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private current?: QueuedMessage;
  private processing = false;
  private listeners = new Set<QueueListener>();
  private nextId = 1;

  /**
   * Add message to queue
   */
  add(content: string, metadata?: any): string {
    const message: QueuedMessage = {
      id: `msg-${this.nextId++}`,
      content,
      status: 'queued',
      timestamp: Date.now(),
      metadata,
    };

    this.queue.push(message);
    this.notify();
    return message.id;
  }

  /**
   * Get next message from queue
   */
  next(): QueuedMessage | undefined {
    const message = this.queue.shift();
    if (message) {
      message.status = 'processing';
      this.current = message;
      this.processing = true;
      this.notify();
    }
    return message;
  }

  /**
   * Mark current message as complete
   */
  complete(messageId: string) {
    if (this.current?.id === messageId) {
      this.current.status = 'completed';
      this.current = undefined;
      this.processing = false;
      this.notify();
    }
  }

  /**
   * Mark current message as error
   */
  error(messageId: string, error: string) {
    if (this.current?.id === messageId) {
      this.current.status = 'error';
      this.current.error = error;
      this.current = undefined;
      this.processing = false;
      this.notify();
    }
  }

  /**
   * Remove message from queue
   */
  remove(messageId: string): boolean {
    const index = this.queue.findIndex(m => m.id === messageId);
    if (index > -1) {
      this.queue.splice(index, 1);
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Reorder queue
   */
  reorder(messageId: string, newIndex: number) {
    const currentIndex = this.queue.findIndex(m => m.id === messageId);
    if (currentIndex > -1 && newIndex >= 0 && newIndex < this.queue.length) {
      const [message] = this.queue.splice(currentIndex, 1);
      this.queue.splice(newIndex, 0, message);
      this.notify();
    }
  }

  /**
   * Edit queued message
   */
  edit(messageId: string, content: string) {
    const message = this.queue.find(m => m.id === messageId);
    if (message && message.status === 'queued') {
      message.content = content;
      message.edited = true;
      this.notify();
    }
  }

  /**
   * Clear all queued messages
   */
  clear() {
    this.queue = [];
    this.notify();
  }

  /**
   * Get queue state
   */
  getState(): QueueState {
    return {
      current: this.current,
      queue: [...this.queue],
      processing: this.processing,
    };
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Check if processing
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Notify listeners
   */
  private notify() {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }
}

/**
 * Conversation History management
 */
export class ConversationHistory {
  public messages: Message[] = [];

  add(message: Message): void {
    // Ensure message has an ID
    if (!message.id) {
      const agentName = message.metadata?.agentName || 'unknown';
      const prefix = agentName.toLowerCase().replace(/\s+/g, '-');
      const randomId = Math.random().toString(36).substring(2, 10);
      message.id = `${prefix}_${randomId}`;
    }
    this.messages.push(message);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getLastN(n: number): Message[] {
    return this.messages.slice(-n);
  }

  clear(): void {
    this.messages = [];
  }

  toModelMessages(): ModelMessage[] {
    // Convert to AI SDK format, cleaning content appropriately
    return this.messages
      .map(msg => {
        // Skip tool messages - they can't be passed without their parent tool_calls
        if (msg.role === 'tool') {
          return null;
        }

        // Clean content to be AI SDK compatible
        let cleanContent: any = msg.content;

        // If content is an array, extract only text parts
        if (Array.isArray(msg.content)) {
          const textParts = msg.content.filter((part: any) => part.type === 'text');
          if (textParts.length > 0) {
            // Join all text parts into a single string
            cleanContent = textParts
              .map((part: any) => part.text || '')
              .filter((text: string) => text)
              .join('\n');
          } else {
            // No text content, skip this message
            return null;
          }
        }

        // Skip messages with no content
        if (!cleanContent) {
          return null;
        }

        return {
          role: msg.role,
          content: cleanContent,
        };
      })
      .filter(msg => msg !== null) as ModelMessage[];
  }
}
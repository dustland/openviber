import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageQueue, ConversationHistory, Message, QueuedMessage } from './message';

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue();
  });

  it('should initialize with an empty queue', () => {
    const state = queue.getState();
    expect(state.queue).toEqual([]);
    expect(state.current).toBeUndefined();
    expect(state.processing).toBe(false);
  });

  it('should add a message to the queue', () => {
    const messageId = queue.add('test content', { key: 'value' });
    const state = queue.getState();

    expect(state.queue.length).toBe(1);
    expect(state.queue[0].id).toBe(messageId);
    expect(state.queue[0].content).toBe('test content');
    expect(state.queue[0].metadata).toEqual({ key: 'value' });
    expect(state.queue[0].status).toBe('queued');
  });

  it('should notify listeners when adding a message', () => {
    const listener = vi.fn();
    queue.subscribe(listener);

    queue.add('test content');

    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0][0];
    expect(state.queue.length).toBe(1);
  });

  it('should process the next message', () => {
    const id1 = queue.add('msg1');
    const id2 = queue.add('msg2');

    const nextMsg = queue.next();

    expect(nextMsg).toBeDefined();
    expect(nextMsg?.id).toBe(id1);
    expect(nextMsg?.status).toBe('processing');

    const state = queue.getState();
    expect(state.processing).toBe(true);
    expect(state.current?.id).toBe(id1);
    expect(state.queue.length).toBe(1);
    expect(state.queue[0].id).toBe(id2);
  });

  it('should notify listeners when processing next message', () => {
    queue.add('msg1');
    const listener = vi.fn();
    queue.subscribe(listener);

    queue.next();

    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0][0];
    expect(state.processing).toBe(true);
  });

  it('should return undefined when next is called on empty queue', () => {
    const nextMsg = queue.next();
    expect(nextMsg).toBeUndefined();
  });

  it('should complete the current message', () => {
    const id = queue.add('msg1');
    queue.next();

    queue.complete(id);

    const state = queue.getState();
    expect(state.processing).toBe(false);
    expect(state.current).toBeUndefined();
  });

  it('should not complete if message id does not match current', () => {
    const id = queue.add('msg1');
    queue.next();

    queue.complete('wrong-id');

    const state = queue.getState();
    expect(state.processing).toBe(true);
    expect(state.current?.id).toBe(id);
  });

  it('should mark current message as error', () => {
    const id = queue.add('msg1');
    queue.next();

    queue.error(id, 'something went wrong');

    const state = queue.getState();
    expect(state.processing).toBe(false);
    expect(state.current).toBeUndefined();
  });

  it('should remove a message from queue', () => {
    const id1 = queue.add('msg1');
    const id2 = queue.add('msg2');
    const id3 = queue.add('msg3');

    const removed = queue.remove(id2);

    expect(removed).toBe(true);
    const state = queue.getState();
    expect(state.queue.length).toBe(2);
    expect(state.queue.map(m => m.id)).toEqual([id1, id3]);
  });

  it('should return false when removing non-existent message', () => {
    const removed = queue.remove('non-existent');
    expect(removed).toBe(false);
  });

  it('should reorder messages', () => {
    const id1 = queue.add('msg1');
    const id2 = queue.add('msg2');
    const id3 = queue.add('msg3');

    // Move msg3 to position 0
    queue.reorder(id3, 0);

    const state = queue.getState();
    expect(state.queue.map(m => m.id)).toEqual([id3, id1, id2]);
  });

  it('should edit a queued message', () => {
    const id = queue.add('original content');

    queue.edit(id, 'updated content');

    const state = queue.getState();
    expect(state.queue[0].content).toBe('updated content');
    expect(state.queue[0].edited).toBe(true);
  });

  it('should clear the queue', () => {
    queue.add('msg1');
    queue.add('msg2');

    queue.clear();

    const state = queue.getState();
    expect(state.queue.length).toBe(0);
  });

  it('should unsubscribe correctly', () => {
      const listener = vi.fn();
      const unsubscribe = queue.subscribe(listener);

      queue.add('msg1');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      queue.add('msg2');
      expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should check if queue is empty', () => {
    expect(queue.isEmpty()).toBe(true);
    queue.add('msg1');
    expect(queue.isEmpty()).toBe(false);
  });

  it('should check if processing', () => {
    expect(queue.isProcessing()).toBe(false);
    queue.add('msg1');
    queue.next();
    expect(queue.isProcessing()).toBe(true);
    queue.complete(queue.getState().current!.id);
    expect(queue.isProcessing()).toBe(false);
  });
});

describe('ConversationHistory', () => {
    let history: ConversationHistory;

    beforeEach(() => {
        history = new ConversationHistory();
    });

    it('should add a message', () => {
        const msg: Message = { role: 'user', content: 'hello' };
        history.add(msg);

        const messages = history.getMessages();
        expect(messages.length).toBe(1);
        expect(messages[0].content).toBe('hello');
        expect(messages[0].id).toBeDefined();
    });

    it('should generate an ID if missing', () => {
        const msg: Message = { role: 'user', content: 'hello' };
        history.add(msg);
        expect(history.getMessages()[0].id).toMatch(/unknown_[a-z0-9]+/);
    });

    it('should use existing ID if present', () => {
        const msg: Message = { role: 'user', content: 'hello', id: 'my-id' };
        history.add(msg);
        expect(history.getMessages()[0].id).toBe('my-id');
    });

    it('should use agent name in generated ID', () => {
        const msg: Message = { role: 'user', content: 'hello', metadata: { agentName: 'My Agent' } };
        history.add(msg);
        expect(history.getMessages()[0].id).toMatch(/my-agent_[a-z0-9]+/);
    });

    it('should get last N messages', () => {
        history.add({ role: 'user', content: '1' });
        history.add({ role: 'assistant', content: '2' });
        history.add({ role: 'user', content: '3' });

        const last2 = history.getLastN(2);
        expect(last2.length).toBe(2);
        expect(last2[0].content).toBe('2');
        expect(last2[1].content).toBe('3');
    });

    it('should clear history', () => {
        history.add({ role: 'user', content: 'hello' });
        history.clear();
        expect(history.getMessages().length).toBe(0);
    });

    it('should convert to model messages', () => {
        history.add({ role: 'user', content: 'hello' });
        history.add({ role: 'assistant', content: 'hi' });

        const modelMessages = history.toModelMessages();
        expect(modelMessages.length).toBe(2);
        expect(modelMessages[0]).toEqual({ role: 'user', content: 'hello' });
        expect(modelMessages[1]).toEqual({ role: 'assistant', content: 'hi' });
    });

    it('should filter out tool messages', () => {
        history.add({ role: 'user', content: 'hello' });
        history.add({ role: 'tool', content: 'tool result' });

        const modelMessages = history.toModelMessages();
        expect(modelMessages.length).toBe(1);
        expect(modelMessages[0].role).toBe('user');
    });

    it('should handle array content', () => {
        history.add({
            role: 'user',
            content: [
                { type: 'text', text: 'part 1' },
                { type: 'image', image: '...' },
                { type: 'text', text: 'part 2' }
            ]
        });

        const modelMessages = history.toModelMessages();
        expect(modelMessages.length).toBe(1);
        // The implementation joins with a newline if multiple text parts
        expect(modelMessages[0].content).toBe('part 1\npart 2');
    });

    it('should filter out messages with empty content', () => {
        history.add({ role: 'user', content: '' });
        history.add({ role: 'user', content: [] });
        history.add({ role: 'user', content: [{ type: 'image', image: '...' }] }); // No text parts

        const modelMessages = history.toModelMessages();
        expect(modelMessages.length).toBe(0);
    });
});

---
title: "Communication and Message Architecture"
---


## 1. Core Principles

The communication architecture in Viber is a critical component that enables the transparent, real-time feedback loop at the heart of the Vibe-X philosophy. It is designed to be robust, extensible, and streamable, drawing inspiration from modern standards like the Vercel AI SDK. The core principles are:

- **Message-Oriented**: The fundamental unit of communication is a `XMessage`. All interactions, whether from a user, an agent, or a tool, are encapsulated in this structure.
- **Composable Parts**: A `XMessage` is composed of a list of `XMessagePart` objects. This allows for rich, multi-modal content and a clear separation of concerns (e.g., text, tool calls, and tool results all have their own part type).
- **Streaming First**: The entire model is designed for real-time streaming. A message and its parts can be sent incrementally, allowing for responsive user interfaces and efficient data flow.

## 2. The `Message` and `Part` Schema

This section defines the core data structures for communication.

### 2.1. The `XMessage` Object

A `XMessage` represents a single entry in the conversation history. It contains a list of `XMessagePart` objects that make up its content.

```typescript
import type { XMessagePart } from "@viber/core";

interface XMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool" | "data";
  parts: XMessagePart[];
  metadata?: {
    agentName?: string;
    timestamp?: number;
    [key: string]: unknown;
  };
  content?: string; // Optional for backward compatibility
}
```

### 2.2. The `Part` Objects

These are the building blocks of a `XMessage`. Following the AI SDK pattern, we use a union type for all possible part types.

#### `TextPart`

The simplest part, containing a piece of text. During streaming, multiple `TextPart` objects can be sent to represent a continuous flow of text.

```typescript
interface TextPart {
  type: "text";
  text: string;
}
```

#### `ToolCallPart`

A structured request from an agent to call a specific tool with a given set of arguments.

```typescript
interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}
```

#### `ToolResultPart`

The result of a tool execution. It is explicitly linked back to the originating call by its `toolCallId`.

```typescript
interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}
```

#### Extended Part Types

Beyond the core types, Viber supports additional part types for richer agent interactions:

```typescript
// For reasoning transparency
interface ReasoningPart {
  type: "reasoning";
  content: string;
}

// For file attachments
interface FilePart {
  type: "file";
  data: string | Uint8Array;
  mimeType: string;
}

// For multi-step operations
interface StepStartPart {
  type: "step-start";
  stepId: string;
  stepName?: string;
}

// Viber-specific: Artifact references
interface ArtifactPart {
  type: "artifact";
  artifactId: string;
  title: string;
  version?: number;
  preview?: string;
}

// Viber-specific: Plan updates
interface PlanUpdatePart {
  type: "plan-update";
  planId: string;
  action: "created" | "updated" | "completed" | "failed";
  details?: Record<string, unknown>;
}
```

## 3. Example Message Flows

### 3.1. Simple Text Conversation

**User Message:**

```json
{
  "role": "user",
  "parts": [{ "type": "text", "text": "Hello, world!" }]
}
```

**Assistant Response (streamed):**

```json
// Stream Packet 1
{ "role": "assistant", "parts": [{ "type": "text", "text": "Hello" }] }
// Stream Packet 2
{ "role": "assistant", "parts": [{ "type": "text", "text": " there!" }] }
```

### 3.2. Successful Tool Call Flow

This example shows the full lifecycle, from the agent requesting a tool to receiving the result.

**1. Assistant requests a tool call:**
The agent's message contains both explanatory text and a `ToolCallPart`.

```json
{
  "role": "assistant",
  "parts": [
    {
      "type": "text",
      "text": "Sure, I can write that file for you. I will now call the tool."
    },
    {
      "type": "tool-call",
      "toolCallId": "tc_123",
      "toolName": "write_file",
      "args": { "path": "/hello.txt", "content": "Hello, world!" }
    }
  ]
}
```

**2. The system provides the tool result:**
A new message is created containing the `ToolResultPart`. This is sent back to the agent for its next reasoning step.

```json
{
  "role": "assistant",
  "parts": [
    {
      "type": "tool-result",
      "toolCallId": "tc_123",
      "toolName": "write_file",
      "result": {
        "status": "success",
        "message": "File written successfully."
      },
      "isError": false
    }
  ]
}
```

**3. The agent generates its final response:**
After receiving the result, the agent formulates its final answer.

```json
{
  "role": "assistant",
  "parts": [
    {
      "type": "text",
      "text": "I have successfully written the file to `/hello.txt`."
    }
  ]
}
```

## 4. Streaming and Progressive Responses

To build a truly responsive UI, a client needs to be aware of the agent's progress throughout its turn, not just at the end. This is especially important for multi-step operations like tool calls. Viber achieves this by streaming a sequence of message updates for a single logical turn.

### 4.1. The Streaming Protocol

The client should not assume a single request will yield a single response. Instead, it should be prepared to receive multiple, distinct message objects over the same streaming connection. Each object provides a real-time snapshot of the agent's activity.

```mermaid
sequenceDiagram
    participant Client
    participant Viber
    participant Agent
    participant ToolManager

    Client->>Viber: POST /api/chat with User Message

    activate Viber
    Viber->>Agent: invoke

    Agent-->>Viber: Generate ToolCallPart
    Viber-->>Client: Stream Packet with ToolCallPart
    Note over Client: UI displays tool call status

    Viber->>ToolManager: execute tool call
    ToolManager-->>Viber: result

    Viber-->>Client: Stream Packet with ToolResultPart
    Note over Client: UI displays tool success

    Viber->>Agent: provide result
    Agent->>Viber: Generate TextPart stream

    loop Text Streaming
        Viber-->>Client: Stream Packets with TextPart chunks
    end
    Note over Client: UI streams final text response

    deactivate Viber
```

## 5. Frontend State Management

The frontend maintains a streaming message state that progressively builds the UI using `@viber/react`:

```typescript
import { useXChat, type XChatMessage } from "@viber/react";

function Chat({ spaceId }: { spaceId: string }) {
  const {
    messages,
    input,
    setInput,
    append,
    isLoading,
    status,
  } = useXChat({
    spaceId,
  });

  // Messages are automatically updated as they stream
  // Status provides granular loading states: "idle" | "streaming" | "awaiting-approval"

  return (
    <div>
      {messages.map((msg) => (
        <MessageRenderer key={msg.id} message={msg} />
      ))}
    </div>
  );
}

// Render message parts
function MessageRenderer({ message }: { message: XChatMessage }) {
  return (
    <div>
      {message.parts.map((part, idx) => {
        switch (part.type) {
          case "text":
            return <p key={idx}>{part.text}</p>;
          case "tool-call":
            return <ToolCallDisplay key={idx} toolCall={part} />;
          case "tool-result":
            return <ToolResultDisplay key={idx} result={part} />;
          case "artifact":
            return <ArtifactPreview key={idx} artifact={part} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
```

## 6. Benefits of This Architecture

1. **Progressive Rendering**: UI updates smoothly as content streams
2. **Structured Data**: Maintains proper message/part relationships
3. **Tool Transparency**: Shows tool calls and results inline with text
4. **Error Recovery**: Failed tool calls don't break the message flow
5. **Multi-modal Support**: Easily extends to images, files, and other content types
6. **Backward Compatible**: The `content` field provides plain text fallback
7. **Type Safety**: Full TypeScript types for all message structures

This architecture ensures that every piece of agent activity is captured, structured, and communicated in real-time, embodying the Vibe-X philosophy of transparency and user empowerment.

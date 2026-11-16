// The only module that knows which model vendor is in use: Claude on Amazon Bedrock, through
// the ConverseStream API with a Bedrock API key. Everything else speaks the neutral types below.
import { EventStreamDecoder, EventStreamError } from "./eventStream.ts";

export type Part =
  | { text: string }
  | { toolUse: { id: string; name: string; input: unknown } }
  | { toolResult: { id: string; content: string; isError?: boolean } };

export type Message = { role: "user" | "assistant"; parts: Part[] };

export type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };

export type TurnRequest = {
  system?: string;
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
};

export type StopReason = "endTurn" | "toolUse" | "maxTokens" | "stopSequence";

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "toolUse"; id: string; name: string; input: unknown }
  | { type: "done"; stopReason: StopReason; usage: { inputTokens: number; outputTokens: number } };

export type ProviderErrorKind =
  /** Over quota. Retried once before anything was streamed; this is the second failure. */
  | "throttled"
  | "timeout"
  /** The model or a content filter declined to answer. */
  | "refused"
  /** The reply finished with no text and no tool call. */
  | "empty"
  /** The stream or a tool call's arguments could not be parsed. */
  | "malformed"
  | "unavailable"
  | "notAuthorized"
  | "invalidRequest";

export class ProviderError extends Error {
  constructor(readonly kind: ProviderErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}

export type ProviderConfig = {
  apiKey: string;
  region: string;
  modelId: string;
  fetch?: typeof fetch;
  /** For the whole call, connection to last byte. Default 60 s. */
  timeoutMs?: number;
  /** Wait before the single retry after a throttle. Default 500 ms. */
  retryDelayMs?: number;
};

const STOP_REASONS: Record<string, StopReason> = {
  end_turn: "endTurn",
  tool_use: "toolUse",
  max_tokens: "maxTokens",
  stop_sequence: "stopSequence",
};
const REFUSALS = new Set(["content_filtered", "guardrail_intervened"]);

const STREAM_EXCEPTIONS: Record<string, ProviderErrorKind> = {
  throttlingException: "throttled",
  validationException: "invalidRequest",
  modelStreamErrorException: "unavailable",
  internalServerException: "unavailable",
  serviceUnavailableException: "unavailable",
};

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 429) return "throttled";
  if (status === 401 || status === 403) return "notAuthorized";
  if (status === 408) return "timeout";
  if (status === 400 || status === 404) return "invalidRequest";
  return "unavailable";
}

function toWire(part: Part): Record<string, unknown> {
  if ("text" in part) return { text: part.text };
  if ("toolUse" in part) {
    return { toolUse: { toolUseId: part.toolUse.id, name: part.toolUse.name, input: part.toolUse.input } };
  }
  return {
    toolResult: {
      toolUseId: part.toolResult.id,
      content: [{ text: part.toolResult.content }],
      status: part.toolResult.isError ? "error" : "success",
    },
  };
}

export function requestBody(request: TurnRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: request.messages.map((m) => ({ role: m.role, content: m.parts.map(toWire) })),
    inferenceConfig: { maxTokens: request.maxTokens ?? 1024 },
  };
  if (request.system) body.system = [{ text: request.system }];
  if (request.tools?.length) {
    body.toolConfig = {
      tools: request.tools.map((t) => ({
        toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } },
      })),
    };
  }
  return body;
}

function parseJson(bytes: Uint8Array, what: string): Record<string, unknown> {
  const raw = new TextDecoder().decode(bytes);
  try {
    const value = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch (cause) {
    throw new ProviderError("malformed", `${what} was not a JSON object: ${(cause as Error).message}`);
  }
}

async function open(config: ProviderConfig, request: TurnRequest, signal: AbortSignal): Promise<Response> {
  const url = `https://bedrock-runtime.${config.region}.amazonaws.com/model/${encodeURIComponent(config.modelId)}/converse-stream`;
  const send = () =>
    (config.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(requestBody(request)),
      signal,
    });

  let response = await send();
  if (response.status === 429) {
    // Nothing has been streamed yet, so one retry cannot duplicate anything.
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs ?? 500));
    response = await send();
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new ProviderError(kindForStatus(response.status), `Bedrock answered ${response.status}: ${detail}`, response.status);
  }
  if (!response.body) throw new ProviderError("malformed", "Bedrock answered 200 with no body");
  return response;
}

/**
 * One model turn, streamed. Yields text as it arrives, each tool call once its arguments are
 * complete, then a single `done`. Throws `ProviderError` for every failure; never yields a
 * partial tool call and never ends silently.
 */
export async function* streamTurn(config: ProviderConfig, request: TurnRequest): AsyncGenerator<TurnEvent> {
  const signal = AbortSignal.timeout(config.timeoutMs ?? 60_000);
  try {
    const response = await open(config, request, signal);
    const decoder = new EventStreamDecoder();
    const toolCalls = new Map<number, { id: string; name: string; json: string }>();
    let produced = false;
    let stop: string | undefined;
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of response.body!) {
      for (const message of decoder.push(chunk)) {
        if (message.headers[":message-type"] === "exception") {
          const type = message.headers[":exception-type"] ?? "unknown";
          const detail = new TextDecoder().decode(message.payload).slice(0, 500);
          throw new ProviderError(STREAM_EXCEPTIONS[type] ?? "unavailable", `Bedrock stream ${type}: ${detail}`);
        }
        const event = message.headers[":event-type"];
        const data = parseJson(message.payload, `Bedrock ${event} event`);

        if (event === "contentBlockStart") {
          const tool = (data.start as { toolUse?: { toolUseId: string; name: string } } | undefined)?.toolUse;
          if (tool) toolCalls.set(data.contentBlockIndex as number, { id: tool.toolUseId, name: tool.name, json: "" });
        } else if (event === "contentBlockDelta") {
          const delta = data.delta as { text?: string; toolUse?: { input?: string } } | undefined;
          if (typeof delta?.text === "string" && delta.text.length > 0) {
            produced = true;
            yield { type: "text", text: delta.text };
          }
          const call = toolCalls.get(data.contentBlockIndex as number);
          if (call && typeof delta?.toolUse?.input === "string") call.json += delta.toolUse.input;
        } else if (event === "contentBlockStop") {
          const call = toolCalls.get(data.contentBlockIndex as number);
          if (call) {
            toolCalls.delete(data.contentBlockIndex as number);
            const input = call.json === ""
              ? {}
              : parseJson(new TextEncoder().encode(call.json), `Arguments for tool "${call.name}"`);
            produced = true;
            yield { type: "toolUse", id: call.id, name: call.name, input };
          }
        } else if (event === "messageStop") {
          stop = data.stopReason as string;
        } else if (event === "metadata") {
          const u = data.usage as { inputTokens?: number; outputTokens?: number } | undefined;
          usage = { inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0 };
        }
      }
    }
    decoder.end();

    if (stop === undefined) throw new ProviderError("malformed", "Bedrock stream ended without a messageStop event");
    if (REFUSALS.has(stop)) throw new ProviderError("refused", `The model declined to answer (${stop})`);
    if (toolCalls.size > 0) throw new ProviderError("malformed", "Bedrock stream ended inside a tool call");
    const stopReason = STOP_REASONS[stop];
    if (!stopReason) throw new ProviderError("malformed", `Unknown stop reason "${stop}"`);
    if (!produced) throw new ProviderError("empty", "The model finished without text or a tool call");
    yield { type: "done", stopReason, usage };
  } catch (cause) {
    if (cause instanceof ProviderError) throw cause;
    if (cause instanceof EventStreamError) throw new ProviderError("malformed", cause.message);
    if (cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
      throw new ProviderError("timeout", `Bedrock did not finish within ${config.timeoutMs ?? 60_000} ms`);
    }
    throw new ProviderError("unavailable", `Could not reach Bedrock: ${(cause as Error).message}`);
  }
}

import { assertEquals, assertRejects } from "@std/assert";
import { encodeMessage } from "./eventStream.ts";
import { type ProviderConfig, ProviderError, streamTurn, type TurnEvent, type TurnRequest } from "./provider.ts";

const enc = new TextEncoder();
const event = (type: string, data: unknown) =>
  encodeMessage({ ":message-type": "event", ":event-type": type, ":content-type": "application/json" }, enc.encode(JSON.stringify(data)));
const exception = (type: string, message: string) =>
  encodeMessage({ ":message-type": "exception", ":exception-type": type }, enc.encode(JSON.stringify({ message })));

/** A 200 response whose body delivers the frames in small uneven chunks. */
function streamed(frames: Uint8Array[], chunkSize = 7): Response {
  const all = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const f of frames) {
    all.set(f, at);
    at += f.length;
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < all.length; i += chunkSize) controller.enqueue(all.slice(i, i + chunkSize));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: Array<() => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fn = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`unexpected call ${calls.length}`);
    return Promise.resolve(next());
  }) as typeof fetch;
  return { fn, calls };
}

const config = (f: typeof fetch, extra: Partial<ProviderConfig> = {}): ProviderConfig => ({
  apiKey: "test-key", region: "us-east-1", modelId: "us.test.model-v1:0", fetch: f, retryDelayMs: 0, ...extra,
});
const hello: TurnRequest = { messages: [{ role: "user", parts: [{ text: "Hello" }] }] };

async function collect(gen: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
async function failure(gen: AsyncGenerator<TurnEvent>): Promise<{ error: ProviderError; before: TurnEvent[] }> {
  const before: TurnEvent[] = [];
  const error = await assertRejects(async () => {
    for await (const e of gen) before.push(e);
  }, ProviderError);
  return { error, before };
}

const textReply = [
  event("messageStart", { role: "assistant" }),
  event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "Hi " } }),
  event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "there." } }),
  event("contentBlockStop", { contentBlockIndex: 0 }),
  event("messageStop", { stopReason: "end_turn" }),
  event("metadata", { usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 }, metrics: { latencyMs: 300 } }),
];

Deno.test("streamTurn: text arrives in order, then done with stop reason and usage", async () => {
  const { fn, calls } = fakeFetch([() => streamed(textReply)]);
  const events = await collect(streamTurn(config(fn), {
    system: "Be brief.",
    messages: [{ role: "user", parts: [{ text: "Hello" }] }],
    tools: [{ name: "addReminder", description: "Add a reminder", inputSchema: { type: "object", properties: { title: { type: "string" } } } }],
    maxTokens: 200,
  }));
  assertEquals(events, [
    { type: "text", text: "Hi " },
    { type: "text", text: "there." },
    { type: "done", stopReason: "endTurn", usage: { inputTokens: 12, outputTokens: 5 } },
  ]);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://bedrock-runtime.us-east-1.amazonaws.com/model/us.test.model-v1%3A0/converse-stream");
  assertEquals(calls[0].init.method, "POST");
  assertEquals(calls[0].init.headers, { "Content-Type": "application/json", Authorization: "Bearer test-key" });
  assertEquals(JSON.parse(calls[0].init.body as string), {
    messages: [{ role: "user", content: [{ text: "Hello" }] }],
    inferenceConfig: { maxTokens: 200 },
    system: [{ text: "Be brief." }],
    toolConfig: {
      tools: [{ toolSpec: { name: "addReminder", description: "Add a reminder", inputSchema: { json: { type: "object", properties: { title: { type: "string" } } } } } }],
    },
  });
});

Deno.test("streamTurn: request maps tool calls and tool results; defaults max tokens; omits empty fields", async () => {
  const { fn, calls } = fakeFetch([() => streamed(textReply)]);
  await collect(streamTurn(config(fn), {
    messages: [
      { role: "user", parts: [{ text: "Remind me" }] },
      { role: "assistant", parts: [{ toolUse: { id: "t1", name: "addReminder", input: { title: "Call" } } }] },
      { role: "user", parts: [{ toolResult: { id: "t1", content: "Added" } }, { toolResult: { id: "t2", content: "No access", isError: true } }] },
    ],
  }));
  assertEquals(JSON.parse(calls[0].init.body as string), {
    messages: [
      { role: "user", content: [{ text: "Remind me" }] },
      { role: "assistant", content: [{ toolUse: { toolUseId: "t1", name: "addReminder", input: { title: "Call" } } }] },
      { role: "user", content: [
        { toolResult: { toolUseId: "t1", content: [{ text: "Added" }], status: "success" } },
        { toolResult: { toolUseId: "t2", content: [{ text: "No access" }], status: "error" } },
      ] },
    ],
    inferenceConfig: { maxTokens: 1024 },
  });
});

Deno.test("streamTurn: a tool call is yielded once, with arguments joined across deltas", async () => {
  const { fn } = fakeFetch([() => streamed([
    event("messageStart", { role: "assistant" }),
    event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "One moment." } }),
    event("contentBlockStop", { contentBlockIndex: 0 }),
    event("contentBlockStart", { contentBlockIndex: 1, start: { toolUse: { toolUseId: "tool-1", name: "addReminder" } } }),
    event("contentBlockDelta", { contentBlockIndex: 1, delta: { toolUse: { input: '{"title":"Call ' } } }),
    event("contentBlockDelta", { contentBlockIndex: 1, delta: { toolUse: { input: 'the bank","due":"2026-11-17T09:00"}' } } }),
    event("contentBlockStop", { contentBlockIndex: 1 }),
    event("messageStop", { stopReason: "tool_use" }),
    event("metadata", { usage: { inputTokens: 40, outputTokens: 22 } }),
  ])]);
  assertEquals(await collect(streamTurn(config(fn), hello)), [
    { type: "text", text: "One moment." },
    { type: "toolUse", id: "tool-1", name: "addReminder", input: { title: "Call the bank", due: "2026-11-17T09:00" } },
    { type: "done", stopReason: "toolUse", usage: { inputTokens: 40, outputTokens: 22 } },
  ]);
});

Deno.test("streamTurn: a tool call with no arguments gets an empty object", async () => {
  const { fn } = fakeFetch([() => streamed([
    event("contentBlockStart", { contentBlockIndex: 0, start: { toolUse: { toolUseId: "t", name: "listReminders" } } }),
    event("contentBlockStop", { contentBlockIndex: 0 }),
    event("messageStop", { stopReason: "tool_use" }),
  ])]);
  assertEquals(await collect(streamTurn(config(fn), hello)), [
    { type: "toolUse", id: "t", name: "listReminders", input: {} },
    { type: "done", stopReason: "toolUse", usage: { inputTokens: 0, outputTokens: 0 } },
  ]);
});

Deno.test("streamTurn: 429 then 200 succeeds after exactly one retry", async () => {
  const { fn, calls } = fakeFetch([() => new Response("slow down", { status: 429 }), () => streamed(textReply)]);
  const events = await collect(streamTurn(config(fn), hello));
  assertEquals(events.length, 3);
  assertEquals(calls.length, 2);
});

Deno.test("streamTurn: 429 twice is throttled, with no third attempt", async () => {
  const { fn, calls } = fakeFetch([() => new Response("slow down", { status: 429 }), () => new Response("still", { status: 429 })]);
  const { error, before } = await failure(streamTurn(config(fn), hello));
  assertEquals([error.kind, error.status, before, calls.length], ["throttled", 429, [], 2]);
});

Deno.test("streamTurn: HTTP errors map to their kinds and are not retried", async () => {
  for (const [status, kind] of [[403, "notAuthorized"], [401, "notAuthorized"], [400, "invalidRequest"], [404, "invalidRequest"], [408, "timeout"], [500, "unavailable"], [503, "unavailable"]] as const) {
    const { fn, calls } = fakeFetch([() => new Response("detail", { status })]);
    const { error } = await failure(streamTurn(config(fn), hello));
    assertEquals([error.kind, error.status, calls.length], [kind, status, 1]);
  }
});

Deno.test("streamTurn: a throttle inside the stream is thrown after the text already sent, without retry", async () => {
  const { fn, calls } = fakeFetch([() => streamed([
    event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "Partial" } }),
    exception("throttlingException", "Too many tokens"),
  ])]);
  const { error, before } = await failure(streamTurn(config(fn), hello));
  assertEquals([error.kind, before, calls.length], ["throttled", [{ type: "text", text: "Partial" }], 1]);
});

Deno.test("streamTurn: stream exceptions map to their kinds", async () => {
  for (const [type, kind] of [["validationException", "invalidRequest"], ["modelStreamErrorException", "unavailable"], ["internalServerException", "unavailable"], ["serviceUnavailableException", "unavailable"], ["somethingNew", "unavailable"]] as const) {
    const { fn } = fakeFetch([() => streamed([exception(type, "x")])]);
    assertEquals((await failure(streamTurn(config(fn), hello))).error.kind, kind);
  }
});

Deno.test("streamTurn: a content filter stop is a refusal, not a reply", async () => {
  for (const stopReason of ["content_filtered", "guardrail_intervened"]) {
    const { fn } = fakeFetch([() => streamed([
      event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "I" } }),
      event("messageStop", { stopReason }),
    ])]);
    const { error, before } = await failure(streamTurn(config(fn), hello));
    assertEquals([error.kind, before], ["refused", [{ type: "text", text: "I" }]]);
  }
});

Deno.test("streamTurn: finishing with no text and no tool call is empty", async () => {
  const { fn } = fakeFetch([() => streamed([
    event("messageStart", { role: "assistant" }),
    event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "" } }),
    event("messageStop", { stopReason: "end_turn" }),
  ])]);
  const { error, before } = await failure(streamTurn(config(fn), hello));
  assertEquals([error.kind, before], ["empty", []]);
});

Deno.test("streamTurn: unparseable tool arguments are malformed and the call is never yielded", async () => {
  const { fn } = fakeFetch([() => streamed([
    event("contentBlockStart", { contentBlockIndex: 0, start: { toolUse: { toolUseId: "t", name: "addReminder" } } }),
    event("contentBlockDelta", { contentBlockIndex: 0, delta: { toolUse: { input: '{"title": ' } } }),
    event("contentBlockStop", { contentBlockIndex: 0 }),
    event("messageStop", { stopReason: "tool_use" }),
  ])]);
  const { error, before } = await failure(streamTurn(config(fn), hello));
  assertEquals([error.kind, before], ["malformed", []]);
});

Deno.test("streamTurn: a stream that ends early, mid-frame or without messageStop, is malformed", async () => {
  const cut = event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "Hi" } });
  const midFrame = fakeFetch([() => streamed([cut.subarray(0, cut.length - 5)])]);
  assertEquals((await failure(streamTurn(config(midFrame.fn), hello))).error.kind, "malformed");
  const noStop = fakeFetch([() => streamed([cut])]);
  const { error, before } = await failure(streamTurn(config(noStop.fn), hello));
  assertEquals([error.kind, before], ["malformed", [{ type: "text", text: "Hi" }]]);
});

Deno.test("streamTurn: an unknown stop reason is malformed", async () => {
  const { fn } = fakeFetch([() => streamed([
    event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "Hi" } }),
    event("messageStop", { stopReason: "brand_new_reason" }),
  ])]);
  assertEquals((await failure(streamTurn(config(fn), hello))).error.kind, "malformed");
});

Deno.test("streamTurn: a call that outlasts the timeout is a timeout", async () => {
  const fn = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
    })) as typeof fetch;
  const { error } = await failure(streamTurn(config(fn, { timeoutMs: 20 }), hello));
  assertEquals(error.kind, "timeout");
});

Deno.test("streamTurn: a network failure is unavailable", async () => {
  const fn = (() => Promise.reject(new TypeError("connection refused"))) as typeof fetch;
  const { error } = await failure(streamTurn(config(fn), hello));
  assertEquals([error.kind, error.message], ["unavailable", "Could not reach Bedrock: connection refused"]);
});

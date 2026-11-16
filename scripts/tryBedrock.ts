// A live, streamed call to Bedrock through the provider module, with timings.
//
//   AWS_BEARER_TOKEN_BEDROCK=... BEDROCK_MODEL_ID=... deno run --allow-env --allow-net scripts/tryBedrock.ts
//
// BEDROCK_REGION defaults to us-east-1. Nothing is stored; the key is read from the environment only.
import { ProviderError, streamTurn } from "../supabase/functions/_shared/provider.ts";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Set ${name} first.`);
    Deno.exit(2);
  }
  return value;
}

const config = {
  apiKey: required("AWS_BEARER_TOKEN_BEDROCK"),
  modelId: required("BEDROCK_MODEL_ID"),
  region: Deno.env.get("BEDROCK_REGION") ?? "us-east-1",
};

const started = performance.now();
let firstText: number | undefined;
try {
  for await (const event of streamTurn(config, {
    system: "You are a voice agent. Answer in one short spoken sentence.",
    messages: [{ role: "user", parts: [{ text: "Remind me to call the bank tomorrow at nine." }] }],
    tools: [{
      name: "addReminder",
      description: "Add a reminder for the user.",
      inputSchema: { type: "object", properties: { title: { type: "string" }, due: { type: "string" } }, required: ["title"] },
    }],
    maxTokens: 200,
  })) {
    if (event.type === "text") {
      firstText ??= performance.now() - started;
      console.log(`text      ${JSON.stringify(event.text)}`);
    } else if (event.type === "toolUse") {
      console.log(`toolUse   ${event.name} ${JSON.stringify(event.input)}`);
    } else {
      console.log(`done      ${event.stopReason}, ${event.usage.inputTokens} in / ${event.usage.outputTokens} out`);
    }
  }
  console.log(`first text after ${firstText === undefined ? "n/a" : Math.round(firstText) + " ms"}; finished after ${Math.round(performance.now() - started)} ms`);
} catch (error) {
  if (error instanceof ProviderError) {
    console.error(`${error.kind}: ${error.message}`);
    Deno.exit(1);
  }
  throw error;
}

# Air Agents

Consumer iOS app plus a Supabase backend. Background agents work on the user's accounts; every
write waits for a human yes, given by nod (AirPods head tracking), Lock Screen, or Face ID for
the riskiest actions. Agents sit at fixed positions around the head in spatial audio.

The hackathon prototype lives in a separate repo (Spatial-Agents) and is frozen. Carry ideas
and code forward from it; never edit it.

## Architecture (decided)

- Model: Claude on AWS Bedrock. Speech: Sarvam where a hosted service is needed. No ElevenLabs.
- Integrations: Composio, called only through one tools module. Apple services connect on the device.
- Backend: Supabase, fresh project. Four edge functions (`turn`, `approvals`, `connections`,
  `runs`) over `_shared/` modules. Nothing outside the provider module knows which model vendor is used.
- Approvals: a Postgres state machine (pending, approved, denied, expired, executing, executed,
  failed, unknown) changed only through stored procedures callable by the service role. Direct
  table writes are denied. Every write, including phone tools, gets an action row first.
- Execution is at most once. A write is never retried automatically; a stuck one becomes `unknown`
  and the user is told.
- Tier three (irreversible or external) needs Face ID, proven by a Secure Enclave signature from
  a device key enrolled with App Attest plus vouching by an existing device.
- The spoken summary of a request is built by the server from the real tool arguments, never by the agent.
- One tool registry (JSON) generates the Swift and TypeScript sides; CI fails if they differ.
- Observability: Sentry plus an append-only events table.

## Conventions

- camelCase everywhere, including Postgres columns (quoted) and tool names. No serialization layer.
- Errors fail loudly. No empty catch, no fallback data, no `?? []` over a failed fetch.
- Tests land with the change. Functions are tested at the HTTP route with mocked providers;
  every returned field checked, before and after state on updates.
- UI follows DESIGN.md. Regular font weight only. SF Symbols for icons.
- TypeScript in functions, Swift 6 in the app, pnpm for any web tooling.

## Run

See README.md.

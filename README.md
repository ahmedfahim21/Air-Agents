# Air Agents

Agents that work across your accounts while you get on with your day. They sit around your
head, speak from where they sit, and never act without your nod.

Early scaffold. Nothing here talks to a model or an account yet.

## Layout

```
ios/
  AirAgents/        the app: SwiftUI screens only
  AirAgentsCore/    Swift package, no UIKit: gestures, geo, approval client, models
  project.yml       XcodeGen spec for the app
supabase/
  functions/        edge functions (Deno) and their shared modules
.github/workflows/  CI: swift test and deno test on every PR
DESIGN.md           visual, sound and gesture language
TODOS.md            deferred work
```

## Run the tests

Core package (needs Xcode with its licence accepted, or any Swift 6 toolchain that ships Swift Testing):

```bash
swift test --package-path ios/AirAgentsCore
```

Functions (needs Deno 2):

```bash
cd supabase/functions && deno test
```

Live call to the model (needs a Bedrock API key and the model id; nothing is stored):

```bash
AWS_BEARER_TOKEN_BEDROCK=... BEDROCK_MODEL_ID=... deno run --allow-env --allow-net scripts/tryBedrock.ts
```

## Run the app

Needs Xcode, XcodeGen and iOS 26. Set `DEVELOPMENT_TEAM` in `ios/project.yml` to your own team first.

```bash
brew install xcodegen
```

```bash
cd ios && xcodegen generate && open AirAgents.xcodeproj
```

## AI tools

Built with Claude Code.

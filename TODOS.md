# TODOs

## Mac relay for coding agents (deferred)

- What: a Mac companion that sends Claude Code permission prompts to the phone, where they are
  heard and answered like any other request.
- Why: approving coding agents away from the desk was the original idea behind the project.
- Why deferred: end-to-end encryption (decided) means the server cannot build the spoken summary
  or pick a risk tier, so the Mac and phone would need their own copy of that logic.
- Depends on: the approval engine and device keys shipping first.
- Context: the hackathon Mac app (Spatial-Agents repo, `Sources/Agentsphere/PermissionServer.swift`)
  already binds approvals to a hash of the exact tool call.

## Live captions for conversations (not decided)

- Every request is already shown as text; ordinary conversation is not.

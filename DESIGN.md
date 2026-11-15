# Design

Air Agents is heard more than it is seen. Sound, speech and gesture are designed with the same
care as the screen. Visual reference: the "Spatial Agents iOS" design canvas (artboards for
With me, Conversation, Focus, Onboarding, and the character system).

## Screen

- Native iOS, light. Background `systemGroupedBackground` (#F2F2F7), surfaces white, separators
  `rgba(60,60,67,0.29)`, secondary text `rgba(60,60,67,0.6)`.
- Ink (black) is the only interface accent. Colour belongs to the agents.
- Type: SF Pro, regular weight only. Hierarchy comes from size and ink versus grey, never from
  weight. (The design canvas still shows 600 and 700 weights; this rule replaces them.)
- Buttons: the filled black capsule is the one primary action on a screen; the grey capsule is
  secondary. 50 pt tall, full width at the bottom of a screen. Touch targets at least 44 pt.
- Icons: SF Symbols only.
- Motion: critically damped springs (snappy 0.3 s for state, smooth 0.42 s for movement, lively
  only for a physical moment such as a hop). Nothing appears from nothing. Reduce Motion stills
  the characters.
- Loading: skeleton rows, never a spinner on an empty page.
- Empty states: one sentence, and one action only if it works right now.
- Errors: say what failed and offer Retry. Partial results say how many succeeded.
- Dead UI is a bug: a control that cannot work is hidden or disabled.

## Agents (the cast)

8 colours × 5 shapes. Flat body, diagonal gradient, two ink eyes. Still in lists; eyes move only
when the agent is paying attention to you.

| Colour | Hex | | Shape |
|--------|-----|-|-------|
| Cyan | #36D1DC | | circle |
| Orange | #FF8A5B | | hexagon |
| Violet | #A78BFA | | squircle |
| Green | #4ADE80 | | capsule |
| Pink | #F472B6 | | drop |
| Yellow | #FACC15 | | |
| Blue | #60A5FA | | |
| Red | #F87171 | | |

Expressions: far, finding, arrived, focused, awake, speaking, listening, thinking, ended, error.

## Navigation

Four tabs: With me (opens first), Places, Activity, Agents. Settings sits behind a profile button
on With me. Requests waiting on you are pinned at the top of With me, with a count badge on the tab;
the section is hidden when there are none.

## Gestures

Each gesture has one meaning, everywhere.

| Gesture | Meaning |
|---------|---------|
| Turn toward an agent | Pick it |
| Double nod | Yes; with nothing pending, wake the agent |
| Double shake | No. Never ends a conversation |
| Look away and hold about 2 s | End the conversation |
| Tilt toward a shoulder | Say that again |

Every gesture has a touch control. Voice can refuse ("no", "stop") and ask to repeat, but can
never approve. Settings has a switch to turn head gestures off.

## Speaking first: knock

An agent never speaks unasked. It knocks: a short tone from its position plus a light tap. It
speaks only if you turn to it or nod within about five seconds; otherwise the request goes to the
Lock Screen. No knock during a call or while recording. Under a Focus, only requests about to
expire may knock. Music is lowered for the knock, not paused.

## Requests

Spoken in a fixed order: who, does what, to whom ("Inbox wants to send an email to Priya"). Then
the listening tone opens a six-second answer window. No answer: it repeats once, then waits on the
Lock Screen. Requests expire after 10 minutes if they came from a live conversation, 24 hours if
from a background run. "Nod to allow, shake to refuse" is spoken until you have answered five.

Requests are spoken in the agent's own voice, so the knock and listening tones are the only marks
of a verified request. Agents can never play either tone.

The approval sheet, Lock Screen notification and Live Activity show the same sentence:

1. The agent's character and name.
2. The sentence, largest text.
3. Details: recipient, account, full outgoing text (scrolls).
4. Deny (grey capsule) and Approve (black capsule).

Buttons stay disabled until the full text has been shown. Tier three: the button reads "Approve
with Face ID" and one plain line above it says what cannot be undone. No red, no warning icons.

## Briefing

After the knock, each agent with news says one line from its position, agents with requests
first. Turn to an agent and nod to hear its items one at a time. The roll call stays under about
20 seconds; everything else is on Activity.

## Sounds

Every sound plays from the agent's position with a matching haptic. Short tones in one family; no
speech in any of them.

| Sound | When | Haptic |
|-------|------|--------|
| Knock | Agent wants you (reserved) | Light tap |
| Listening | Answer window opens (reserved) | None |
| Awake | Agent wakes, G5 → D6 | Firm tap |
| Done | Approved and carried out | Success |
| Declined | You refused | Light tap |
| Expired | A request ran out | None |
| Problem | Something failed, E5 → B4 | Failure |
| Arrived | You reached a placed agent, chime | Three taps |
| Focused | Facing an agent, soft tick | Light tap |

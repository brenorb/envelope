# Envelope verification

| Skill | What it checks | Tool |
| --- | --- | --- |
| [verify-envelope-opener](../../.claude/skills/verify-envelope-opener/SKILL.md) | Launch state reaches only the verified target; one link mounts one target | TLA+ / TLC, 9 states |
| [verify-envelope-fragment](../../.claude/skills/verify-envelope-fragment/SKILL.md) | Every encodable link opens to the same request; corrupted links are refused | 3,000 generated links per run against `src/fragment.js` |

The opener model found two bugs, now fixed with tests:

1. **State posted to a navigated frame.** Every iframe `load` re-posted the launch state with target origin `'*'`. After a user followed a link inside a napplet, the next page received the state (commit a1111b0).
2. **Repeated open requests remounted the target.** A second `opener.open` resolved the pointer again and replaced a target that already had its state (commit c166475).

## Open an Envelope link

Generated with pstack `/statechart` from [OpenLink.tla](flows/open-link/OpenLink.tla) ([TLC report](flows/open-link/report.md)). The chart leaves out the wrong-password retry, which stays on the password screen.

```mermaid
---
title: "Open an Envelope link"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: open
    lg1: stopped
    lg2: working
  }
  class lg0 teal
  class lg1 orange
  class lg2 blue
  s0: Envelope loading
  s1: Opener reading the link
  s2: Not a valid Envelope link
  s3: Asking for the link password
  s4: Fetching and verifying the napplet
  s5: Napplet could not open
  s6: Napplet running with its state
  s7: Left the napplet, state not sent
  [*] --> s0
  s0 --> s1: the opener napplet starts
  s1 --> s2: the link does not decode
  s1 --> s3: the link is encrypted
  s1 --> s4: the link is public
  s3 --> s4: you enter the password
  s4 --> s5: the napplet is missing or fails verification
  s4 --> s6: the verified napplet loads
  s6 --> s7: you follow a link inside the napplet
  class s0 blue
  class s1 blue
  class s2 orange
  class s3 blue
  class s4 blue
  class s5 orange
  class s6 teal
  class s7 teal
```

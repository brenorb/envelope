---
name: verify-envelope-opener
description: Check that the Envelope host posts a link's launch state only to the verified target it mounted, and mounts that target once per link. Use when changing createOpener in src/opener.js (onMessage, load, resolveAndMount, mountTarget, the iframe load listener, generations) or the sandbox and srcdoc handling of mounted frames.
---

# Verify the Envelope opener

**Properties.** `StateOnlyToTarget`: the launch state, and the raw fragment, reach only the verified srcdoc the host mounted. `OneMountPerLink`: one link resolves and mounts its target once.

**Harm if broken.** State from a link, possibly from an encrypted `nwe1` fragment, is posted with target origin `'*'` to whatever page a sandboxed frame navigated to. Or a target that already received its state is replaced mid-use.

## Run

```sh
export TLA2TOOLS=/absolute/path/to/tla2tools.jar   # TLC 1.7.4 release
export JAVA=/path/to/java                          # Java 11 or later
bash scripts/verification/check-model.sh .claude/skills/verify-envelope-opener/model/Opener.tla
bash scripts/verification/check-model.sh .claude/skills/verify-envelope-opener/model/Opener.tla --mutant
node --test test/opener.test.js
```

The model must pass (9 distinct states). The `--mutant` run replays the code before commits a1111b0 and c166475 and must report a violation. With one rule per config it reports `StateOnlyToTarget` (mount, load, navigate out, load again) and `OneMountPerLink` (two `opener.open` requests both resolve). The tests "the launch state is posted once per mounted frame" and "one link resolves and mounts its target once" replay those paths on the real code. Read every TLC result with the pstack `/statechart` skill.

## Coverage

Synced with the code at commit `c166475`. Move this forward only after you confirm that the model still describes the code at the new commit.

| Model step | Code (`src/opener.js`) |
| --- | --- |
| `AskOpen` | `onMessage` for `opener.open` from the bootstrap frame, `openAccepted` |
| `Resolved` | `resolveAndMount` → `resolver.resolve` → `mountTarget` |
| `FrameLoads` | the `load` listener in `mountTarget` and its `posted` flag |
| `NavigateOut` | the browser: a sandboxed frame without `allow-same-origin` is opaque to the host |

## Not covered

Hash changes (the generation check discards stale resolutions, but the model checks one link), the shell host's `registerFrame`, the Paja resolver's own verification, and a target that reloads itself: after the fix it gets no second `opener.init`.

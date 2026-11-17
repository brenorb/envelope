------------------------------- MODULE Opener -------------------------------
\* The Envelope host (src/opener.js createOpener) opening one link. The host
\* mounts the opener napplet, which asks to open a pointer; the host resolves
\* and mounts the verified target, then posts the launch state to it.
\*   Boot        -> load(): mountTarget(bootstrap)
\*   AskOpen     -> onMessage 'opener.open' from the bootstrap frame
\*                  (the opener may send it more than once)
\*   Resolved(i) -> resolveAndMount: resolver.resolve returns, mountTarget
\*   FrameLoads  -> the iframe 'load' listener posts opener.init with '*'
\*   NavigateOut -> the user follows a link inside the sandboxed target, so
\*                  the frame now holds a page that is not the verified target
\* Broken = TRUE is the code before the fix: every 'load' posted the state,
\* and every 'opener.open' from the bootstrap frame started a resolution.
EXTENDS Naturals

CONSTANT Broken

VARIABLES gen, role, pending, mounts, doc, sentTo, opened, loads

vars == <<gen, role, pending, mounts, doc, sentTo, opened, loads>>

Init ==
  /\ gen = 1
  /\ role = "bootstrap"     \* what the host mounted: "bootstrap" or "target"
  /\ pending = 0            \* resolutions in flight for this generation
  /\ mounts = 0             \* targets mounted in this generation
  /\ doc = "opener"         \* what the frame shows: opener, target, foreign
  /\ sentTo = {}            \* documents that received this link's state
  /\ opened = FALSE         \* the host accepted an opener.open this generation
  /\ loads = 0              \* 'load' events of the mounted target frame

AskOpen ==
  /\ role = "bootstrap" /\ pending < 2
  /\ Broken \/ ~opened
  /\ pending' = pending + 1 /\ opened' = TRUE
  /\ UNCHANGED <<gen, role, mounts, doc, sentTo, loads>>

Resolved ==
  /\ pending > 0
  /\ pending' = pending - 1
  /\ role' = "target" /\ doc' = "target" /\ mounts' = mounts + 1 /\ loads' = 0
  /\ UNCHANGED <<gen, sentTo, opened>>

\* The fixed listener posts the state on the frame's first load only; the
\* host cannot see which document a sandboxed frame holds.
FirstLoad == loads = 0

FrameLoads ==
  /\ role = "target" /\ loads < 3
  /\ sentTo' = IF Broken \/ FirstLoad THEN sentTo \cup {doc} ELSE sentTo
  /\ loads' = loads + 1
  /\ UNCHANGED <<gen, role, pending, mounts, doc, opened>>

NavigateOut ==
  /\ role = "target" /\ doc = "target" /\ loads > 0
  /\ doc' = "foreign"
  /\ UNCHANGED <<gen, role, pending, mounts, sentTo, opened, loads>>

Idle == pending = 0 /\ UNCHANGED vars

Next == AskOpen \/ Resolved \/ FrameLoads \/ NavigateOut \/ Idle

Spec == Init /\ [][Next]_vars

\* The launch state reaches only the verified target bytes.
StateOnlyToTarget == sentTo \subseteq {"target"}

\* One link mounts its target once, so the target starts with its state once.
OneMountPerLink == mounts <= 1
=============================================================================

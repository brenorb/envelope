------------------------------ MODULE OpenLink ------------------------------
\* Opening an Envelope link or QR code in the browser, as the visitor sees it.
VARIABLES screen, stateWith

vars == <<screen, stateWith>>

Init == screen = "loading" /\ stateWith = "nobody"

OpenerReads == screen = "loading" /\ screen' = "reading" /\ UNCHANGED stateWith
BadLink == screen = "reading" /\ screen' = "invalid" /\ UNCHANGED stateWith
NeedsPassword == screen = "reading" /\ screen' = "password" /\ UNCHANGED stateWith
WrongPassword == screen = "password" /\ screen' = "password" /\ UNCHANGED stateWith
RightPassword == screen = "password" /\ screen' = "resolving" /\ UNCHANGED stateWith
PublicLink == screen = "reading" /\ screen' = "resolving" /\ UNCHANGED stateWith
NotVerified == screen = "resolving" /\ screen' = "failed" /\ UNCHANGED stateWith
TargetReady == screen = "resolving" /\ screen' = "running" /\ stateWith' = "target"
FollowLink == screen = "running" /\ screen' = "elsewhere" /\ UNCHANGED stateWith

Done == screen \in {"invalid", "failed", "elsewhere"} /\ UNCHANGED vars

Next == OpenerReads \/ BadLink \/ NeedsPassword \/ WrongPassword \/ RightPassword
        \/ PublicLink \/ NotVerified \/ TargetReady \/ FollowLink \/ Done

Spec == Init /\ [][Next]_vars

\* The link's state only ever reaches the verified napplet.
StateStaysWithTarget == stateWith \in {"nobody", "target"}
=============================================================================

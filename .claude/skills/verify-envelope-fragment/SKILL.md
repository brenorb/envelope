---
name: verify-envelope-fragment
description: Run generated launch links through the real Envelope fragment codec to check that every link Envelope can encode opens to the same request and that corrupted links are refused cleanly. Use when changing src/fragment.js (encodeFragment, decodeFragment, the encrypted nwe1 format, size limits, pointer or intent validation).
---

# Verify the Envelope fragment codec

**Properties**, checked on the real `src/fragment.js`:

- `EncodedLinksOpen`: whatever `encodeFragment` accepts, `decodeFragment` reads back as the same pointer and JSON state, and `validateLaunchRequest` accepts it.
- `CorruptLinksRefused`: a link with one changed character either decodes to a valid request or throws an `Error`.
- `EncryptedRoundTrip`: a password-protected link opens with its password and is refused with another.

**Harm if broken.** A link someone shared or printed as a QR code can never open, or a damaged link crashes the opener instead of showing an error.

## Run

```sh
node .claude/skills/verify-envelope-fragment/check-fragment.mjs 3000 1
```

The arguments are the number of generated links and the seed. It prints `all fragment rules hold`. Change the seed for new inputs.

## Able to fail

Change the decoder's state limit in `createFragmentDecoder` from `> maxStateBytes` to `> maxStateBytes - 64`: `EncodedLinksOpen` fails on states close to the limit. Restore the file afterwards.

## Coverage

Synced with the code at commit `c166475`. Covered: `encodeFragment`, `decodeFragment`, `validateLaunchRequest`, `encodeEncryptedFragment`, `decodeEncryptedFragment`. Not covered: launch intents (`intent`), fragments over `MAX_FRAGMENT_LENGTH` built by hand, and the opener napplet's own decoding in `src/opener-napplet.js`.

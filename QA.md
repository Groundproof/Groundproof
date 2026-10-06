# V0.2 QA report · 2026-10-06

## Review status

**Draft PR. Do not merge/publish until browser/device acceptance is completed.** The implementation and executable QA suite are ready for review, but this environment could not execute real-browser tests. No claim is made that all acceptance criteria passed or that smartphone capture is already validated.

## Executed

- `node --check app.js` and `node --check ledger.js`: passed on Node 24.19.0.
- `node --test tests/core.mjs`: **32 passed, 0 failed**.
- Tests cover IDs, URL ambiguity/malformed input, standard SHA-256, deterministic serialization, state transitions, separate original/ledger hashes, per-identity verification, and inconsistent changes to human notes, identity, sequence, predecessors, entry/original hashes, original/preview Blob bytes, MIME, head/count, missing records, deleted tail, schema/version, timestamps and dimensions.
- Pre-decode byte/format/empty input validation and readable quota/storage error mapping tested.
- Static assertions check network restriction, explicit file fallback, timing hook, no unsafe `innerHTML` assignments, and no remote scripts/styles.
- Adversarial boundary test confirms that a fully rewritten, consistently rehashed local chain **passes**: hashing is not protection against someone with full local storage control.
- Read-only code review checked atomic IndexedDB writes, comparison of expected head inside the write transaction, chain isolation, safe `textContent` rendering, originals vs derivatives, double-save guard, stale photo-selection generation guard, input retention on save failure, legacy preservation and absence of app networking.

Core fixtures deliberately contain synthetic Blob bytes: they test the integrity protocol, not native image decoding or IndexedDB behavior.

## Browser suite prepared, execution blocked

`tests/qa.cjs` is designed for Chromium and WebKit at a 390×844 mobile viewport. It exercises real DOM + file inputs + native IndexedDB: captures, reload, second capture, identity separation, offline operation after load, original hashing, resizing, chronological history, literal HTML note rendering, large/corrupt/SVG input, simulated quota transaction abort/retry, concurrent writers, corrupted legacy data, altered ledger, invalid IDs, blocked storage, no horizontal overflow, and no external requests/unhandled errors.

Attempt: `NODE_PATH=<runtime node_modules> node tests/qa.cjs`.

Blocked before first test: Playwright's browser executable was not installed. Attempted `playwright install chromium webkit`; the browser archive download failed with `End of central directory record signature not found`, so no browser engine could launch. This is recorded as **not run**, not passed. No paid tooling/service was used and no host permissions were escalated.

The quota test simulates a native transaction abort with `QuotaExceededError`; actual device-full / browser-eviction behavior still requires device QA. Chromium/WebKit headless tests also cannot certify the native iPhone camera UI or real QR handling.

## Open acceptance gates

| Gate | Status |
| --- | --- |
| URL ID grammar / invalid IDs | Core passed; UI navigation pending browser execution |
| Camera and explicit picker fallback | Markup reviewed; real phone required |
| Original evidence and chain integrity | Core passed; real upload/persistence integration pending |
| Second capture / separate ID histories / reload | Code reviewed; executable browser tests pending |
| Actual capture time and <10s target | Post-commit timing implemented; device measurement required |
| Quota rollback / retry / concurrent tabs | Code reviewed and browser tests provided; execution pending |
| Native image decode/resize and 48MP rejection | Browser tests pending |
| Legacy malformed storage / XSS UI / narrow viewport | Code reviewed; browser tests pending |
| No third-party runtime / no paid component | Source reviewed; no purchases or external services |

Follow README's real-iPhone sequence and run both browser engines before promoting this draft to ready for merge.

## Material technical risks / deliberate limits

1. Originals are retained alongside compressed display images. This preserves inspectable original evidence but **does not reduce total bytes below original-file storage**. Browser quota remains a real constraint.
2. There is no backup/full-ledger export, user authentication, encryption implemented by the app, cloud sync or persistent-storage guarantee. Browser eviction/cleanup may remove the only local history. Original downloads are per entry.
3. Integrity validation rereads/hashes all evidence for the selected identity; long histories are O(total bytes), use memory and can exceed the 10-second goal. Native decoding happens before pixel-dimension rejection; malicious large-dimension files may exhaust memory despite the 20 MiB preflight limit.
4. Browser/OS photo picker behavior and HEIC support vary; explicit fallback and useful errors do not replace a real iPhone test. "Original" means bytes provided to this browser, not guaranteed original sensor output.
5. Device time and user statements are untrusted; no independent anchor or signature exists. Full chain rewrite, consistent truncation, copied IDs and deletion cannot be reliably detected.
6. Data is origin/browser specific. A copied URL/QR on another device does not transfer its history. Cold-start offline is not supported.
7. Legacy `gp_proofs` is retained without automatic migration and is excluded from the new history. The historical ZIP remains in the repository but is not the deployment source.
8. A static host sees the URL/Physical ID request. Original image EXIF/GPS is retained locally. Use disposable test data and non-sensitive IDs for V0.1.

## Product risk

V0.2 now exposes the intended lifecycle rather than asking testers to infer it from a photo ledger: expected scope/quantity → Assess → Count → Build → Yield → planned-vs-documented outcome. Stage and optional actual quantity are human-confirmed and attached to the same evidence history. The comparison is deliberately arithmetic, not AI-derived, and the UI says so.

This is sufficient for a **concept/product-journey test**, not for a production claim. It still does **not** automatically infer quantities, correctness, quality, cost savings or completion from imagery. The critical validation remains whether this continuous expected-vs-physical-reality record changes a real decision or saves enough effort versus ordinary photos/forms. If testers only understand the value after verbal explanation, V0.2 fails.

## V0.2 acceptance additions

- Landing screen states the user outcome before Physical ID mechanics.
- Assess / Count / Build / Yield are visible as one lifecycle and every capture records a lifecycle stage.
- A case can hold expected scope and planned quantity locally.
- A capture can hold a human-confirmed actual quantity and unit.
- History visually identifies lifecycle stage and keeps Original Evidence separate.
- Planned vs documented quantity produces a visible delta with an explicit human-confirmed/no-auto-measurement boundary.
- No cloud AI, paid API, tracker or new runtime dependency was introduced.
- Real mobile/browser execution remains the release gate; static/code review is not represented as device validation.

## Changes found and addressed during review

- Replaced LocalStorage/base64 photo persistence with atomic binary IndexedDB records.
- Removed unsafe interpolated history HTML in favor of DOM/text nodes.
- Preserved actual original bytes; marked compressed imagery as derived and gave each its own hash.
- Added shape/chain/blob verification and write blocking on inconsistent data.
- Added expected-head concurrency check and single-save UI guard.
- Removed destructive demo-reset UI to avoid accidental loss of the new ledger.
- Made no-photo, unsupported/large-image, unavailable storage and quota outcomes explicit.
- Corrected all integrity claims to local consistency/provenance limits.

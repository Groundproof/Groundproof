# GroundProof · Product Prototype V0.3

A CHF 0, local-browser **Physical Reality Ledger** product prototype. V0.2 keeps the V0.1 evidence/integrity foundation but moves the test surface toward the intended end product: **Assess → Count → Build → Yield → planned-vs-documented outcome**. This extends the original `index.html` prototype: the existing Start → Physical ID → Capture → History screens and small mobile stylesheet remain the foundation. CSS and JavaScript are now separated for review and QA. No framework, runtime dependencies, build step, account, API, AI, ERP, database server, analytics or upload.

**Flow:** Projekt/Arbeitsbereich oder QR öffnen → Auftrag/Soll optional festhalten → dominanten „Foto aufnehmen“-Button nutzen → bei Bedarf Arbeitsschritt, Menge, Einheit oder Notiz ergänzen → speichern → Verlauf/Soll-Ist ansehen.

V0.3 incorporates direct construction-user feedback: no English product-model vocabulary in the primary UI; no cryptic Physical-ID language; camera action is visually dominant; technical/legal integrity details use progressive disclosure; quantities are optional and trade-neutral (e.g. m, m², Stück, kg, Liter, Stunden).

V0.2 deliberately does **not** pretend to perform AI vision or automatic measurement. The prototype tests whether the end-to-end product concept makes sense before any paid/cloud AI is introduced. Quantities and scope are human-confirmed; the UI labels this boundary. The differentiating hypothesis is the continuous expected → actual → execution → outcome record, not photo-to-quote alone.

Count, Build and Yield are future applications of this same ledger, not separate products. V0.1 is not a ticket system or a photo archive: every capture is associated with an explicit identity, confirmed change, resulting state and predecessor.

## Run / smartphone test

Serve these static files on HTTPS (e.g. existing GitHub Pages after review/merge), or use localhost for desktop QA:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/?id=GP-WALL-001`. Web Crypto needs a secure context. Opening `index.html` as a `file:` attachment is not supported. Plain HTTP to a LAN IP on a phone is not equivalent to localhost.

A QR code can encode the final HTTPS URL plus `?id=GP-WALL-001`. No in-app scanner is required. Another example is `?id=GP-MAT-002`. IDs are case-sensitive, 1–64 ASCII letters/numbers/hyphens/underscores, beginning with a letter or number. Empty, repeated or invalid `id` parameters are rejected rather than silently using a demo object. With no parameter, the identity picker opens. Links are generated from the current deployment path, so project Pages paths work.

The QR is a label, not verified physical authentication. A copied QR or incorrect label can point to the wrong real-world object. The same ID on another device opens a separate, initially empty local ledger.

## Architecture

| File | Responsibility |
| --- | --- |
| `index.html` | Existing four-screen flow, accessible labels, camera/picker, local-prototype notice |
| `styles.css` | Extracted original mobile styles plus readable history and errors |
| `app.js` | Screen state, safe DOM rendering, photo selection, timing, history |
| `ledger.js` | ID validation, hashes, photo derivative, IndexedDB, verification and atomic append |
| `tests/core.mjs` | Dependency-free integrity and validation tests |
| `tests/qa.cjs` | Dev-only Playwright adversarial acceptance suite |
| `QA.md` | Executed checks, limitations and manual device gate |

The original `GroundProof_V0.1.zip` in the repository is a **historical archive**, not the current app. Deploy the root static files. The archive is deliberately left unchanged.

## Data model (schema version 1)

IndexedDB database: `groundproof-v01-ledger`.

| Layer | Record / fields | Meaning |
| --- | --- | --- |
| Physical Identity | `identities`: `id`, `version`, `createdAt`, `count`, `headHash` | Stable identity and locally verifiable chain head |
| Original Evidence | `evidence`: `[physicalId, sequence]`, `original` Blob; entry `originalEvidence`: `sha256`, `bytes`, `mime` | Exact file bytes received from the browser, hashed before transformation |
| Human-confirmed facts | Entry `human`: `change`, `state`, `note`, `confirmedAt` | Explicit confirmation via save button; not machine-verified truth |
| Derived data | Entry `derived`: source/preview dimensions, compressed-preview size/MIME/hash, transformation identifier; separate `preview` Blob | Lossy display derivative, never labelled as the original |
| Ledger entry | `entries`: `[physicalId, sequence]`, `version`, `createdAt`, above metadata, `previousHash`, `hash` | Append-only through the UI, one chain per Physical ID |

`updated`, `unchanged`, `installed`, `added`, `removed`, `problem` replace the old material-specific status dropdown. Labels are shown in German. `unchanged` retains the previous confirmed state. On a first capture it explicitly says there is no previous state for comparison. Other choices set a simple corresponding human-confirmed state; the optional note adds detail. No quantity, quality, completeness, open-problem resolution or economic value is inferred. In particular, a later non-problem event does not prove an earlier problem was resolved.

All records use device timestamps. Sequence number, not wall-clock time, defines history order (the device clock may move backwards).

## Integrity and provenance boundary

1. SHA-256 hashes the **original file bytes** as received from the file picker/camera. The OS/browser may already have converted an image; this is not a sensor-raw or capture-authenticity claim.
2. The original Blob is preserved unchanged. Canvas produces a separate JPEG preview at up to 1600px on the longest side, quality 0.78; its bytes have a different hash.
3. The entry hash covers all entry fields except `hash`, including original/preview hashes, the Physical ID, sequence, human confirmation, timestamp and previous hash. Serialization recursively sorts object keys; arrays retain order; UTF-8 bytes are hashed.
4. First predecessor is `GENESIS`. Every later entry refers to the previous entry hash **within the same Physical ID**.
5. Opening an identity and appending verify record shapes, sequence, state rules, chain links, stored head, both Blob hashes, sizes and MIME types. A mismatch blocks further writes for that identity and does not display its history as confirmed.
6. Appending writes identity/head, evidence and entry in a single IndexedDB transaction. A head/count comparison within that write transaction detects competing tabs. No asynchronous hashing occurs inside the write transaction. Errors abort without a partial entry; existing input remains available for retry.

Hashing is solely an **Integrity/Provenance Mechanism for local consistency**. It provides no legal evidentiary guarantee, trusted identity, trusted timestamp, verified location, physical presence, correctness of statements or external anchor. A person controlling browser storage can replace evidence, recompute the entire chain/head, delete its tail consistently or delete the database undetectably. Validation detects inconsistent changes, not an adversary able to rewrite all local data. There is no cryptographic signature and no external trusted witness.

## Photo/storage policy and privacy

- Camera input uses `capture="environment"`. Its behavior is an OS/browser hint; explicit second file input without `capture` provides a file-picker fallback. No `getUserMedia`, camera streaming or permission polling.
- Accept JPEG, PNG and WebP. HEIC, SVG and unsupported/undecodable input get a readable error. On iPhone choose/export JPEG if Safari does not supply a supported format.
- Limit each input to 20 MiB and decoded resolution to 48 megapixels. Size is checked before hashing/decoding. Pixel count is checked after native image decoding; an extreme malicious compressed image can still pressure the decoder before that check. This is a local prototype, not a hardened media ingestion service.
- **Deliberate tradeoff:** originals are not lossily compressed, because doing so would destroy original evidence. Display derivatives are compressed before persistence. Keeping original + preview uses more storage than storing just a compressed image. V0.1 favors inspectable original evidence; it does not claim storage savings for the total dataset.
- IndexedDB stores binary Blobs (no base64 expansion / LocalStorage photo quota). Capacity is browser/device dependent. Quota aborts are handled explicitly; there is no fixed browser-storage-capacity promise. No automatic deletion of earlier captures.
- There is no persistent-storage grant request or backup/sync. Browser cleanup, private browsing, storage eviction, lost devices or changed origin may lose history. Do not use this prototype as the sole copy of important evidence. Download original evidence from each history entry; full ledger export/import is outside V0.1.
- Photos and metadata remain in this origin's browser storage. Original files may contain EXIF/GPS metadata, retained unchanged and included in downloaded originals. Shared devices/profile access can expose the data. No account protection or encryption at rest is implemented by the app.
- Only static HTML/CSS/JS/icon files are fetched. No CDNs, fonts, trackers or uploads. `connect-src 'none'` prohibits app fetch/XHR/WebSocket calls. Once loaded, capture/storage/history work offline. **Cold-start/reload offline is not promised**: no service worker or offline installation. A static host still receives ordinary page requests, including the Physical ID in the URL. Referrer policy is `no-referrer`.
- New ledger does not trust or migrate `gp_proofs` LocalStorage. If present, a notice appears; its raw value remains untouched even if malformed. Old records lack separate original-file hashes and must not silently acquire new integrity claims. To archive legacy data before clearing browser storage, copy the `gp_proofs` value in browser developer tools. The new count/history excludes legacy records.

## Capture timing

Timer begins at the Capture button handler, including ledger refresh, OS picker/camera time, file preparation, user choice, hashing and saving. It ends **after** the atomic write transaction completes; then the result displays seconds and whether it is below 10 seconds. Failed writes show no success time and keep the timer/input for retry. It uses `performance.now()` (no network/analytics) and is session UI telemetry, not a persisted, trusted ledger fact. Browser/device suspension may affect high-resolution-clock behavior. The <10s value is a test goal, not a guaranteed performance claim. Large originals and long histories take longer because verification reads/hashes every stored evidence item for that identity.

## Acceptance tests

Run dependency-free integrity tests with `node --test tests/core.mjs`. See `QA.md` for actual results and unexecuted gates.

Browser QA requires Playwright and its Chromium/WebKit binaries already installed. They are **test tools only**, not application dependencies:

```sh
# Start the static server in another terminal, then:
node tests/qa.cjs
# Optional: GP_TEST_URL=http://127.0.0.1:8765/ node tests/qa.cjs
```

If Playwright is installed outside normal Node resolution, set `NODE_PATH` to that node_modules directory. No npm install or build is needed to run the app itself.

| Criterion | Check |
| --- | --- |
| Physical ID via URL | Direct-open, no-ID picker, malformed/empty/duplicate/oversized IDs |
| Smartphone photo/fallback | Camera input + picker upload in mobile viewport; actual iPhone camera remains manual gate |
| Independent original hash | Compare entry hash to Node SHA-256 of fixture file; verify unchanged stored Blob |
| Chained entries | Recompute canonical entry hashes, predecessor and head; concurrent appends |
| Second capture / full history | Two confirmations, chronology, previous/current state and original download |
| ID isolation | Open second ID, add capture, reopen first; count/history separate |
| Capture timing | Success appears after persistence and includes elapsed seconds |
| Errors/storage | Byte/pixel limits, unsupported format, undecodable image, quota abort/retry, unavailable storage |
| Legacy/manipulated data | Malformed legacy retained; modified confirmed field/Blob detected; safe text rendering |
| No cloud/network dependency | Capture while offline after load; assert zero third-party requests |
| CHF 0 | Static browser APIs only, no accounts/services purchased |

Before merge/publication, on a real iPhone in Safari:

1. Open the intended HTTPS test URL with `?id=GP-WALL-001`, then take a photo via the camera input, choose “Installiert / ausgeführt” and confirm. Read actual duration.
2. Close/reopen the same link: ID, state, capture count, change and photo must persist in the same browser/profile.
3. Reopen by scanning a normal QR with the phone camera. Add “Keine sichtbare Änderung”; history must show both entries and retained state.
4. Add a changed condition with a brief optional note. Confirm that state/change and previous capture help understand the object over time.
5. Open `?id=GP-MAT-002`; verify empty history, add a capture and return to the first ID.
6. Test picker fallback, camera cancellation, landscape/portrait, supported large photo and original download. Test private-mode restrictions without valuable data.
7. Repeat normal short capture at least 5 times; record measured times. No automated upload test certifies a real camera round-trip or the <10s target.

## Fail-fast product test

Ask the tester: **“Welche wirtschaftlich relevante Information erzeugt GroundProof aus einem Capture, die ein normales Foto + Zeitstempel nicht liefert?”**

V0.1 explicitly adds identity-scoped retrieval, a human-labelled change, a confirmed state and a predecessor/history. Whether these improve a real purchasing/stock/build/inspection decision is **unproven**. Compare the same task with a phone photo album + timestamp + object name. Record whether the tester can answer what changed, where, and which action/decision follows, with less effort. If there is no useful decision/time/cost benefit, a functioning ledger is not product validation. No economic information is fabricated by hashing; no automation has been added to force a positive answer.

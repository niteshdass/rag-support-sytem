# QA Test Report — SupportPilot

**Date:** 2026-05-07  
**Tester:** Claude Code (automated browser QA)  
**Branch:** main  
**API:** http://localhost:3000  
**Web:** http://localhost:5173  
**Credentials used:** `admin@acme-saas.com` / `demo1234` / tenant `acme-saas`

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 5 |
| Medium   | 6 |
| Low      | 8 |
| **Total**| **19** |

Pages tested: Login, Dashboard, Documents, Document Detail, Upload, Paste, Sources, Activity, Chat, Settings, User Menu, Protected routes.

---

## Bugs

### HIGH

---

#### B1 — Dashboard is a placeholder

**Page:** `/`  
**Steps:** Log in → land on dashboard  
**Expected:** Summary of knowledge base, recent activity, quick stats  
**Actual:** Renders only the text `"Placeholder — dashboard content goes here."`  
**File:** [web/src/pages/Dashboard.tsx](web/src/pages/Dashboard.tsx)

---

#### B2 — Meilisearch and Qdrant not managed by PM2

**Page:** Any page that triggers search or RAG  
**Steps:** Start app via `pm2 start ecosystem.config.cjs` (as documented) → go to Documents → type in search box  
**Expected:** Search works  
**Actual:** `500 Internal Server Error` from `MeilisearchRequestError: Request to http://localhost:7700/indexes/.../search has failed`. Both `qdrant` and `meilisearch` blocks are commented out in `ecosystem.config.cjs`. They must be started manually, which is not documented in README.  
**File:** [ecosystem.config.cjs](ecosystem.config.cjs) — qdrant/meilisearch entries commented out  
**Impact:** Search broken out-of-the-box; first-run developer gets 500s with no explanation.

---

#### B3 — Document search returns wrong/stale results

**Page:** `/documents`  
**Steps:** Type `refund` in search box  
**Expected:** Documents with "refund" in title or content  
**Actual:** Returns `test-upload.txt` (a test file containing the word "refund") but misses `30 day refund policy`, `Refund Policy`, `Refund Policy Internal` — all of which are in MongoDB. Most documents seeded while Meilisearch was offline were never indexed.  
**Root cause:** Meilisearch index is only populated when documents are processed with Meilisearch running. No re-index job runs on startup.  
**File:** [src/jobs/ingestUpload.ts](src/jobs/ingestUpload.ts), [src/domain/ingestion/uploadHandler.ts](src/domain/ingestion/uploadHandler.ts)

---

#### B4 — Chat: LLM ignores retrieved context, returns fallback phrase

**Page:** `/chat`  
**Steps:** Ask "What is the refund policy?"  
**Expected:** Answer citing the refund policy document (which exists in the knowledge base)  
**Actual:** API returns `"I don't have that information."` with `citations: []` even though `retrievedContexts` in the response contains the relevant chunk (`"Customers can request refunds within 30 days"`).  
**Root cause:** When Ollama is unreachable, the LLM client returns a canned fallback response rather than passing the retrieved context to an available provider (Groq/Gemini).  
**File:** [src/infra/llm/client.ts](src/infra/llm/client.ts), [src/domain/rag/generator.ts](src/domain/rag/generator.ts)

---

#### B5 — Chat: ~98 second response time when Ollama is down

**Page:** `/chat`  
**Steps:** Send any chat message with Ollama not running  
**Expected:** Fast error or automatic fallback to Groq within a few seconds  
**Actual:** Request hangs for ~98 seconds (measured via `performance.getEntriesByType`) before returning. UI shows `"Thinking…"` the entire time with no timeout indicator or cancel button.  
**File:** [src/infra/llm/ollama.ts](src/infra/llm/ollama.ts), [src/infra/llm/client.ts](src/infra/llm/client.ts)  
**Fix direction:** Add a per-provider timeout (e.g. 10s) and fast-fail to the next provider in the chain.

---

### MEDIUM

---

#### B6 — "View" button always disabled for upload/paste documents

**Page:** `/documents` (document list rows)  
**Steps:** View any document of type `upload` or `paste`  
**Expected:** "View" button navigates to document detail or opens file  
**Actual:** Button is disabled and greyed out with no tooltip. Root cause: `DocumentRow` disables the button when `doc.url` is empty, which is always the case for uploads and pastes.  
**File:** [web/src/components/DocumentRow.tsx](web/src/components/DocumentRow.tsx#L44)  
**Fix:** Either navigate to `/documents/:id` for non-URL docs, or hide the button when URL is absent.

---

#### B7 — Login page accessible when already authenticated

**Page:** `/login`  
**Steps:** Log in → manually navigate to `http://localhost:5173/login`  
**Expected:** Redirect to `/` (already authenticated)  
**Actual:** Login form renders normally, user can "re-login" needlessly  
**File:** [web/src/pages/Login.tsx](web/src/pages/Login.tsx) or [web/src/components/ProtectedRoute.tsx](web/src/components/ProtectedRoute.tsx)

---

#### B8 — Duplicate documents in list (no deduplication on upload)

**Page:** `/documents`  
**Observation:** `PhoneGD2.pdf` appears 7+ times in the documents list, all with `Failed` status. Re-uploading the same file creates a new document record each time with no deduplication check.  
**File:** [src/domain/ingestion/uploadHandler.ts](src/domain/ingestion/uploadHandler.ts)  
**Fix:** Check `contentHash` before inserting; upsert or reject duplicate.

---

#### B9 — Seed document content does not match title

**Page:** `/documents/69f9c6498337151ee248732d` ("30 day refund policy")  
**Observation:** The document titled `30 day refund policy` contains content about a JavaScript photo editor modal (`ProfilePhotoEditor.js`). Unrelated content was seeded against the wrong title. This directly harms RAG quality for all queries.  
**File:** [scripts/seed/](scripts/seed/) — fixture mismatch

---

#### B10 — Several documents permanently stuck in "Processing" status

**Page:** `/documents`  
**Observation:** Multiple seeded documents (e.g. `Pricing Guide`, `Security Whitepaper`, `Refund Policy Internal`) show `Processing` status from 5/4/2026. They never transitioned to `ready` or `failed`.  
**Root cause:** Likely processed while Qdrant/Meilisearch were offline; job completed partially but status was not rolled back to `failed`.  
**File:** [src/jobs/ingestUpload.ts](src/jobs/ingestUpload.ts) — missing error/rollback path

---

#### B11 — Login button has no loading/disabled state during submit

**Page:** `/login`  
**Steps:** Click "Sign in"  
**Expected:** Button shows spinner or "Signing in…" and disables to prevent double-submit  
**Actual:** Button remains fully interactive during the API call. User can click multiple times.  
**File:** [web/src/pages/Login.tsx](web/src/pages/Login.tsx)

---

### LOW

---

#### B12 — Login error message has no error styling

**Page:** `/login`  
**Steps:** Enter wrong password → submit  
**Expected:** Red error banner / styled error text  
**Actual:** Error `"Unauthorized"` renders as a plain unstyled `<p>` tag, hard to distinguish from normal text.  
**File:** [web/src/pages/Login.tsx](web/src/pages/Login.tsx)

---

#### B13 — favicon.ico returns 404

**Page:** All pages  
**Observation:** Every page load triggers `GET /favicon.ico → 404`. Browser tab shows no icon.  
**File:** Missing file at [web/public/favicon.ico](web/public/favicon.ico)

---

#### B14 — Sidebar missing "Dashboard" link

**Page:** All authenticated pages  
**Observation:** Sidebar nav lists Chat, Documents, Upload, Paste, Sources, Activity, Settings — but no explicit "Dashboard" link to `/`. Only the "SupportPilot" logo links there.  
**File:** [web/src/components/AppShell.tsx](web/src/components/AppShell.tsx)

---

#### B15 — Activity page confidence slider label inconsistent

**Page:** `/activity`  
**Observation:** Left slider label reads "Min confidence" but right label reads just "Max" (not "Max confidence"). Labels are mismatched.  
**File:** [web/src/pages/Activity.tsx](web/src/pages/Activity.tsx)

---

#### B16 — Source picker modal close button has no accessible name

**Page:** `/sources` → click "+ Add source" → click X  
**Observation:** The modal dismiss button (×) could not be found via `aria-label` or text selectors. No accessible name on the close button.  
**File:** [web/src/pages/Sources.tsx](web/src/pages/Sources.tsx)

---

#### B17 — Password field missing autocomplete attribute

**Page:** `/login`  
**Observation:** Browser console: `Input elements should have autocomplete attributes (suggested: "current-password")`. Prevents password managers from auto-filling correctly.  
**File:** [web/src/pages/Login.tsx](web/src/pages/Login.tsx)

---

#### B18 — React Router v7 future flag warnings on every page load

**Page:** All pages  
**Observation:** Two console warnings on every navigation:  
- `v7_startTransition` future flag not set  
- `v7_relativeSplatPath` future flag not set  
**File:** [web/src/App.tsx](web/src/App.tsx)  
**Fix:** Add `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to `<BrowserRouter>`.

---

#### B19 — "Saved." confirmation text persists indefinitely on Settings page

**Page:** `/settings`  
**Steps:** Change auto-resolve toggle → Save → wait  
**Observation:** The green "Saved." text next to the button stays on screen permanently with no fade-out. Standard UX is to clear it after ~3 seconds.  
**File:** [web/src/pages/Settings.tsx](web/src/pages/Settings.tsx)

---

## What Works

| Feature | Status |
|---------|--------|
| Login with valid credentials | ✅ |
| Login with invalid credentials (shows error) | ✅ |
| Logout + session destroy | ✅ |
| Protected routes redirect to `/login` | ✅ |
| Documents list with pagination (2 pages, 28 docs) | ✅ |
| Document detail page (content + chunks tabs) | ✅ |
| Visibility filter buttons (All / Customer-facing / Internal / Draft) | ✅ |
| Source type + status dropdowns in document filter | ✅ |
| Change visibility modal (radio options with descriptions) | ✅ |
| File upload API (PDF/TXT → chunk → Qdrant) | ✅ |
| Paste text → add to knowledge → redirect to detail | ✅ |
| Sources page listing | ✅ |
| Add source modal (connector picker) | ✅ |
| Activity page renders with filters | ✅ |
| Chat sends message + shows "Thinking…" | ✅ |
| Chat renders response with confidence badge + route | ✅ |
| Settings toggle + slider + save (with confirmation) | ✅ |
| Settings "Save changes" disabled when no changes | ✅ |
| User menu shows name + email | ✅ |

---

## Environment Notes

- Meilisearch and Qdrant must be started manually (`./meilisearch` and `./qdrant`) — not in PM2 config
- Ollama (`llama3.1:8b`) was not running during this test — LLM fell back to a canned response after ~98s timeout
- No `GROQ_API_KEY` set in `.env` — fallback provider also unavailable
- To run RAG properly: start Ollama OR add `GROQ_API_KEY` + set `LLM_PROVIDER=groq` in `.env`

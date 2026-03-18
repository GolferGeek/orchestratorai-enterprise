# Compose: Multimodal File Upload + Customer Service Voice Chat

## Context

The Compose product has a working invoke pipeline (agent list → conversation → POST /invoke → response), but agents are text-only. Two key features need porting from the dev repo:

1. **General Assistant** needs multimodal support — users attach images/PDFs/documents and the LLM analyzes them via vision
2. **Customer Service** needs voice chat — microphone capture → Deepgram STT → agent response → ElevenLabs TTS playback, plus a RAG knowledge base replacing the hardcoded system prompt

The infrastructure already exists: speech endpoints (Deepgram/ElevenLabs), LLM vision support (`generateResponse` accepts `images` param), media storage plane, RAG runner. This plan wires existing infrastructure into the Compose frontend and runners.

---

## Phase 1: Multimodal Backend (Context Runner)

**Goal:** Context family runner accepts `{ message, attachments }` in `data.content` and passes images to LLM vision, documents to text extraction.

### Files to modify:
- `apps/compose/api/src/invoke/runners/context-family.runner.ts` — Add `extractAttachments()` method. Images (PNG/JPG/WEBP/GIF) → `options.images` for LLM vision. PDFs/DOCX/TXT → extract text and prepend to user message.
- `apps/compose/api/src/invoke/runners/family-runners.module.ts` — Import RAG extractors module so context runner can inject PDF/DOCX extractors

### Data contract:
```typescript
// data.content with attachments:
{ message: "What does this say?", attachments: [{ base64: "...", mimeType: "image/png", filename: "photo.png" }] }
// data.content without (backward compatible):
"Hello"
```

### Existing infrastructure to reuse:
- `packages/planes/llm/` — `generateResponse(systemPrompt, userMessage, { images })` already supports vision
- `apps/compose/api/src/rag/extractors/` — PdfExtractorService, DocxExtractorService, TextExtractorService

---

## Phase 2: Multimodal Frontend (File Upload UI)

**Goal:** File picker + drag-drop on MessageInput. Image previews. Base64 encoding. Attachments flow through invoke contract.

### Files to create:
- `apps/compose/web/src/composables/useFileAttachments.ts` — Manages attachment state, base64 conversion, validation (10MB max, 4 files max, accepted MIME types)
- `apps/compose/web/src/components/conversation/FileAttachmentBar.vue` — Thumbnails/chips for pending attachments with remove buttons

### Files to modify:
- `apps/compose/web/src/components/conversation/MessageInput.vue` — Add paperclip button, hidden file input, drag-drop handlers, render FileAttachmentBar. Change emit from `send(string)` to `send({ message, attachments? })`
- `apps/compose/web/src/views/AgentConversationView.vue` — Update `handleSend` to build structured `data.content` when attachments present
- `apps/compose/web/src/services/compose-api.service.ts` — Update `SendMessageRequest` to accept optional attachments
- `apps/compose/web/src/stores/conversation.store.ts` — Add `attachments?` to `ConversationMessage` for display in thread
- `apps/compose/web/src/components/conversation/ConversationThread.vue` — Show attachment chips on user messages

### Supported file types:
- Images: PNG, JPG, WEBP, GIF (→ LLM vision)
- Documents: PDF, DOCX, TXT (→ text extraction → prepended to prompt)

---

## Phase 3: Customer Service RAG + Guest Sessions

**Goal:** Customer service agent uses RAG instead of hardcoded knowledge. Guest session controller for unauthenticated widget access. Voice-mode response condensing.

### Database changes:
- Create `customer-service` RAG collection (embedding: nomic-embed-text, chunk: 1000/200)
- Seed 8 documents: product-overview, agent-types, pricing-tiers, use-cases, getting-started, scheduling-a-demo, faq, contact-information (content from dev repo's system-prompt.ts)
- Update `customer-service` agent: change `agent_type` from `context` to `rag`, set `collection_slug: 'customer-service'`, update `context` field to minimal persona prompt

### Files to create:
- `apps/compose/api/src/customer-service/customer-service.controller.ts` — `@Public()` routes: `POST /customer-service/session` (create guest JWT), `POST /customer-service/converse` (accept guest or Bearer token, build ExecutionContext, delegate to invoke dispatch)
- `apps/compose/api/src/customer-service/customer-service.service.ts` — Guest session JWT signing, rate limit tracking
- `apps/compose/api/src/customer-service/customer-service.module.ts` — NestJS module importing InvokeModule

### Files to modify:
- `apps/compose/api/src/invoke/runners/rag-family.runner.ts` — Add voice-mode condensing: when `metadata?.interactionMode === 'voice'` and response > 360 chars, condense via LLM
- `apps/compose/api/src/app.module.ts` — Register CustomerServiceModule

### Note: Backend constructs ExecutionContext for guest sessions (explicit exception, like Pulse's `createSystemTriggeredContext()`)

---

## Phase 4: Voice Chat Frontend

**Goal:** Microphone capture → STT → agent response → TTS playback. Works for authenticated users and guest widget.

### Files to create:
- `apps/compose/web/src/composables/useVoiceChat.ts` — Voice conversation loop: `startListening()` (MediaRecorder + silence detection via AudioContext/AnalyserNode), `stopListening()` (blob → POST /speech/transcribe → transcript), `speakResponse(text)` (POST /speech/synthesize-stream → Audio playback), state machine (idle/listening/transcribing/speaking)
- `apps/compose/web/src/components/conversation/VoiceChatButton.vue` — Mic button with state-based visual feedback (color + ripple). Emits `send` with transcribed text.
- `apps/compose/web/src/components/customer-service/CustomerServiceWidget.vue` — Embeddable widget: guest session init, ConversationThread, MessageInput + VoiceChatButton, auto-TTS in voice mode

### Files to modify:
- `apps/compose/web/src/components/conversation/MessageInput.vue` — Add voice button slot/prop next to send button
- `apps/compose/web/src/views/AgentConversationView.vue` — For customer-service agent: show VoiceChatButton, pass `interactionMode: 'voice'` in metadata, auto-trigger TTS on response
- `apps/compose/web/src/services/compose-api.service.ts` — Add `speechTranscribe(audioBlob)`, `speechSynthesizeStream(text)`, `createGuestSession()`, `guestConverse()`
- `apps/compose/web/src/stores/conversation.store.ts` — Add `interactionMode: 'text' | 'voice'` ref

### Existing infrastructure to reuse:
- `apps/compose/api/src/speech/speech.controller.ts` — Already has `/speech/transcribe` (Deepgram) and `/speech/synthesize-stream` (ElevenLabs)
- Vite proxy needs `/speech` and `/customer-service` added to proxy config

---

## Dependencies

```
Phase 1 (backend multimodal) → Phase 2 (frontend multimodal)
Phase 3 (CS RAG + backend)   → Phase 4 (CS voice frontend)
```

Phases 1+3 are independent — can run in parallel. Phase 2 needs Phase 1. Phase 4 needs Phase 3.

---

## Verification

### Phase 1+2 (Multimodal):
- Open General Assistant conversation
- Attach a PNG screenshot → send "What does this show?" → LLM describes the image
- Attach a PDF → send "Summarize this" → extracted text is summarized
- Send text-only message → still works (backward compatible)

### Phase 3+4 (Voice):
- `curl POST /customer-service/session` → returns guest session token
- `curl POST /customer-service/converse` with guest token → returns RAG-powered response
- Open Customer Service in Compose → click mic → speak → see transcript + hear TTS response
- Verify voice responses are condensed (< 360 chars)
- Test CustomerServiceWidget standalone (guest mode, no auth)

### Cross-cutting:
- All invoke calls use the standard JSON-RPC 2.0 contract
- ExecutionContext flows whole through all paths
- No new infrastructure directories in the product

# Smart Student Hub v4 — Task Execution Plan

This is the comprehensive, step-by-step checklist to implement the infrastructure and features of Smart Student Hub v4. The project is divided into six execution phases, with absolute state validations required between each phase.

---

## 📋 Task Checklist

### Phase 1: Architecture & SOP Foundation ── [IN PROGRESS]
Establish core architectural principles, write standard operating procedures (SOPs) for the Layer 3 engines, and set up the repository's structural directories.
- [x] Create directory structure: `/architecture`, `/tools`, `/frontend`, `/backend`, `/workers`, `/tests`, `/.tmp`
- [x] Generate system findings blueprint (`findings.md`)
- [x] Draft execution timeline and checklist (`task_plan.md`)
- [x] Establish progress tracker (`progress.md`)
- [ ] Write [Onboarding SOP](/architecture/onboarding_sop.md)
- [ ] Write [Deterministic CGPA Engine SOP](/architecture/cgpa_engine_sop.md)
- [ ] Write [Proportional Spaced Repetition SOP](/architecture/study_engine_sop.md)
- [ ] Write [ASUU Strike Mode SOP](/architecture/strike_mode_sop.md)
- [ ] Write [Offline Sync & Eventual Consistency SOP](/architecture/sync_protocols.md)
- [ ] Write [WhatsApp & Push Notification SOP](/architecture/notification_engine.md)
- [ ] Write [Edge Cases & Recovery Protocols SOP](/architecture/recovery_protocols.md)
- [ ] Write [Production Deployment SOP](/architecture/deployment_architecture.md)

### Phase 2: Layer 3 Deterministic Engine Implementation
Code the pure mathematical and logic calculations in `/tools`. Implement comprehensive test suites in `/tests`.
- [ ] Implement `tools/cgpa.ts` (Deterministic CGPA calculator for 5.0, 4.0, and 7.0 scales)
- [ ] Implement `tools/spaced_rep.ts` (Proportional Spaced Repetition interval scheduler)
- [ ] Implement `tools/strike.ts` (Strike mode toggles, compression multipliers, calendar adjustments)
- [ ] Implement `tools/whatsapp.ts` (WhatsApp-native formatters, text builders, deep link generators)
- [ ] Write Vitest test suites for CGPA engine (`tests/cgpa.test.ts`)
- [ ] Write Vitest test suites for Spaced Repetition (`tests/spaced_rep.test.ts`)
- [ ] Write Vitest test suites for Strike Mode recalculator (`tests/strike.test.ts`)
- [ ] Run test suites and verify 100% test coverage for Layer 3 calculations

### Phase 3: Local Database & Offline-First Core
Set up IndexedDB schema via Dexie.js and build local transactional state hooks using Zustand.
- [ ] Configure `frontend/lib/db.ts` (Dexie.js database schemas & tables initialization)
- [ ] Build the local event outbox `/tools/outbox.ts` to log mutation events
- [ ] Code the in-memory Zustand store `frontend/store/useAcademicStore.ts`
- [ ] Implement UI indicators for active connectivity statuses (Online, Offline, Pending Sync)
- [ ] Create mock seed data to easily test offline state rendering
- [ ] Perform offline write latency validation (Target: UI responds to local writes under 10ms)

### Phase 4: Frontend Development & Premium UX Build
Build the core PWA using Next.js, Tailwind CSS, and Framer Motion. Keep assets ultra-lightweight and performance highly optimized for low-end mobile viewports.
- [ ] Initialize Next.js PWA structure (service worker registrations, manifest configuration)
- [ ] Build layout and premium visual components (calming, academically focused styling)
- [ ] Code the Onboarding flow (university selection, level setting, grading scale selection)
- [ ] Implement Dashboard (elastic calendar countdowns, active course lists, current CGPA cards)
- [ ] Build Spaced Repetition interface (Leitner flashcard review decks, rating buttons)
- [ ] Implement WhatsApp Share widgets (copy study summary, deep link shares)
- [ ] Build strike mode aesthetic overlay and compressed scheduler controls
- [ ] Perform layout optimization for low-end Android browsers (Chrome/Samsung Internet)

### Phase 5: Supabase Integration & Eventual Sync System
Build backend PostgreSQL databases and connect the local Dexie outbox to Supabase via eventual consistency workers.
- [ ] Configure Supabase PostgreSQL schemas and tables matching Dexie declarations
- [ ] Set up Supabase Row Level Security (RLS) policies for secure student access
- [ ] Write Web Worker `workers/sync.worker.ts` for non-blocking mutation queues
- [ ] Code Conflict Resolution logic (Hybrid LWW + Client version validator)
- [ ] Implement network change triggers (`window.addEventListener('online')`)
- [ ] Test sync recovery by toggling browser devtools offline/online during mutations

### Phase 6: End-to-End Validation, PWA & Production Launch
Exhaustive verification of offline transitions, strike disruptions, extreme low battery mode, and deployment configuration.
- [ ] Perform automated test suite passes (ensure 100% compliance)
- [ ] Conduct manual visual check on mobile/PWA layout scaling
- [ ] Test full service-worker caching strategies (ensure all static pages load offline)
- [ ] Execute production compile (`npm run build` validation)
- [ ] Deploy staging build on Vercel
- [ ] Set up Paystack test integrations (payments gateway verification)
- [ ] Deliver final system walkthrough and onboarding guide

---

## ⚡ Validation Protocols
1.  **Engine Absolute Determinism:** Engine algorithms must match verified mathematical models (e.g. no floating-point discrepancies in CGPA calculations).
2.  **Zero Loss Recovery:** If device network fails in the middle of active writing, no records are dropped. Local state matches WAL contents.
3.  **Low-Bandwidth Optimized:** Build outputs must contain compressed JSON payloads and highly optimized static caching strategies.

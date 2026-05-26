# Smart Student Hub v4 — Project Constitution

## Identity

Smart Student Hub is an offline-first academic operating system built exclusively for Nigerian university students.

A web-first Progressive Web App (PWA) that combines:

* intelligent study planning
* proportional spaced repetition
* real-time CGPA intelligence
* ASUU-aware academic adaptation
* WhatsApp-native coordination
* offline-first resilience

into one unified academic companion.

This system is infrastructure — not a productivity gimmick.

---

# North Star

Build the definitive academic operating system for Nigerian university students — improving academic consistency, resilience, and graduation outcomes through intelligent systems designed specifically for the realities of Nigerian higher education.

---

# Core Product Principles

## The system must be:

* deterministic
* reliable
* offline-capable
* low-bandwidth optimized
* mobile-first
* emotionally safe
* academically precise
* Nigerian-context aware

---

# The system must NEVER:

* guilt students
* fabricate academic information
* hallucinate deadlines
* estimate CGPA inaccurately
* silently modify schedules
* depend entirely on internet access

---

# Platform Definition

TYPE:
Offline-first Progressive Web App (PWA)

SUPPORTED DEVICES:

* Android browsers
* iPhone Safari
* Desktop browsers
* Tablets

INSTALL METHOD:
Add to Home Screen

NO NATIVE MOBILE APPS IN V1.

---

# Technical Stack

FRONTEND:

* Next.js
* Tailwind CSS
* Framer Motion

BACKEND:

* Supabase
* PostgreSQL
* Supabase Auth
* Supabase Realtime

LOCAL STORAGE:

* IndexedDB
* Dexie

STATE MANAGEMENT:

* Zustand

ANALYTICS:

* PostHog

PAYMENTS:

* Paystack

NOTIFICATIONS:

* Firebase Web Push

HOSTING:

* Vercel

EDGE/CACHING:

* Cloudflare

---

# A.N.T Architecture

## Layer 1 — Architecture

Location:
`/architecture`

Contains:

* SOPs
* behavioral rules
* business logic
* edge cases
* recovery protocols

Rule:
If logic changes, SOP must update first.

---

## Layer 2 — Navigation

Decision-routing intelligence layer.

Responsibilities:

* route workflows
* call tools
* orchestrate actions
* enforce rules
* validate outputs

Navigation NEVER performs deterministic calculations directly.

---

## Layer 3 — Tools

Location:
`/tools`

Contains:

* deterministic scripts
* atomic functions
* sync workers
* validators
* CGPA engines
* notification dispatchers

Rules:

* tools must be testable
* tools must be deterministic
* tools must never hallucinate
* tools must support retries

---

# AI Governance Rules

## LLMs MAY:

* explain
* summarize
* prioritize
* recommend
* guide onboarding
* generate study advice
* adapt tone

## LLMs MAY NOT:

* calculate official CGPA
* fabricate schedules
* mutate academic records
* invent deadlines
* override deterministic systems

All academic calculations must be deterministic.

---

# Nigerian Context Rules

The system MUST support:

* ASUU strikes
* compressed semesters
* unstable internet
* inconsistent electricity
* low-end Android devices
* low RAM environments
* limited data budgets
* intermittent connectivity

---

# Offline-First Rule

The platform must remain operational without internet access.

OFFLINE AUTHORITY:
Local device state

CLOUD AUTHORITY:
Supabase PostgreSQL

SYNC MODEL:
Eventual consistency

RULE:
The user must never lose academic progress because of connectivity failure.

---

# Sync Philosophy

OFFLINE FIRST.
CLOUD EVENTUALLY CONSISTENT.
USER NEVER BLOCKED.

---

# Core System Modules

## Academic Engine

* semesters
* GPA/CGPA
* courses
* grading logic

## Study Engine

* proportional spaced repetition
* adaptive scheduling
* strike recovery planning
* exam countdowns

## Coordination Engine

* WhatsApp-native sharing
* group study
* accountability systems

## Intelligence Engine

* AI summaries
* adaptive recommendations
* academic insights

## Offline Engine

* local cache
* reconciliation queue
* conflict resolution
* retry logic

---

# Deterministic Rule

Critical academic logic must NEVER depend on LLM reasoning.

INCLUDING:

* CGPA calculations
* semester progression
* grading systems
* credit unit totals
* prerequisite validation

These belong in deterministic tools only.

---

# UX Philosophy

The product must feel:

* calm
* premium
* intelligent
* stable
* focused
* lightweight
* academically serious

NOT:

* noisy
* childish
* gimmicky
* motivational-spammy
* Silicon Valley hype-driven

---

# Project Folder Structure

smart-student-hub/
│
├── claude.md
├── task_plan.md
├── findings.md
├── progress.md
├── .env
│
├── architecture/
│   ├── onboarding_sop.md
│   ├── study_engine_sop.md
│   ├── cgpa_engine_sop.md
│   ├── strike_mode_sop.md
│   ├── sync_protocols.md
│   ├── notification_engine.md
│   ├── recovery_protocols.md
│   └── deployment_architecture.md
│
├── frontend/
├── backend/
├── workers/
├── tests/
├── tools/
└── .tmp/

---

# Recovery Loop

When a failure occurs:

1. Analyze the failure
2. Read logs
3. Patch deterministically
4. Retest
5. Update SOP documentation
6. Prevent recurrence

No guessing allowed.

---

# Payload Philosophy

The system is only complete when:

* the payload is validated
* sync is successful
* user-facing state is stable
* offline recovery is confirmed

---

# Strategic Positioning

CATEGORY:
Academic Operating System

PRIMARY MARKET:
Nigerian Universities

CORE DIFFERENTIATOR:
Infrastructure-grade academic intelligence built specifically for Nigerian higher education realities.

This is NOT a generic AI app.

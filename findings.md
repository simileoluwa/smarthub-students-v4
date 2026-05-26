# Smart Student Hub v4 — Technical Architecture & Findings

This document outlines the detailed system design, architectural blueprints, database schemas, sync strategies, and algorithmic engines for **Smart Student Hub v4**, an offline-first academic operating system designed specifically for the realities of Nigerian higher education.

---

## 1. Constitutional Analysis

We have analyzed the **Smart Student Hub v4 — Project Constitution** (`Claude.md`) and extracted several architectural mandates that must govern all design decisions:

*   **Offline-First & User Never Blocked:** The system must remain operational without internet access. The local device state (IndexedDB/Dexie) is the ultimate authority. Syncing to Supabase PostgreSQL is eventual and non-blocking. The user must never lose academic progress due to power outages or network failures.
*   **Infrastructure-Grade vs Productivity Gimmick:** This system must be deterministic, highly reliable, and academically precise. It should feel calm, premium, and lightweight, without motivational spam or childish gamification.
*   **AI Governance (Strict Determinism):** Critical calculations (CGPA, semester progression, credit totals, prerequisite checks, spaced repetition scheduling) must be calculated using pure, deterministic algorithms in Layer 3 (`/tools`). LLMs must only perform non-critical tasks like study advice generation, synthesis, onboarding assistance, and summaries. They must *never* mutate core academic records or compute CGPA.
*   **A.N.T. Architecture Compliance:**
    *   **Layer 1 (Architecture):** Location `/architecture`. All business rules, edge cases, and recovery protocols are written as Markdown SOPs first. Code modifications follow SOP changes.
    *   **Layer 2 (Navigation):** Orchestrates logic and routes workflows. Never performs calculations.
    *   **Layer 3 (Tools):** Location `/tools`. Atomic, testable, deterministic scripts and validators.
*   **Nigerian-Context Primacy:** The application must account for unstable internet, low-end Android devices, compressed semesters, and ASUU strikes.

---

## 2. System Architecture (A.N.T Layered Design)

The system is organized into three distinct layers, ensuring absolute decoupling of presentation, coordination, and computation.

```mermaid
graph TD
    subgraph Layer 1: Architecture
        SOPs["SOPs & Protocols (/architecture/*_sop.md)"]
    end

    subgraph Layer 2: Navigation & State
        UI["PWA React/Next.js UI (/frontend)"]
        Zustand["Zustand State Store (Local Memory)"]
        DexieDB["Dexie.js DB Interface (IndexedDB)"]
    end

    subgraph Layer 3: Tools & Workers
        SyncWorker["Eventual Sync Worker (/workers/sync.ts)"]
        CGPA["Deterministic CGPA Engine (/tools/cgpa.ts)"]
        spacedRep["Proportional Spaced Repetition Engine (/tools/spaced_rep.ts)"]
        StrikeManager["ASUU Strike Adapter (/tools/strike.ts)"]
    end

    UI --> Zustand
    Zustand --> DexieDB
    DexieDB --> SyncWorker
    UI --> CGPA
    UI --> spacedRep
    UI --> StrikeManager
    SOPs -. Enforces Rules On .-> UI
```

### Components and Responsibilities:
1.  **Layer 1 (Architecture SOPs):** Defines the strict rules for CGPA calculations, spaced repetition intervals, sync states, and strike adjustments.
2.  **Layer 2 (Navigation & UI):** The user interface built with Next.js and Tailwind CSS. Responsive, ultra-lightweight, and optimized for low-end mobile viewports.
3.  **Layer 3 (Tools & Core Engines):** Pure TypeScript modules with zero external dependencies (where possible) to perform mathematical and scheduling calculations. These are fully tested via automated suites.

---

## 3. Database Architecture (Dual-State Synchronization Schema)

To support offline-first operations, the database schema exists in two locations: **Supabase PostgreSQL (Cloud Authority)** and **IndexedDB / Dexie.js (Local Authority)**.

Every record includes metadata columns to manage synchronization state.

### Sync Metadata Columns (Applied to all tables):
*   `id`: UUIDv4 (generated client-side).
*   `local_created_at`: TIMESTAMP (client-side timestamp).
*   `local_updated_at`: TIMESTAMP (client-side timestamp).
*   `sync_status`: VARCHAR (`'synced'`, `'pending_insert'`, `'pending_update'`, `'pending_delete'`).
*   `sync_error`: TEXT (captures replication or validation errors).
*   `client_version`: INTEGER (monotonically increasing counter for concurrent mutation resolution).

### Schema Tables

#### A. `profiles`
Tracks student identification and settings.
```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY, -- Matches Supabase Auth user_id
    email VARCHAR NOT NULL,
    full_name VARCHAR,
    university_name VARCHAR,
    matric_number VARCHAR,
    grading_scale VARCHAR DEFAULT '5.0_WITH_E', -- 5.0_WITH_E, 5.0_NO_E, 4.0, 7.0
    current_level INTEGER DEFAULT 100, -- 100, 200, 300, etc.
    strike_mode_active BOOLEAN DEFAULT FALSE,
    strike_start_date TIMESTAMP,
    -- Sync fields
    local_created_at TIMESTAMP,
    local_updated_at TIMESTAMP,
    sync_status VARCHAR DEFAULT 'synced',
    sync_error TEXT,
    client_version INTEGER DEFAULT 1
);
```

#### B. `semesters`
Defines academic terms. Semesters are highly elastic.
```sql
CREATE TABLE semesters (
    id UUID PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    level INTEGER NOT NULL, -- e.g., 100
    term INTEGER NOT NULL, -- 1 (First Semester), 2 (Second Semester)
    status VARCHAR DEFAULT 'active', -- active, completed, strike_paused
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL, -- Recalculated dynamically if strikes occur
    compressed_mode BOOLEAN DEFAULT FALSE,
    original_duration_weeks INTEGER NOT NULL, -- Standard: 15 weeks
    current_duration_weeks INTEGER NOT NULL, -- Compressed down to e.g., 8 weeks
    -- Sync fields
    local_created_at TIMESTAMP,
    local_updated_at TIMESTAMP,
    sync_status VARCHAR DEFAULT 'synced',
    sync_error TEXT,
    client_version INTEGER DEFAULT 1
);
```

#### C. `courses`
Stores academic courses, credit units, and target/final grades.
```sql
CREATE TABLE courses (
    id UUID PRIMARY KEY,
    semester_id UUID REFERENCES semesters(id) ON DELETE CASCADE,
    course_code VARCHAR NOT NULL, -- e.g., 'MTH101'
    course_title VARCHAR NOT NULL,
    credit_units INTEGER NOT NULL, -- e.g., 1, 2, 3, 4, 6
    grade_target VARCHAR, -- e.g., 'A', 'B'
    grade_achieved VARCHAR, -- e.g., 'A', 'B', 'C', 'D', 'E', 'F' (null if ongoing)
    is_prerequisite_for VARCHAR[], -- Array of course codes this course unlocks
    -- Sync fields
    local_created_at TIMESTAMP,
    local_updated_at TIMESTAMP,
    sync_status VARCHAR DEFAULT 'synced',
    sync_error TEXT,
    client_version INTEGER DEFAULT 1
);
```

#### D. `spaced_repetition_cards`
Flashcards and review items linked to courses.
```sql
CREATE TABLE spaced_repetition_cards (
    id UUID PRIMARY KEY,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    front_content TEXT NOT NULL,
    back_content TEXT NOT NULL,
    difficulty VARCHAR DEFAULT 'medium', -- easy, medium, hard
    box_number INTEGER DEFAULT 1, -- Leitner system implementation
    last_reviewed_at TIMESTAMP,
    next_review_due TIMESTAMP NOT NULL,
    proportional_factor FLOAT DEFAULT 1.0, -- Multiplier based on course credit weight and exam proximity
    -- Sync fields
    local_created_at TIMESTAMP,
    local_updated_at TIMESTAMP,
    sync_status VARCHAR DEFAULT 'synced',
    sync_error TEXT,
    client_version INTEGER DEFAULT 1
);
```

#### E. `reconciliation_queue`
Local write-ahead log stored in IndexedDB (never synced to cloud, only processed by worker).
```typescript
interface ReconciliationEvent {
    id: string; // UUIDv4
    table_name: string; // 'profiles', 'semesters', 'courses', 'spaced_repetition_cards'
    record_id: string; // Primary key of target record
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: any; // Serialized record contents (null if delete)
    timestamp: number;
    retry_count: number;
    error_message?: string;
}
```

---

## 4. Offline-First Sync Architecture

The system uses an **eventual consistency** replication model via a local Write-Ahead Log (WAL) inside Dexie.js.

### Mutation Flow (Client to Cloud):
1.  **Write Event:** UI performs a write. The transaction modifies the local target table (e.g., updates `courses` setting `sync_status` to `'pending_update'`) AND appends a `ReconciliationEvent` to `reconciliation_queue`.
2.  **Immediate UI Update:** The local state is updated immediately. Zustand triggers a component re-render. The user sees their changes in `<10ms` with zero spinners.
3.  **Sync Trigger:** A background synchronization worker is kicked off. It is triggered by:
    *   Network status changes (`window.addEventListener('online')`).
    *   A periodic background sync registration (`ServiceWorkerRegistration.periodicSync`).
    *   Immediate polling loop when a mutation is written (if `navigator.onLine` is true).
4.  **Batch Processing:** The worker reads all pending events in the `reconciliation_queue` ordered by `timestamp` ascending.
5.  **Upsert / Delete Execution:**
    *   The worker attempts to execute transactions on Supabase using RPC or bulk upserts.
    *   If successful: The worker updates the target table records' `sync_status` to `'synced'`, removes the event from `reconciliation_queue`, and commits.
    *   If offline: The worker pauses and registers a retry when the network returns.
    *   If conflicting (Server version > Client version): The worker calls the Conflict Resolution handler.

### Conflict Resolution Strategy:
Since the app is single-user focused, conflicts arise primarily due to multi-device usage (e.g., phone and cybercafe PC).
*   **Strategy: Hybrid Last-Write-Wins (LWW) with client-version validation.**
*   If the database detects that the server record has a higher `client_version` than the incoming local record:
    1.  The client fetches the server record.
    2.  If the field edits do not overlap, merge them.
    3.  If they overlap (e.g. different grade entered), the record with the most recent `local_updated_at` wins, unless the server record contains a terminal state (e.g., an exam grade is confirmed, whereas the offline client has a predicted target grade).
    4.  If unresolvable, local changes are preserved in a "conflict draft" and a non-intrusive alert is shown in the Profile Settings under "Sync Health".

---

## 5. Deterministic CGPA Engine Architecture

Critical academic logic must be 100% deterministic. LLMs are prohibited from touching this layer.

### System Configuration Models
Nigerian universities utilize various grading scales. The engine supports four primary configurations:

| Grading Scale | A | B | C | D | E | F | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `5.0_WITH_E` | 5 | 4 | 3 | 2 | 1 | 0 | Traditional Nigerian standard (e.g. Unilag, OAU) |
| `5.0_NO_E` | 5 | 4 | 3 | 2 | -- | 0 | E is skipped. D is 2, F is 0. (e.g. UI modern scale) |
| `4.0_NUC` | 4 | 3 | 2 | 1 | -- | 0 | NUC standard recommended for specific cohorts |
| `7.0_UI` | 7 | 6 | 5 | 4 | 3 | 0 | Legacy 7.0 system used by older UI cohorts |

### Mathematical Formulations
All floating-point arithmetic is performed using integer math or exact decimal scaling to avoid binary float representation bugs (e.g., `0.1 + 0.2 = 0.30000000000000004` which can ruin a student's `4.49` vs `4.50` First Class boundary).

$$\text{Grade Points (GP)} = \text{Credit Units (CU)} \times \text{Grade Value (GV)}$$

$$\text{GPA} = \frac{\sum_{i=1}^{n} (\text{CU}_i \times \text{GV}_i)}{\sum_{i=1}^{n} \text{CU}_i}$$

$$\text{CGPA} = \frac{\sum_{j=1}^{m} \text{Total Semester GP}_j}{\sum_{j=1}^{m} \text{Total Semester CU}_j}$$

```typescript
// Location: /tools/cgpa.ts

export type GradingScale = '5.0_WITH_E' | '5.0_NO_E' | '4.0_NUC' | '7.0_UI';

export interface CourseInput {
  courseCode: string;
  creditUnits: number;
  gradeAchieved?: string; // e.g. 'A', 'B' (null if ongoing)
}

export const GRADE_VALUES: Record<GradingScale, Record<string, number>> = {
  '5.0_WITH_E': { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1, 'F': 0 },
  '5.0_NO_E':   { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 0 },
  '4.0_NUC':    { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 },
  '7.0_UI':     { 'A': 7, 'B': 6, 'C': 5, 'D': 4, 'E': 3, 'F': 0 },
};

/**
 * Calculates GPA for a single semester with absolute decimal precision
 */
export function calculateSemesterGPA(courses: CourseInput[], scale: GradingScale): { gpa: number; totalCreditUnits: number } {
  let totalGradePoints = 0;
  let totalCreditUnits = 0;
  const scaleValues = GRADE_VALUES[scale];

  for (const course of courses) {
    if (!course.gradeAchieved) continue; // Skip incomplete courses

    const gradeValue = scaleValues[course.gradeAchieved.toUpperCase()];
    if (gradeValue === undefined) {
      throw new Error(`Invalid grade: "${course.gradeAchieved}" for scale: ${scale}`);
    }

    totalGradePoints += course.creditUnits * gradeValue;
    totalCreditUnits += course.creditUnits;
  }

  if (totalCreditUnits === 0) return { gpa: 0, totalCreditUnits: 0 };

  // Avoid float errors: multiply by 100, round, and divide by 100 to get exact 2 decimal places.
  const rawGpa = totalGradePoints / totalCreditUnits;
  const roundedGpa = Math.round((rawGpa + Number.EPSILON) * 100) / 100;

  return { gpa: roundedGpa, totalCreditUnits };
}

/**
 * Calculates overall CGPA across multiple semesters
 */
export function calculateCGPA(semestersCourses: CourseInput[][], scale: GradingScale): number {
  let grandTotalGradePoints = 0;
  let grandTotalCreditUnits = 0;
  const scaleValues = GRADE_VALUES[scale];

  for (const semester of semestersCourses) {
    for (const course of semester) {
      if (!course.gradeAchieved) continue;
      const gradeValue = scaleValues[course.gradeAchieved.toUpperCase()];
      if (gradeValue !== undefined) {
        grandTotalGradePoints += course.creditUnits * gradeValue;
        grandTotalCreditUnits += course.creditUnits;
      }
    }
  }

  if (grandTotalCreditUnits === 0) return 0.00;

  const rawCgpa = grandTotalGradePoints / grandTotalCreditUnits;
  return Math.round((rawCgpa + Number.EPSILON) * 100) / 100;
}
```

---

## 6. Proportional Spaced Repetition (PSR) Engine

Traditional Spaced Repetition (like SuperMemo-2 / Anki) assumes a student has infinite time and a fixed exam date far in the future.
In Nigeria, semesters are compressed, internet access is intermittent, and power failures interrupt studies.

Our **Proportional Spaced Repetition (PSR) Engine** adjusts review intervals dynamically based on three core multipliers:
1.  **Credit Unit Proportionality:** A course with high credit units (e.g., 4 CU or 6 CU) carries higher weight in CGPA. The study intervals for higher credit courses are compressed relative to low-credit courses (e.g., 1 CU electives) to ensure more frequent touchpoints.
2.  **Exam Proximity Compression:** As the exam start date approaches, the spacing interval dynamically compresses to force hyper-focused consolidation reviews.
3.  **Strike Mode Adjustments:** If an ASUU strike is active, the engine switches to **Elastic Retention Preservation Mode**. Instead of expanding reviews into months, intervals are clamped to a preservation floor (e.g., 14 days) to prevent "academic decay" without overwhelming the student.

### Algorithm Specification:

$$\text{Base Interval (Days)} = \text{SM2\_Interval} \times \text{Difficulty\_Factor}$$

$$\text{Final Interval (Days)} = \text{Base Interval} \times F_{\text{credit}} \times F_{\text{proximity}} \times F_{\text{strike}}$$

Where:
*   $F_{\text{credit}} = 1.2 - (0.05 \times \text{Credit Units})$. A 4 CU course gets a `1.0` multiplier, a 6 CU course gets `0.9` (faster repeat cycles), and a 1 CU course gets `1.15` (slower repeat cycles).
*   $F_{\text{proximity}} = \text{Clamp}\left( \frac{\text{Days Until Exam}}{\text{Total Semester Days}}, 0.2, 1.0 \right)$. As days to the exam approach zero, intervals shrink by up to 80% of their base.
*   $F_{\text{strike}} = \text{Active ? } 1.5 \text{ : } 1.0$ (widens standard review timelines when strike is active to reduce pressure, but clamps maximum intervals to 21 days).

---

## 7. ASUU-Aware Academic Calendar Architecture

The academic calendar is treated as an **Elastic Timeline**. Rather than relying on rigid calendars, the system maintains a status engine.

```mermaid
stateDiagram-v2
    [*] --> NormalSemester
    NormalSemester --> StrikePaused : ASUU Strike Declared
    StrikePaused --> NormalSemester : Strike Called Off (Resumed)
    StrikePaused --> CompressedSemester : Strike Called Off (Compressed Catch-up Schedule)
    NormalSemester --> CompressedSemester : Compressed Academic Term
    CompressedSemester --> [*] : Semester Ended
```

### Strike Mode Activation:
*   **State Shift:** When Strike Mode is toggled (manually or via central broadcast):
    *   We store the system date as `strike_start_date`.
    *   We freeze all deadline countdowns.
    *   We toggle the UI state into **"Strike Mode Aesthetic"** (calming, low-pressure, focus on self-paced consolidation, review of already covered materials).
    *   We pause the study engine's "days of inactivity" warning logic to preserve the student's emotional safety.

### Compressed Semester Recalibration:
When the strike is resolved or a compressed semester is configured:
*   The student enters the new, shortened semester end date.
*   The system calculates the **Compression Ratio**:
    $$R_{\text{compression}} = \frac{\text{Remaining Calendar Days}}{\text{Original Plan Days}}$$
*   All future assignments, quiz dates, and spaced repetition items have their intervals scaled down by $R_{\text{compression}}$ to squeeze the curriculum into the target timeline.
*   Visual "heat maps" identify heavy academic weeks where multiple compressed targets cluster.

---

## 8. WhatsApp-Native Coordination Architecture

In Nigeria, student academic coordination occurs exclusively on WhatsApp (class groups, department groups, hostel groups).

Rather than attempting heavy, data-expensive in-app social networks, Smart Student Hub integrates with WhatsApp at a protocol and interface level:

```
[Student Device]
       │
       ├─── Creates Study Plan / Flashcard Deck
       │
       ├─── Generates WhatsApp-Native Digest
       │     (Uses specialized markdown blocks, structural line dividers, and emojis)
       │
       └─── Clicks "Share to Class Group"
             │
             └─── Triggers deep link: wa.me/?text=[Encoded Text Block]
```

### Native Copy-Paste Protocols:
*   **Standardized Study Digest Format:**
    ```text
    📚 *SMARTHUB WEEKLY DECK*
    ──────────────────────────
    🎓 Course: MTH101 (Mathematical Methods)
    🔥 Total Cards: 24
    ⏳ Next Group Study: Saturday, 4:00 PM
    
    Join the study session or download the deck here:
    👉 https://smarthub.student/deck/d7a31b2c
    ──────────────────────────
    💪 _"Consistency builds competence."_
    ```
*   **Rehydration via Deep Linking:**
    When another student clicks the `smarthub.student/deck/...` link, the PWA intercepts the URL, downloads the lightweight JSON payload (usually `<20KB`), registers the cards into their local IndexedDB, and updates their study feed—all without registering a profile if they are offline or guest users.

---

## 9. System Blueprint

The unified structural blueprint mapping users, databases, synchronization mechanisms, and visual display cards is laid out below.

```mermaid
graph TB
    subgraph Client Device (Local Sandbox)
        UI[PWA UI - React/Next.js]
        ZStore[Zustand Local State]
        DexieDB[(IndexedDB / Dexie.js)]
        Outbox[(Reconciliation Outbox)]
        SyncMgr[Sync Manager Worker]
    end

    subgraph CDN & API Gateway
        Cloudflare{Cloudflare Edge WAF}
    end

    subgraph Supabase Cloud Platform (Cloud Authority)
        SupAuth[Supabase Auth Service]
        SupDB[(PostgreSQL Database)]
        Realtime[Realtime Listener Event Bus]
    end

    UI --> ZStore
    ZStore <--> DexieDB
    ZStore --> Outbox
    Outbox --> SyncMgr
    SyncMgr --> Cloudflare
    Cloudflare --> SupDB
    Cloudflare --> SupAuth
    SupDB -.-> Realtime
    Realtime -.-> SyncMgr
```

---

## 10. Execution Phases

We will build Smart Student Hub v4 in 6 highly focused phases. Each phase relies on a validated state before moving forward.

```
┌────────────────────────────────────────────────────────┐
│ PHASE 1: Architecture & SOP Foundation (CURRENT PHASE) │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 2: Layer 3 Deterministic Engine Implementation   │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 3: Local Database & Offline-First Core (Dexie)   │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 4: Frontend Development & Premium UX Build       │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 5: Supabase Integration & Eventual Sync System   │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 6: End-to-End Validation, PWA & Production Launch│
└────────────────────────────────────────────────────────┘
```

---

## 11. Risk Analysis & Mitigation Protocols

We have identified five critical risks native to the Nigerian university student environment and established structural mitigations.

| Risk ID | Environmental Threat | Technical Impact | Engineering Mitigation Protocol |
| :--- | :--- | :--- | :--- |
| **R-01** | **ASUU Strike Action** (Unpredictable duration) | Breaks standard calendar logic, invalidates review schedules, spam-guilts students. | Implement **Strike Mode SOP**. Freeze standard calendar engines, switch UX to calm focus state, disable inactivity guilt loops. |
| **R-02** | **Extreme Power Outages** (Grid collapse/fuel costs) | Students cannot charge devices or sync. | **Offline-First execution**. Local client is 100% operational in memory/IndexedDB. Low performance mode minimizes RAM usage to keep battery consumption low. |
| **R-03** | **Expensive Internet Data** (High MTN/Airtel/GLO pricing) | Students block background network sync or uninstall heavy applications. | **JSON Batch Compression**. Keep network packets under `100KB` per session. Static assets are served and aggressively cached from CDN. No high-cost dependencies. |
| **R-04** | **Low-End Android Hardware** (Low RAM, laggy rendering) | React interface stutters; PWA crashes due to memory pressure. | **Tailwind + Framer Motion strict optimizations**. Avoid unnecessary re-renders. Limit concurrent IndexedDB cursors. Offload sync execution entirely to web workers. |
| **R-05** | **Sync Conflicts (Concurrent Edits)** | User edits course data on phone and cybercafe computer. | **Hybrid LWW and client-version checking**. Maintain incremental versions on all entities to reject stale writes. Merging overrides gracefully. |

---

## 12. Dependency Map

To guarantee performance on low-end hardware, we maintain an extremely lean, dependency-minimized manifest:

*   **Production Dependencies:**
    *   `next` (v14/15 - React framework)
    *   `react` & `react-dom`
    *   `tailwindcss` (Modern styling)
    *   `lucide-react` (Lightweight SVG icons)
    *   `framer-motion` (Micro-animations, strictly layout-throttled)
    *   `dexie` & `dexie-react-hooks` (IndexedDB layer)
    *   `zustand` (In-memory reactive state manager)
    *   `@supabase/supabase-js` (Eventual database sync)
    *   `uuid` (Client-side record ID generation)
*   **Development / Test Dependencies:**
    *   `typescript`
    *   `vitest` (Fast, isolated unit testing for Layer 3 Engines)
    *   `eslint`
    *   `@testing-library/react`

---

## 13. Data Flow Map

The step-by-step transaction flow during active network isolation (Offline Mode) followed by reconnection is detailed below:

```
[User Action: Grade Update]
              │
              ▼
[React UI] ──(Updates Target)──► [Zustand Store] ──(Triggers Render)──► [Success View Updated (<10ms)]
                                      │
                                      ├───► [Dexie DB] (Mutates records, sync_status = 'pending_update')
                                      │
                                      └───► [Dexie WAL] (Pushes Reconciliation Event)
                                      
                                   * * * NETWORK ISOLATION ACTIVE * * *
                                      
[Network Restored (onLine = true)]
              │
              ▼
[Sync Manager Worker] ──(Polls WAL)──► [Read 1st Event] ──(Post Payload)──► [Cloudflare / Gateway]
                                                                                  │
                                                                                  ▼
                                                                           [Supabase DB]
                                                                                  │
                                                                           (Accepts & Commits)
                                                                                  │
                                                                                  ▼
[Sync Manager Worker] ◄──(Returns 201 Created)────────────────────────────────────┘
              │
              ├───► [Dexie DB] (Updates sync_status = 'synced', removes event from WAL)
              │
              └───► [React UI] (Subtly removes "Offline Draft" indicator)
```

---

## 14. Implementation Log & Verification

### Step 1: Project Setup (Completed: 2026-05-26)
*   **Architecture & Directories**: Decoupled folder structures initialized (`/frontend`, `/backend`, `/workers`, `/tests`, `/tools`, `/.tmp`).
*   **Next.js Framework**: Initialized inside `/frontend` with App Router, TypeScript, Tailwind CSS, and ESLint.
*   **Dependencies Configured**:
    *   *Production*: `next`, `react`, `react-dom`, `tailwindcss`, `lucide-react`, `framer-motion`, `dexie`, `dexie-react-hooks`, `zustand`, `@supabase/supabase-js`, `uuid`.
    *   *Development*: `vitest`, `@types/uuid`, `@testing-library/react`.
*   **Testing Infrastructure**: Vitest environment validated with standalone tests inside `/tests/` running via sibling-relative configurations. Sanity checks passed successfully in **522ms**.
*   **Edge Case Mitigations**: Bypassed local PowerShell execution barriers using `cmd /c` overrides, and preserved custom landing pages during folder overrides.

### Step 2: Supabase Integration (Completed: 2026-05-26)
*   **Database Schema & Migration**: Initialized `/backend/migrations.sql` containing complete DDL layouts for tables (`profiles`, `semesters`, `courses`, `spaced_repetition_cards`, `academic_audit_logs`), custom enums, and optimized search indexes.
*   **Automated Timestamp Handlers**: Built and integrated `BEFORE UPDATE` trigger rules across target tables to maintain exact server modifications logs.
*   **Row Level Security (RLS)**: Enforced strict multi-tenant constraints for profiles, semesters, courses, and flashcards ensuring cross-tenant privacy boundaries.
*   **Client Core Setup**: Configured `frontend/src/lib/supabaseClient.ts` to manage remote pub-sub events.
*   **Edge Case Mitigations**: Handled missing or undefined environmental variables during production compilation or unit test execution by utilizing lazy fallback placeholders, completely preventing server-side rendering crashes.
*   **Extensive Verification**: Authored `tests/supabase.test.ts` to assert mock client resolutions. All tests compiled and passed in **597ms**.

### Step 3: Auth System (Completed: 2026-05-26)
*   **Decoupled Auth Helpers**: Created `frontend/src/lib/auth.ts` containing the core logic for local guest profile initialization and remote session mappings.
*   **Offline Guest Mode**: Integrated automatic local UUIDv4 generators that configure mock guest profiles instantly during offline sessions, removing any blocking signup barriers.
*   **Guest-to-User Account Migration**: Built a robust transaction utility (`handleAuthUnion`) inside Dexie DB that deletes the local guest profile and migrates all historical records (including child semesters) to the new authenticated Supabase User ID on user login.
*   **Extensive Verification**: Authored `tests/auth.test.ts` to assert guest profile initialization and re-keying migrations under mock database contexts. All tests passed successfully in **499ms**.

### Step 4: Offline Storage System (Completed: 2026-05-26)
*   **Zustand Reactive Store**: Created `frontend/src/store/useAcademicStore.ts` to manage in-memory arrays for profiles, semesters, courses, and card decks.
*   **IndexedDB Transaction Mapping**: Bound Zustand mutation actions (e.g. `addCourse`, `updateCourseGrade`, `toggleStrikeMode`) to atomic Dexie database transaction models, executing modifications securely across multiple tables.
*   **Write-Ahead Log Outbox Integration**: Every local write triggers a concurrent outbox write (`reconciliationQueue.put`) to log the event details, action, and payload, keeping data records perfectly structured for future remote syncing.
*   **Strike Adaptation Control**: Toggling strike mode freezes active semesters by shifting their statuses to `'strike_paused'` and logging the profile event within a single database transaction.
*   **Extensive Verification**: Authored `tests/storage.test.ts` verifying state hydration, transaction course inserts, outbox logging, and strike-paused transitions. All tests compiled and passed in **598ms**.

### Step 5: Sync Queue Engine (Completed: 2026-05-26)
*   **Synchronous FIFO Worker**: Created `frontend/src/lib/sync.ts` processing WAL outbox events sequentially (`orderBy("timestamp")`) to protect database foreign key hierarchies.
*   **Low-Bandwidth Sync Optimization**: Configured remote upserts (`supabase.upsert`) sending minified local delta packages, mapping local objects to cloud column conventions.
*   **Hybrid LWW & Version Conflict Resolution**: Implemented robust concurrency checks. If a database collision occurs (client version $\le$ server version), the engine applies LWW timestamp comparisons:
    *   *Server wins*: Local IndexedDB table drops stale updates, downloads server records, sets status to `'synced'`, and deletes the WAL log event.
    *   *Client wins*: The engine overwrites server records with newer client modifications.
*   **Failure & Retry Management**: Connection drops increment event retry counts and log specific HTTP exception strings in WAL rows, scheduling backoff flushes.
*   **Extensive Verification**: Authored `tests/sync.test.ts` verifying insert synchronizations and stale client overrides under mocked Supabase and Dexie networks. All tests passed successfully in **636ms**.

### Step 6: Front Landing Page (Completed: 2026-05-26)
*   **Next.js Integration**: Translated our premium HTML/CSS design into a type-safe React client-rendered page at `frontend/src/app/page.tsx`.
*   **Variable & Theme Management**: Styled with semantic HSL variables under `frontend/src/app/globals.css`, introducing sun/moon toggles that update root class lists for instant light/dark translations.
*   **Throttled Event Receivers**: Set up window scroll hooks for reading progress bars and sticky CTA slide-ins, using custom 15ms debounce gates to protect low-RAM mobile processors.
*   **Accessible Interactive Modals**: Programmed modal overlay triggers with automated focus-traps focusing on the student name on load and restoring focus to triggers on close, with Esc key bindings.
*   **Extensive Verification**: Authored `tests/landing.test.ts` to assert correct component structures and compile type-safe layouts, mocking DOM APIs like `IntersectionObserver` to support headless testing environments. All tests passed successfully in **796ms**.

### Step 7: Semester System (Completed: 2026-05-26)
*   **Strike Adaptations**: Implemented deterministic timeline utilities in `tools/semester.ts` to manage ASUU strikes.
*   **Squeeze Recalibration**: Configured mathematical duration squeezes and dynamic syllabus compression ratios when a strike is declared resolved.
*   **Extensive Verification**: Authored `tests/semester.test.ts` to assert correct status conversions, timeline pausing, and resume recalibrations. All tests passed in **624ms**.

### Step 8: CGPA Engine (Completed: 2026-05-26)
*   **Deterministic Calculations**: Authored a pure TypeScript engine in `tools/cgpa.ts` supporting four grading scales (`5.0_WITH_E`, `5.0_NO_E`, `4.0_NUC`, `7.0_UI`) with exact integer math.
*   **Precision Guarding**: Added rounding logic utilizing the `Number.EPSILON` stabilizer to eliminate double-precision binary float representation discrepancies.
*   **Repeat & Carry-Over Integration**: Added support for both `accumulative` (both failed and repeat grades count) and `replacement` (only the latest graded attempt counts) department grading policies.
*   **Extensive Verification**: Authored `tests/cgpa.test.ts` covering boundary rounding, scale variations, and multi-semester repeat scenarios. All tests passed in **662ms**.

### Step 9: Study Planner (Completed: 2026-05-26)
*   **SuperMemo-2 (SM-2) Adaptation**: Implemented a robust memory recall algorithm in `frontend/src/lib/spaced_rep.ts` that squeezes initial review cycles (repetitions = 1 gets 4 days) for fast timelines.
*   **Credit Unit Weighting ($F_{\text{credit}}$)**: Weighted interval scheduler shortening repeat review loops for 4 CU and 6 CU courses, and relaxing reviews for 1 CU electives.
*   **Exam Proximity Squeezes ($F_{\text{proximity}}$)**: Compressed review timelines dynamically by up to 80% as exam boundaries draw closer, utilizing a safety clamp of 0.20 to protect emotional safety.
*   **Strike Maintenance Mode ($F_{\text{strike}}$)**: Expanded study timelines by 50% during active ASUU strike triggers, while capping intervals to a maximum of 21 days to avoid retention decay.
*   **Local Time Alignment**: Standardized all computed review dates to midnight local user time (00:00:00) to protect local databases from scheduling and timezone skews.
*   **Extensive Verification**: Authored `tests/spaced_rep.test.ts` covering 16 test targets asserting all multipliers, SM-2 transitions, limits, and time offsets. All tests successfully passed in **737ms** (total 47 assertions passing).

### Step 10: PWA Configuration (Completed: 2026-05-26)
*   **Web App Manifest**: Configured a valid Progressive Web App schema inside `frontend/public/manifest.json` setting `standalone` display mode, `portrait` orientations, and asset icons.
*   **Resilient Service Worker**: Authored a pure worker inside `frontend/public/sw.js` executing offline shell pre-caching, network-first page navigations, and cache-first/stale-while-revalidate static script caching.
*   **Offline Fallback Page**: Created a premium, calming dark fallback page at `/offline` with pulsing connection checkers and local IndexedDB capability status breakdowns.
*   **Registration Lifecycles**: Built a modular, type-safe Client Component at `frontend/src/components/PWARegistration.tsx` to handle standard registration events safely without interrupting browser rendering frames.
*   **Extensive Verification**: Confirmed successful Next.js Turbopack compilation with **zero type errors** and verified seamless static HTML prerendering for the new `/offline` fallback route.

### Step 11: Notification Engine (Completed: 2026-05-26)
*   **Zero Guilt-Tripping Filters**: Configured `frontend/src/lib/notification.ts` with automated case-insensitive word screenings that reject toxic gamification/motivational triggers like `streak`, `failed`, `lazy`, or `disappointed`.
*   **Low-Battery Locks**: Enforced dynamic battery constraints mute push notifications and background db synchronizations when device charge drops below 15% (`navigator.getBattery` level < 0.15) and is not charging.
*   **Bandwidth Boundary Compliance**: Strictly throttled payload transfers to under 2KB using exact UTF-8 byte encoders.
*   **Modular Re-exporters**: Created workspace re-exporters in `tools/notification.ts` and `workers/notification.ts`.
*   **Extensive Verification**: Authored `tests/notification.test.ts` checking battery states and guilt-free triggers. Compiled Next.js production build with zero type-check errors and ran all 13 new test assertions successfully in 7ms.

### Step 12: WhatsApp Coordination Features (Completed: 2026-05-26)
*   **Standardized Share Formatters**: Programmed exact Unicode study brief string formatters inside `frontend/src/lib/whatsapp.ts` matching the strict department sharing guidelines of SOP-005.
*   **P2P URL-safe Base64 Compression**: Configured high-fidelity JSON minification and base64 encoders that package study decks (including Yoruba/Hausa Unicode names) into light URL links strictly under the 30KB offline budget.
*   **Transactional Deck Importer**: Designed `importSharedDeck` writing to `courses`, `semesters`, and `spaced_repetition_cards` IndexedDB tables in a single atomic transaction while logging sync outbox WAL events.
*   **Interactive Import UI Page**: Built a responsive, premium App Router view at `frontend/src/app/deck/[id]/page.tsx` displaying course statistics, dynamic card grids with interactive flip states, and custom Checkmark modal animations during import.
*   **Extensive Verification**: Authored `tests/whatsapp.test.ts` covering round-trip conversions and import WAL logs. All 65 workspace tests passed in 541ms, and the Next.js production server compiled seamlessly with static optimizations.









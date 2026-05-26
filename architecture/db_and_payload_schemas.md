# SOP-009: Database & Payload Schema System

This document outlines the complete database structure, security definitions, local stores, and JSON contract payload specifications for **Smart Student Hub v4**. It ensures audit-safe academic records, offline eventual synchronization, low-bandwidth communications, and deterministic calculations.

---

## 💾 1. PostgreSQL Schema (Supabase Cloud Authority)

This schema runs on Supabase PostgreSQL. It includes check constraints, audit tracking logs, and version control triggers to preserve academic record integrity.

```sql
-- ==========================================================================
-- 1. ENUMS & EXTENSIONS
-- ==========================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE grading_scale_type AS ENUM (
    '5.0_WITH_E', -- Standard Nigerian Scale (A=5, B=4, C=3, D=2, E=1, F=0)
    '5.0_NO_E',   -- Modern Scale (A=5, B=4, C=3, D=2, F=0)
    '4.0_NUC',    -- NUC standard Scale (A=4, B=3, C=2, D=1, F=0)
    '7.0_UI'      -- Legacy 7.0 UI Scale (A=7, B=6, C=5, D=4, E=3, F=0)
);

CREATE TYPE sync_status_type AS ENUM (
    'synced',
    'pending_insert',
    'pending_update',
    'pending_delete'
);

CREATE TYPE semester_status_type AS ENUM (
    'active',
    'completed',
    'strike_paused'
);

-- ==========================================================================
-- 2. TABLES DEFINITIONS
-- ==========================================================================

-- A. PROFILES TABLE
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, -- Linked directly to auth.users.id
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(100),
    university_name VARCHAR(150) NOT NULL,
    matric_number VARCHAR(50),
    grading_scale grading_scale_type NOT NULL DEFAULT '5.0_WITH_E',
    current_level INTEGER NOT NULL CHECK (current_level IN (100, 200, 300, 400, 500, 600)),
    strike_mode_active BOOLEAN NOT NULL DEFAULT FALSE,
    strike_start_date TIMESTAMP WITH TIME ZONE,
    
    -- Sync & Concurrent Edit Fields
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- B. SEMESTERS TABLE (ASUU strike-aware and elastic)
CREATE TABLE public.semesters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level IN (100, 200, 300, 400, 500, 600)),
    term INTEGER NOT NULL CHECK (term IN (1, 2)), -- 1 = First, 2 = Second Semester
    status semester_status_type NOT NULL DEFAULT 'active',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    compressed_mode BOOLEAN NOT NULL DEFAULT FALSE,
    original_duration_weeks INTEGER NOT NULL CHECK (original_duration_weeks > 0),
    current_duration_weeks INTEGER NOT NULL CHECK (current_duration_weeks > 0),
    
    -- Sync & Versioning
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Exclude duplicate active terms for a single profile
    CONSTRAINT unique_semester_term UNIQUE (profile_id, level, term)
);

-- C. COURSES TABLE (Deterministic GPA items)
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    course_code VARCHAR(15) NOT NULL, -- e.g., 'MTH101'
    course_title VARCHAR(150) NOT NULL,
    credit_units INTEGER NOT NULL CHECK (credit_units BETWEEN 1 AND 6),
    grade_target VARCHAR(2) CHECK (grade_target IN ('A', 'B', 'C', 'D', 'E', 'F')),
    grade_achieved VARCHAR(2) CHECK (grade_achieved IN ('A', 'B', 'C', 'D', 'E', 'F')),
    is_prerequisite_for VARCHAR(15)[] NOT NULL DEFAULT '{}',
    
    -- Sync & Versioning
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- D. SPACED REPETITION CARDS
CREATE TABLE public.spaced_repetition_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    front_content TEXT NOT NULL,
    back_content TEXT NOT NULL,
    difficulty VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    box_number INTEGER NOT NULL DEFAULT 1 CHECK (box_number BETWEEN 1 AND 5),
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    next_review_due TIMESTAMP WITH TIME ZONE NOT NULL,
    proportional_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    
    -- Sync & Versioning
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- E. AUDIT LOGS TABLE (For audit-safe records)
CREATE TABLE public.academic_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    record_id UUID NOT NULL, -- Primary key of target mutated course
    table_name VARCHAR(50) NOT NULL, -- 'courses' | 'semesters' | 'profiles'
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    old_value JSONB,
    new_value JSONB,
    operator_ip VARCHAR(45),
    logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ==========================================================================
-- 3. INDEXES (Optimized for performance and sync mapping queries)
-- ==========================================================================
CREATE INDEX idx_semesters_profile ON public.semesters(profile_id);
CREATE INDEX idx_courses_semester ON public.courses(semester_id);
CREATE INDEX idx_cards_course ON public.spaced_repetition_cards(course_id);
CREATE INDEX idx_cards_due ON public.spaced_repetition_cards(next_review_due);
CREATE INDEX idx_audit_profile ON public.academic_audit_logs(profile_id);

-- ==========================================================================
-- 4. SERVER AUTOMATION FUNCTIONS & TRIGGERS
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.set_server_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();
CREATE TRIGGER trigger_update_semesters BEFORE UPDATE ON public.semesters FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();
CREATE TRIGGER trigger_update_courses BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();
CREATE TRIGGER trigger_update_cards BEFORE UPDATE ON public.spaced_repetition_cards FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

-- ==========================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================================

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaced_repetition_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_audit_logs ENABLE ROW LEVEL SECURITY;

-- A. Profiles Policies
CREATE POLICY "Allow students select their own profile" ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Allow students insert their own profile" ON public.profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow students update their own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- B. Semesters Policies (Tied to Profiles)
CREATE POLICY "Allow students select their own semesters" ON public.semesters
    FOR SELECT TO authenticated USING (profile_id = auth.uid());

CREATE POLICY "Allow students insert their own semesters" ON public.semesters
    FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Allow students update their own semesters" ON public.semesters
    FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Allow students delete their own semesters" ON public.semesters
    FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- C. Courses Policies (Linked through semesters)
CREATE POLICY "Allow students select their own courses" ON public.courses
    FOR SELECT TO authenticated USING (
        semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
    );

CREATE POLICY "Allow students insert their own courses" ON public.courses
    FOR INSERT TO authenticated WITH CHECK (
        semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
    );

CREATE POLICY "Allow students update their own courses" ON public.courses
    FOR UPDATE TO authenticated USING (
        semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
    ) WITH CHECK (
        semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
    );

CREATE POLICY "Allow students delete their own courses" ON public.courses
    FOR DELETE TO authenticated USING (
        semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
    );

-- D. Cards Policies (Linked through courses)
CREATE POLICY "Allow students select their own cards" ON public.spaced_repetition_cards
    FOR SELECT TO authenticated USING (
        course_id IN (
            SELECT c.id FROM public.courses c
            JOIN public.semesters s ON c.semester_id = s.id
            WHERE s.profile_id = auth.uid()
        )
    );

CREATE POLICY "Allow students insert their own cards" ON public.spaced_repetition_cards
    FOR INSERT TO authenticated WITH CHECK (
        course_id IN (
            SELECT c.id FROM public.courses c
            JOIN public.semesters s ON c.semester_id = s.id
            WHERE s.profile_id = auth.uid()
        )
    );

CREATE POLICY "Allow students update their own cards" ON public.spaced_repetition_cards
    FOR UPDATE TO authenticated USING (
        course_id IN (
            SELECT c.id FROM public.courses c
            JOIN public.semesters s ON c.semester_id = s.id
            WHERE s.profile_id = auth.uid()
        )
    ) WITH CHECK (
        course_id IN (
            SELECT c.id FROM public.courses c
            JOIN public.semesters s ON c.semester_id = s.id
            WHERE s.profile_id = auth.uid()
        )
    );

CREATE POLICY "Allow students delete their own cards" ON public.spaced_repetition_cards
    FOR DELETE TO authenticated USING (
        course_id IN (
            SELECT c.id FROM public.courses c
            JOIN public.semesters s ON c.semester_id = s.id
            WHERE s.profile_id = auth.uid()
        )
    );

-- E. Audit Logs Policies (Write-only to profile_id matching authenticated user)
CREATE POLICY "Allow students select their own audit logs" ON public.academic_audit_logs
    FOR SELECT TO authenticated USING (profile_id = auth.uid());

CREATE POLICY "Allow students insert their own audit logs" ON public.academic_audit_logs
    FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());


---

## 📱 2. IndexedDB Local Schema (Dexie.js Definition)

IndexedDB acts as the offline write sandbox. The structure replicates the remote PostgreSQL tables, adding a `sync_status` flag to track local changes.

### A. Dexie Schema Definition
```typescript
import Dexie, { Table } from 'dexie';

// Enums
export type GradingScale = '5.0_WITH_E' | '5.0_NO_E' | '4.0_NUC' | '7.0_UI';
export type SyncStatus = 'synced' | 'pending_insert' | 'pending_update' | 'pending_delete';
export type SemesterStatus = 'active' | 'completed' | 'strike_paused';

// Local Table Interfaces
export interface LocalProfile {
  id: string; // UUIDv4
  email: string;
  fullName?: string;
  universityName: string;
  matricNumber?: string;
  gradingScale: GradingScale;
  currentLevel: number;
  strikeModeActive: boolean;
  strikeStartDate?: string; // ISO String
  
  // Sync fields
  localCreatedAt: string;
  localUpdatedAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  clientVersion: number;
}

export interface LocalSemester {
  id: string; // UUIDv4
  profileId: string;
  level: number;
  term: number;
  status: SemesterStatus;
  startDate: string;
  endDate: string;
  compressedMode: boolean;
  originalDurationWeeks: number;
  currentDurationWeeks: number;
  
  // Sync fields
  localCreatedAt: string;
  localUpdatedAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  clientVersion: number;
}

export interface LocalCourse {
  id: string; // UUIDv4
  semesterId: string;
  courseCode: string;
  courseTitle: string;
  creditUnits: number;
  gradeTarget?: string;
  gradeAchieved?: string;
  isPrerequisiteFor: string[];
  
  // Sync fields
  localCreatedAt: string;
  localUpdatedAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  clientVersion: number;
}

export interface LocalSpacedRepCard {
  id: string; // UUIDv4
  courseId: string;
  frontContent: string;
  backContent: string;
  difficulty: 'easy' | 'medium' | 'hard';
  boxNumber: number;
  lastReviewedAt?: string;
  nextReviewDue: string;
  proportionalFactor: number;
  
  // Sync fields
  localCreatedAt: string;
  localUpdatedAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  clientVersion: number;
}

// Write-Ahead Log Event Interface
export interface ReconciliationEvent {
  id: string; // UUIDv4
  tableName: 'profiles' | 'semesters' | 'courses' | 'spaced_repetition_cards';
  recordId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any; // Serialized record contents (null if delete)
  timestamp: number; // Date.now()
  retryCount: number;
  errorMessage?: string;
}

// B. Dexie Initializer
export class SmartHubDatabase extends Dexie {
  profiles!: Table<LocalProfile, string>;
  semesters!: Table<LocalSemester, string>;
  courses!: Table<LocalCourse, string>;
  spacedRepetitionCards!: Table<LocalSpacedRepCard, string>;
  reconciliationQueue!: Table<ReconciliationEvent, string>;

  constructor() {
    super('SmartHubDatabase');
    this.version(1).stores({
      profiles: 'id, email, currentLevel, syncStatus',
      semesters: 'id, profileId, level, term, status, syncStatus',
      courses: 'id, semesterId, courseCode, syncStatus',
      spacedRepetitionCards: 'id, courseId, nextReviewDue, syncStatus',
      reconciliationQueue: 'id, tableName, recordId, action, timestamp'
    });
  }
}

export const db = new SmartHubDatabase();
```

---

## 🔄 3. Synchronization Payload Contracts (JSON Contracts)

To achieve **low-bandwidth synchronization**, payloads are optimized for batch transmission. Long strings are excluded from sync validation if they have not changed.

### A. Batch Push Payload (`POST /api/sync/push`)
The client sends this batch contract containing local mutations:
```typescript
interface SyncBatchPushPayload {
  userId: string;
  clientTimestamp: string; // ISO String for latency metrics
  mutations: {
    profiles: LocalProfile[];
    semesters: LocalSemester[];
    courses: LocalCourse[];
    cards: LocalSpacedRepCard[];
    deletes: {
      tableName: 'semesters' | 'courses' | 'spaced_repetition_cards';
      recordId: string;
      localUpdatedAt: string;
      clientVersion: number;
    }[];
  };
}
```

### B. Batch Pull Response Contract (`POST /api/sync/pull`)
The client polls for changes since their last known synchronizations:
```typescript
interface SyncBatchPullRequest {
  userId: string;
  lastSyncedTimestamp: string; // ISO String
}

interface SyncBatchPullResponse {
  serverTimestamp: string; // ISO String
  changes: {
    profiles: any[];
    semesters: any[];
    courses: any[];
    cards: any[];
    deletes: {
      tableName: 'semesters' | 'courses' | 'spaced_repetition_cards';
      recordId: string;
      deletedAt: string;
    }[];
  };
}
```

---

## 📢 4. Notification Payload Schema (JSON Contracts)

Notification structures are divided into raw **FCM Push Notifications** (text-only reminders) and generated **WhatsApp templates**.

### A. FCM Web Push Text-Only Payload
To limit data costs for students, background FCM push packets do not download images:
```json
{
  "to": "/topics/user_id",
  "priority": "high",
  "data": {
    "title": "Recall Deck Pending",
    "body": "PHY111: 8 cards are ready for your spaced review loop.",
    "click_action": "https://smarthub.student/spaced-repetition",
    "device_status": {
      "battery_threshold_active": "true"
    }
  }
}
```

### B. WhatsApp Copy-Paste Template Builder Output
Generated dynamically in `/tools/whatsapp.ts` for clipboard sharing:
```typescript
interface WhatsAppShareTemplate {
  header: string; // "📚 *SMARTHUB REVIEW DECK*"
  courseCode: string; // "🎓 Course: MTH101 (Algebra)"
  cardCount: number; // "🔥 Items: 16 Cards"
  invitationUrl: string; // "👉 https://smarthub.student/deck/15a3c"
  quote: string; // "💡 _'Preparation beats luck every single time.'_"
}
```

---

## 📊 5. Analytics Payload Schema (PostHog Buffer Contract)

Analytics are buffered inside IndexedDB and flushed *only* when device conditions are energy-safe (online, battery $> 30\%$, or plugged into power).

### A. Local Analytics Buffer Schema:
```typescript
interface LocalAnalyticsEvent {
  id: string; // UUIDv4
  eventName: string; // 'grade_updated' | 'strike_mode_toggled' | 'study_completed'
  properties: {
    level: number;
    gradingScale: GradingScale;
    coursesCount: number;
    batteryLevel: number;
    chargingState: boolean;
    latencyMs?: number; // Computation speeds for low-end hardware checks
  };
  timestamp: string; // ISO String
}
```

### B. Serialized Flush Payload Contract:
When flushes occur, events are sent in a minified batch payload:
```json
{
  "batch": [
    {
      "event": "grade_updated",
      "properties": {
        "distinct_id": "profile_uuid_here",
        "level": 200,
        "gradingScale": "5.0_WITH_E",
        "latencyMs": 8,
        "network_type": "cellular-3g"
      },
      "timestamp": "2026-05-26T12:00:00Z"
    }
  ]
}
```


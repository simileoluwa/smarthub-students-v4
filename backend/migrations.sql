-- ==========================================================================
-- Smart Student Hub v4 — Supabase PostgreSQL Schema & Security Migrations
-- Location: /backend/migrations.sql
-- ==========================================================================

-- 1. EXTENSIONS & ENUMS DEFINITIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE public.grading_scale_type AS ENUM (
    '5.0_WITH_E', -- Standard Nigerian Scale (A=5, B=4, C=3, D=2, E=1, F=0)
    '5.0_NO_E',   -- Modern Scale (A=5, B=4, C=3, D=2, F=0)
    '4.0_NUC',    -- NUC standard Scale (A=4, B=3, C=2, D=1, F=0)
    '7.0_UI'      -- Legacy 7.0 UI Scale (A=7, B=6, C=5, D=4, E=3, F=0)
);

CREATE TYPE public.sync_status_type AS ENUM (
    'synced',
    'pending_insert',
    'pending_update',
    'pending_delete'
);

CREATE TYPE public.semester_status_type AS ENUM (
    'active',
    'completed',
    'strike_paused'
);

-- 2. PUBLIC TABLES

-- A. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY, -- Matches Supabase Auth users.id
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(100),
    university_name VARCHAR(150) NOT NULL,
    matric_number VARCHAR(50),
    grading_scale public.grading_scale_type NOT NULL DEFAULT '5.0_WITH_E',
    current_level INTEGER NOT NULL CHECK (current_level IN (100, 200, 300, 400, 500, 600)),
    strike_mode_active BOOLEAN NOT NULL DEFAULT FALSE,
    strike_start_date TIMESTAMP WITH TIME ZONE,
    
    -- Synchronization trackers
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- B. SEMESTERS TABLE
CREATE TABLE IF NOT EXISTS public.semesters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level IN (100, 200, 300, 400, 500, 600)),
    term INTEGER NOT NULL CHECK (term IN (1, 2)),
    status public.semester_status_type NOT NULL DEFAULT 'active',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    compressed_mode BOOLEAN NOT NULL DEFAULT FALSE,
    original_duration_weeks INTEGER NOT NULL CHECK (original_duration_weeks > 0),
    current_duration_weeks INTEGER NOT NULL CHECK (current_duration_weeks > 0),
    
    -- Synchronization trackers
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_semester_term UNIQUE (profile_id, level, term)
);

-- C. COURSES TABLE
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    course_code VARCHAR(15) NOT NULL,
    course_title VARCHAR(150) NOT NULL,
    credit_units INTEGER NOT NULL CHECK (credit_units BETWEEN 1 AND 6),
    grade_target VARCHAR(2) CHECK (grade_target IN ('A', 'B', 'C', 'D', 'E', 'F')),
    grade_achieved VARCHAR(2) CHECK (grade_achieved IN ('A', 'B', 'C', 'D', 'E', 'F')),
    is_prerequisite_for VARCHAR(15)[] NOT NULL DEFAULT '{}',
    
    -- Synchronization trackers
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- D. SPACED REPETITION CARDS
CREATE TABLE IF NOT EXISTS public.spaced_repetition_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    front_content TEXT NOT NULL,
    back_content TEXT NOT NULL,
    difficulty VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    box_number INTEGER NOT NULL DEFAULT 1 CHECK (box_number BETWEEN 1 AND 5),
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    next_review_due TIMESTAMP WITH TIME ZONE NOT NULL,
    proportional_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    
    -- Synchronization trackers
    local_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    local_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- E. ACADEMIC AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.academic_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    old_value JSONB,
    new_value JSONB,
    operator_ip VARCHAR(45),
    logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. SEARCH OPTIMIZED INDEXES
CREATE INDEX IF NOT EXISTS idx_semesters_profile ON public.semesters(profile_id);
CREATE INDEX IF NOT EXISTS idx_courses_semester ON public.courses(semester_id);
CREATE INDEX IF NOT EXISTS idx_cards_course ON public.spaced_repetition_cards(course_id);
CREATE INDEX IF NOT EXISTS idx_cards_due ON public.spaced_repetition_cards(next_review_due);
CREATE INDEX IF NOT EXISTS idx_audit_profile ON public.academic_audit_logs(profile_id);

-- 4. SERVER SIDE TIMESTAMPS TRACKERS & AUTOMATIONS
CREATE OR REPLACE FUNCTION public.set_server_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_update_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();
CREATE OR REPLACE TRIGGER trigger_update_semesters BEFORE UPDATE ON public.semesters FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();
CREATE OR REPLACE TRIGGER trigger_update_courses BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();
CREATE OR REPLACE TRIGGER trigger_update_cards BEFORE UPDATE ON public.spaced_repetition_cards FOR EACH ROW EXECUTE FUNCTION public.set_server_updated_at();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaced_repetition_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Security
CREATE POLICY "Profiles Read Self" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles Insert Self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles Update Self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Semesters Security
CREATE POLICY "Semesters Read Self" ON public.semesters FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "Semesters Insert Self" ON public.semesters FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Semesters Update Self" ON public.semesters FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Semesters Delete Self" ON public.semesters FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- Courses Security
CREATE POLICY "Courses Read Self" ON public.courses FOR SELECT TO authenticated USING (
    semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
);
CREATE POLICY "Courses Insert Self" ON public.courses FOR INSERT TO authenticated WITH CHECK (
    semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
);
CREATE POLICY "Courses Update Self" ON public.courses FOR UPDATE TO authenticated USING (
    semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
) WITH CHECK (
    semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
);
CREATE POLICY "Courses Delete Self" ON public.courses FOR DELETE TO authenticated USING (
    semester_id IN (SELECT s.id FROM public.semesters s WHERE s.profile_id = auth.uid())
);

-- Cards Security
CREATE POLICY "Cards Read Self" ON public.spaced_repetition_cards FOR SELECT TO authenticated USING (
    course_id IN (
        SELECT c.id FROM public.courses c
        JOIN public.semesters s ON c.semester_id = s.id
        WHERE s.profile_id = auth.uid()
    )
);
CREATE POLICY "Cards Insert Self" ON public.spaced_repetition_cards FOR INSERT TO authenticated WITH CHECK (
    course_id IN (
        SELECT c.id FROM public.courses c
        JOIN public.semesters s ON c.semester_id = s.id
        WHERE s.profile_id = auth.uid()
    )
);
CREATE POLICY "Cards Update Self" ON public.spaced_repetition_cards FOR UPDATE TO authenticated USING (
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
CREATE POLICY "Cards Delete Self" ON public.spaced_repetition_cards FOR DELETE TO authenticated USING (
    course_id IN (
        SELECT c.id FROM public.courses c
        JOIN public.semesters s ON c.semester_id = s.id
        WHERE s.profile_id = auth.uid()
    )
);

-- Audit Logs Security
CREATE POLICY "Audit Logs Read Self" ON public.academic_audit_logs FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "Audit Logs Insert Self" ON public.academic_audit_logs FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

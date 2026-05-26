import Dexie, { Table } from 'dexie';

export type GradingScale = '5.0_WITH_E' | '5.0_NO_E' | '4.0_NUC' | '7.0_UI';
export type SyncStatus = 'synced' | 'pending_insert' | 'pending_update' | 'pending_delete';
export type SemesterStatus = 'active' | 'completed' | 'strike_paused';

export interface LocalProfile {
  id: string; // UUIDv4
  email: string;
  fullName?: string;
  universityName: string;
  matricNumber?: string;
  gradingScale: GradingScale;
  currentLevel: number;
  strikeModeActive: boolean;
  strikeStartDate?: string;
  
  // Sync metadata
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
  
  // Sync metadata
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
  
  // Sync metadata
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
  
  // Sync metadata
  localCreatedAt: string;
  localUpdatedAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  clientVersion: number;
}

export interface ReconciliationEvent {
  id: string; // UUIDv4
  tableName: 'profiles' | 'semesters' | 'courses' | 'spaced_repetition_cards';
  recordId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: unknown;
  timestamp: number;
  retryCount: number;
  errorMessage?: string;
}

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

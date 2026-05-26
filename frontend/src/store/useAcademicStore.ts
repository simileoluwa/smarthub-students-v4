import { create } from 'zustand';
import { db, LocalProfile, LocalSemester, LocalCourse, LocalSpacedRepCard } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';

interface AcademicState {
  profile: LocalProfile | null;
  semesters: LocalSemester[];
  courses: LocalCourse[];
  cards: LocalSpacedRepCard[];
  isHydrated: boolean;
  
  // Storage Actions
  initializeStore: () => Promise<void>;
  updateProfile: (updates: Partial<LocalProfile>) => Promise<void>;
  addSemester: (sem: Omit<LocalSemester, 'id' | 'profileId' | 'localCreatedAt' | 'localUpdatedAt' | 'syncStatus' | 'clientVersion'>) => Promise<void>;
  addCourse: (course: Omit<LocalCourse, 'id' | 'localCreatedAt' | 'localUpdatedAt' | 'syncStatus' | 'clientVersion'>) => Promise<void>;
  updateCourseGrade: (courseId: string, grade: string) => Promise<void>;
  toggleStrikeMode: () => Promise<void>;
}

export const useAcademicStore = create<AcademicState>((set, get) => ({
  profile: null,
  semesters: [],
  courses: [],
  cards: [],
  isHydrated: false,

  initializeStore: async () => {
    try {
      const profile = await db.profiles.toCollection().first();
      const semesters = await db.semesters.toArray();
      const courses = await db.courses.toArray();
      const cards = await db.spacedRepetitionCards.toArray();

      set({
        profile: profile || null,
        semesters,
        courses,
        cards,
        isHydrated: true,
      });
    } catch (error) {
      console.error('Store hydration failed:', error);
    }
  },

  updateProfile: async (updates) => {
    const { profile } = get();
    if (!profile) return;

    const updatedProfile: LocalProfile = {
      ...profile,
      ...updates,
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_update',
      clientVersion: profile.clientVersion + 1,
    };

    // Update in-memory
    set({ profile: updatedProfile });

    // Persistent IndexedDB update & Log WAL Event
    await db.transaction('rw', [db.profiles, db.reconciliationQueue], async () => {
      await db.profiles.put(updatedProfile);
      await db.reconciliationQueue.put({
        id: uuidv4(),
        tableName: 'profiles',
        recordId: profile.id,
        action: 'UPDATE',
        payload: updatedProfile,
        timestamp: Date.now(),
        retryCount: 0,
      });
    });
  },

  addSemester: async (semInput) => {
    const { profile } = get();
    if (!profile) return;

    const newSemester: LocalSemester = {
      ...semInput,
      id: uuidv4(),
      profileId: profile.id,
      localCreatedAt: new Date().toISOString(),
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_insert',
      clientVersion: 1,
    };

    // Update in-memory
    set(state => ({ semesters: [...state.semesters, newSemester] }));

    // Persistent IndexedDB & WAL
    await db.transaction('rw', [db.semesters, db.reconciliationQueue], async () => {
      await db.semesters.put(newSemester);
      await db.reconciliationQueue.put({
        id: uuidv4(),
        tableName: 'semesters',
        recordId: newSemester.id,
        action: 'INSERT',
        payload: newSemester,
        timestamp: Date.now(),
        retryCount: 0,
      });
    });
  },

  addCourse: async (courseInput) => {
    const newCourse: LocalCourse = {
      ...courseInput,
      id: uuidv4(),
      localCreatedAt: new Date().toISOString(),
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_insert',
      clientVersion: 1,
    };

    // Update in-memory
    set(state => ({ courses: [...state.courses, newCourse] }));

    // Persistent IndexedDB & WAL
    await db.transaction('rw', [db.courses, db.reconciliationQueue], async () => {
      await db.courses.put(newCourse);
      await db.reconciliationQueue.put({
        id: uuidv4(),
        tableName: 'courses',
        recordId: newCourse.id,
        action: 'INSERT',
        payload: newCourse,
        timestamp: Date.now(),
        retryCount: 0,
      });
    });
  },

  updateCourseGrade: async (courseId, grade) => {
    const { courses } = get();
    const courseIndex = courses.findIndex(c => c.id === courseId);
    if (courseIndex === -1) return;

    const originalCourse = courses[courseIndex];
    const updatedCourse: LocalCourse = {
      ...originalCourse,
      gradeAchieved: grade,
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_update',
      clientVersion: originalCourse.clientVersion + 1,
    };

    // Update in-memory
    const updatedCourses = [...courses];
    updatedCourses[courseIndex] = updatedCourse;
    set({ courses: updatedCourses });

    // Persistent IndexedDB & WAL
    await db.transaction('rw', [db.courses, db.reconciliationQueue], async () => {
      await db.courses.put(updatedCourse);
      await db.reconciliationQueue.put({
        id: uuidv4(),
        tableName: 'courses',
        recordId: courseId,
        action: 'UPDATE',
        payload: updatedCourse,
        timestamp: Date.now(),
        retryCount: 0,
      });
    });
  },

  toggleStrikeMode: async () => {
    const { profile, semesters } = get();
    if (!profile) return;

    const newStrikeState = !profile.strikeModeActive;
    const strikeStart = newStrikeState ? new Date().toISOString() : undefined;

    const updatedProfile: LocalProfile = {
      ...profile,
      strikeModeActive: newStrikeState,
      strikeStartDate: strikeStart,
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_update',
      clientVersion: profile.clientVersion + 1,
    };

    // Update in-memory profile
    set({ profile: updatedProfile });

    await db.transaction('rw', [db.profiles, db.semesters, db.reconciliationQueue], async () => {
      await db.profiles.put(updatedProfile);
      await db.reconciliationQueue.put({
        id: uuidv4(),
        tableName: 'profiles',
        recordId: profile.id,
        action: 'UPDATE',
        payload: updatedProfile,
        timestamp: Date.now(),
        retryCount: 0,
      });

      // Freeze all active semesters
      const activeSemesters = semesters.filter(s => s.status === 'active');
      for (const sem of activeSemesters) {
        const updatedSem: LocalSemester = {
          ...sem,
          status: newStrikeState ? 'strike_paused' as const : 'active' as const,
          localUpdatedAt: new Date().toISOString(),
          syncStatus: 'pending_update',
          clientVersion: sem.clientVersion + 1,
        };

        // Update in-memory semester list
        set(state => ({
          semesters: state.semesters.map(s => s.id === sem.id ? updatedSem : s)
        }));

        await db.semesters.put(updatedSem);
        await db.reconciliationQueue.put({
          id: uuidv4(),
          tableName: 'semesters',
          recordId: sem.id,
          action: 'UPDATE',
          payload: updatedSem,
          timestamp: Date.now(),
          retryCount: 0,
        });
      }
    });
  },
}));

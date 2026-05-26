import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAcademicStore } from '../frontend/src/store/useAcademicStore';
import { db } from '../frontend/src/lib/db';

// Mock Dexie behaviour to prevent standard database storage errors in headless tests
vi.mock('../frontend/src/lib/db', () => {
  const mockProfiles: any[] = [];
  const mockSemesters: any[] = [];
  const mockCourses: any[] = [];
  const mockCards: any[] = [];
  const mockWAL: any[] = [];

  const mockProfilesTable = {
    toCollection: () => ({
      first: async () => mockProfiles[0] || null,
    }),
    put: async (profile: any) => {
      mockProfiles[0] = profile;
      return profile.id;
    },
    toArray: async () => mockProfiles,
  };

  const mockSemestersTable = {
    put: async (sem: any) => {
      mockSemesters.push(sem);
      return sem.id;
    },
    toArray: async () => mockSemesters,
  };

  const mockCoursesTable = {
    put: async (course: any) => {
      mockCourses.push(course);
      return course.id;
    },
    toArray: async () => mockCourses,
  };

  const mockCardsTable = {
    put: async (card: any) => {
      mockCards.push(card);
      return card.id;
    },
    toArray: async () => mockCards,
  };

  const mockWALTable = {
    put: async (event: any) => {
      mockWAL.push(event);
      return event.id;
    },
    toArray: async () => mockWAL,
  };

  return {
    db: {
      profiles: mockProfilesTable,
      semesters: mockSemestersTable,
      courses: mockCoursesTable,
      spacedRepetitionCards: mockCardsTable,
      reconciliationQueue: mockWALTable,
      transaction: async (mode: string, tables: any[], fn: () => Promise<void>) => {
        return fn();
      },
    },
  };
});

describe('Offline Storage & State Store', () => {
  beforeEach(async () => {
    // Reset store state
    const initialProfile = {
      id: 'user-uuid-123',
      email: 'student@unilag.edu',
      fullName: 'Emmanuel',
      universityName: 'UNILAG',
      gradingScale: '5.0_WITH_E' as const,
      currentLevel: 100,
      strikeModeActive: false,
      localCreatedAt: new Date().toISOString(),
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'synced' as const,
      clientVersion: 1,
    };

    useAcademicStore.setState({
      profile: initialProfile,
      semesters: [],
      courses: [],
      cards: [],
      isHydrated: false,
    });

    await db.profiles.put(initialProfile);
  });

  it('should hydrate the in-memory Zustand state from IndexedDB on initialization', async () => {
    await useAcademicStore.getState().initializeStore();
    expect(useAcademicStore.getState().isHydrated).toBe(true);
    expect(useAcademicStore.getState().profile).not.toBeNull();
  });

  it('should save updates to courses and write events to the Reconciliation WAL Outbox', async () => {
    const newCourseInput = {
      semesterId: 'semester-uuid-1',
      courseCode: 'MTH101',
      courseTitle: 'General Mathematics I',
      creditUnits: 3,
      isPrerequisiteFor: [],
    };

    await useAcademicStore.getState().addCourse(newCourseInput);

    // Verify in-memory state
    const currentCourses = useAcademicStore.getState().courses;
    expect(currentCourses.length).toBe(1);
    expect(currentCourses[0].courseCode).toBe('MTH101');

    // Verify local DB table mock updates (IndexedDB transaction checks)
    const localCourses = await db.courses.toArray();
    expect(localCourses.length).toBeGreaterThan(0);

    // Verify WAL Outbox logs the sync action
    const localEvents = await db.reconciliationQueue.toArray();
    const courseEvent = localEvents.find(e => e.tableName === 'courses' && e.action === 'INSERT');
    expect(courseEvent).toBeDefined();
    expect(courseEvent?.payload.courseCode).toBe('MTH101');
  });

  it('should freeze active semesters when strike mode is toggled', async () => {
    // Add active semester
    await useAcademicStore.getState().addSemester({
      level: 100,
      term: 1,
      status: 'active',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      compressedMode: false,
      originalDurationWeeks: 15,
      currentDurationWeeks: 15,
    });

    // Verify pre-strike status
    expect(useAcademicStore.getState().semesters[0].status).toBe('active');

    // Toggle Strike mode
    await useAcademicStore.getState().toggleStrikeMode();

    // Verify global profiles and semester status transitions to strike_paused
    expect(useAcademicStore.getState().profile?.strikeModeActive).toBe(true);
    expect(useAcademicStore.getState().semesters[0].status).toBe('strike_paused');

    // Verify WAL reconciliation registers profile update and semester update events
    const localEvents = await db.reconciliationQueue.toArray();
    const profileEvent = localEvents.find(e => e.tableName === 'profiles' && e.action === 'UPDATE');
    const semesterEvent = localEvents.find(e => e.tableName === 'semesters' && e.action === 'UPDATE');
    
    expect(profileEvent).toBeDefined();
    expect(semesterEvent).toBeDefined();
  });
});

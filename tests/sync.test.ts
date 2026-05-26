import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushOutboxQueue } from '../frontend/src/lib/sync';
import { db } from '../frontend/src/lib/db';
import { supabase } from '../frontend/src/lib/supabaseClient';

// Mock DB and Supabase dependencies to prevent network overhead during test runs
vi.mock('../frontend/src/lib/db', () => {
  let mockWAL: any[] = [];
  let mockCourses: any[] = [];

  const mockWALTable = {
    orderBy: () => ({
      toArray: async () => mockWAL,
    }),
    delete: async (id: string) => {
      mockWAL = mockWAL.filter(e => e.id !== id);
    },
    update: async (id: string, updates: any) => {
      const ev = mockWAL.find(e => e.id === id);
      if (ev) Object.assign(ev, updates);
      return id;
    },
    toArray: async () => mockWAL,
    put: async (event: any) => {
      mockWAL.push(event);
      return event.id;
    },
  };

  const mockCoursesTable = {
    get: async (id: string) => mockCourses.find(c => c.id === id) || null,
    put: async (course: any) => {
      const idx = mockCourses.findIndex(c => c.id === course.id);
      if (idx !== -1) mockCourses[idx] = course;
      else mockCourses.push(course);
      return course.id;
    },
    toArray: async () => mockCourses,
  };

  return {
    db: {
      reconciliationQueue: mockWALTable,
      courses: mockCoursesTable,
      transaction: async (mode: string, tables: any[], fn: () => Promise<void>) => {
        return fn();
      },
    },
  };
});

vi.mock('../frontend/src/lib/supabaseClient', () => {
  let mockServerRecord: any = null;

  const mockSupabase = {
    from: (tableName: string) => ({
      select: (columns: string) => ({
        eq: (col: string, val: any) => ({
          maybeSingle: async () => {
            if (mockServerRecord) return { data: mockServerRecord, error: null };
            return { data: null, error: null };
          },
          single: async () => {
            return { data: mockServerRecord, error: null };
          },
        }),
      }),
      upsert: async (payload: any) => {
        return { data: payload, error: null };
      },
      delete: async () => {
        return { data: null, error: null };
      },
    }),
    setMockServerRecord: (record: any) => {
      mockServerRecord = record;
    },
  };

  return {
    supabase: mockSupabase,
  };
});

describe('Synchronization Queue & Concurrency Resolution', () => {
  beforeEach(async () => {
    // Reset mock lists
    const queue = await db.reconciliationQueue.toArray();
    queue.length = 0; // Clear array ref
    
    // Reset server records mocks
    (supabase as any).setMockServerRecord(null);
  });

  it('should sync outbox insert operations successfully when no conflict is detected', async () => {
    const coursePayload = {
      id: 'course-uuid-1',
      courseCode: 'MTH101',
      creditUnits: 3,
      localUpdatedAt: new Date().toISOString(),
      clientVersion: 1,
    };

    // Log WAL Event
    await db.reconciliationQueue.put({
      id: 'wal-event-uuid-1',
      tableName: 'courses',
      recordId: coursePayload.id,
      action: 'INSERT',
      payload: coursePayload,
      timestamp: Date.now(),
      retryCount: 0,
    });

    const stats = await flushOutboxQueue();
    expect(stats.processed).toBe(1);
    expect(stats.success).toBe(1);
    
    // Verify WAL cleans itself up on success
    const remainingEvents = await db.reconciliationQueue.toArray();
    expect(remainingEvents.length).toBe(0);
  });

  it('should override local changes with server states if the server holds a higher version index', async () => {
    const localCoursePayload = {
      id: 'course-uuid-2',
      courseCode: 'MTH101',
      creditUnits: 3,
      localUpdatedAt: '2026-05-26T12:00:00.000Z',
      clientVersion: 1, // Stale local version
    };

    // Mock server record with a higher version
    (supabase as any).setMockServerRecord({
      id: 'course-uuid-2',
      course_code: 'MTH101',
      credit_units: 4, // Higher server credit index
      client_version: 3, // Newer version
      local_updated_at: '2026-05-26T13:00:00.000Z', // Newer timestamp
    });

    // Seed local db course table
    await db.courses.put(localCoursePayload);

    // Log stale WAL Event
    await db.reconciliationQueue.put({
      id: 'wal-event-uuid-2',
      tableName: 'courses',
      recordId: localCoursePayload.id,
      action: 'UPDATE',
      payload: localCoursePayload,
      timestamp: Date.now(),
      retryCount: 0,
    });

    const stats = await flushOutboxQueue();
    expect(stats.success).toBe(1);

    // Verify local IndexedDB was updated with newer server records data
    const localCourses = await db.courses.toArray();
    expect(localCourses[0].credit_units).toBe(4); // Overwritten by server
  });
});

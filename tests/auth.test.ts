import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeGuestProfile, handleAuthUnion } from '../frontend/src/lib/auth';
import { db } from '../frontend/src/lib/db';

// Mock Dexie behaviour to prevent standard database storage errors in headless tests
vi.mock('../frontend/src/lib/db', () => {
  const mockProfiles: any[] = [];
  const mockSemesters: any[] = [];

  const mockProfilesTable = {
    toCollection: () => ({
      first: async () => mockProfiles[0] || null,
    }),
    put: async (profile: any) => {
      mockProfiles[0] = profile;
      return profile.id;
    },
    delete: async (id: string) => {
      mockProfiles.shift();
    },
  };

  const mockSemestersTable = {
    where: (key: string) => ({
      equals: (val: any) => ({
        toArray: async () => mockSemesters.filter(s => s[key] === val),
      }),
    }),
    update: async (id: string, updates: any) => {
      const sem = mockSemesters.find(s => s.id === id);
      if (sem) Object.assign(sem, updates);
      return id;
    },
  };

  return {
    db: {
      profiles: mockProfilesTable,
      semesters: mockSemestersTable,
      transaction: async (mode: string, tables: any[], fn: () => Promise<void>) => {
        return fn();
      },
    },
  };
});

describe('Authentication & Session Transitions', () => {
  it('should initialize a local guest profile if no local profile is cached', async () => {
    const session = await initializeGuestProfile();
    expect(session.isGuest).toBe(true);
    expect(session.email).toBe('guest@smarthub.local');
    expect(session.userId).toBeDefined();
  });

  it('should transition and upgrade a guest profile into a cloud student account on Auth Union', async () => {
    // Seed Guest profile
    await initializeGuestProfile();

    const supabaseUser = {
      id: 'supabase-authenticated-user-uuid',
      email: 'student@unilag.edu.ng',
    };

    const session = await handleAuthUnion(supabaseUser);
    expect(session.isGuest).toBe(false);
    expect(session.userId).toBe(supabaseUser.id);
    expect(session.email).toBe(supabaseUser.email);
  });
});

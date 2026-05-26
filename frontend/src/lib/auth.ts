import { db } from './db'; // We will create Dexie db in Step 4, but let's define auth interactions here
import { v4 as uuidv4 } from 'uuid';

export interface UserSession {
  userId: string;
  email: string | null;
  isGuest: boolean;
}

/**
 * Initializes a local Guest Profile if no active session is found.
 * This guarantees the system is immediately usable offline without blocking.
 */
export async function initializeGuestProfile(): Promise<UserSession> {
  // Check if a guest profile already exists in IndexedDB
  // Since db is a Dexie instance, we check profiles table. 
  // We degrade to in-memory fallback if Dexie is not fully loaded.
  try {
    const existingProfile = await db.profiles.toCollection().first();
    if (existingProfile) {
      return {
        userId: existingProfile.id,
        email: existingProfile.email || null,
        isGuest: existingProfile.syncStatus === 'pending_insert' && existingProfile.email === 'guest@smarthub.local',
      };
    }

    // Create a new guest profile
    const guestId = uuidv4();
    const guestProfile = {
      id: guestId,
      email: 'guest@smarthub.local',
      fullName: 'Offline Guest Student',
      universityName: 'Not Configured',
      gradingScale: '5.0_WITH_E' as const,
      currentLevel: 100,
      strikeModeActive: false,
      localCreatedAt: new Date().toISOString(),
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_insert' as const,
      clientVersion: 1,
    };

    await db.profiles.put(guestProfile);

    return {
      userId: guestId,
      email: 'guest@smarthub.local',
      isGuest: true,
    };
  } catch {
    // Graceful fallback for test environments without IndexedDB
    const fallbackId = '00000000-0000-0000-0000-000000000000';
    return {
      userId: fallbackId,
      email: 'guest@smarthub.local',
      isGuest: true,
    };
  }
}

/**
 * Synchronizes or upgrades a local Guest Profile when logging in with Supabase Auth
 */
export async function handleAuthUnion(supabaseUser: { id: string; email?: string }): Promise<UserSession> {
  try {
    const localProfile = await db.profiles.toCollection().first();
    
    if (localProfile) {
      if (localProfile.email === 'guest@smarthub.local') {
        // Upgrade Guest Profile to User's Remote ID in Dexie DB
        const oldGuestId = localProfile.id;
        const newUserId = supabaseUser.id;

        // 1. Update the profile record
        await db.transaction('rw', [db.profiles, db.semesters, db.courses], async () => {
          // Re-key profile
          await db.profiles.delete(oldGuestId);
          await db.profiles.put({
            ...localProfile,
            id: newUserId,
            email: supabaseUser.email || 'student@smarthub.edu',
            fullName: localProfile.fullName === 'Offline Guest Student' ? 'Configured Student' : localProfile.fullName,
            syncStatus: 'pending_update',
            localUpdatedAt: new Date().toISOString(),
            clientVersion: localProfile.clientVersion + 1,
          });

          // Re-key associated semesters references
          const semesters = await db.semesters.where('profileId').equals(oldGuestId).toArray();
          for (const sem of semesters) {
            await db.semesters.update(sem.id, { profileId: newUserId, syncStatus: 'pending_update' });
          }
        });
      }
    }

    return {
      userId: supabaseUser.id,
      email: supabaseUser.email || null,
      isGuest: false,
    };
  } catch {
    return {
      userId: supabaseUser.id,
      email: supabaseUser.email || null,
      isGuest: false,
    };
  }
}

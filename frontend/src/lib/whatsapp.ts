import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { initializeGuestProfile } from './auth';

export interface SharedDeckPayload {
  courseCode: string;
  courseTitle: string;
  creditUnits: number;
  cards: Array<{
    frontContent: string;
    backContent: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>;
}

/**
 * Generates the standardized WhatsApp share template with Unicode formatting
 */
export function generateWhatsAppDigest(
  courseCode: string,
  courseTitle: string,
  cardCount: number,
  scheduledSession: string,
  sharedBy: string,
  deepLink: string
): string {
  const divider = '──────────────────────────';
  return `📚 *SMARTHUB STUDY BRIEF*
${divider}
🎓 Course: ${courseCode} (${courseTitle})
🔥 Deck Items: ${cardCount} Active Cards
📅 Scheduled Session: ${scheduledSession}
🚀 Shared by: ${sharedBy}

Join this group study or import this card deck directly into your Smart Student Hub workspace:
👉 ${deepLink}
${divider}
💡 _"Hard work beats talent when talent fails to work hard."_`;
}

/**
 * Encodes SharedDeckPayload into a URL-safe minified Base64 string supporting Unicode
 */
export function encodeDeckPayload(payload: SharedDeckPayload): string {
  const jsonStr = JSON.stringify(payload);
  const utf8Bytes = new TextEncoder().encode(jsonStr);
  
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  
  const base64 = btoa(binary);
  // URL-safe base64 conversion
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a URL-safe Base64 string back into a SharedDeckPayload supporting Unicode
 */
export function decodeDeckPayload(hash: string): SharedDeckPayload {
  let base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
  
  // Re-append removed base64 padding
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const jsonStr = new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr) as SharedDeckPayload;
}

/**
 * Transactionally imports a decoded study deck into local IndexedDB and queues sync outbox entries.
 */
export async function importSharedDeck(payload: SharedDeckPayload): Promise<{ courseId: string; semesterId: string }> {
  // 1. Guarantee Guest Profile presence
  const session = await initializeGuestProfile();
  
  // 2. Find or seed a default active semester to attach our course structure
  let semester = await db.semesters.toCollection().first();
  if (!semester) {
    const semId = uuidv4();
    semester = {
      id: semId,
      profileId: session.userId,
      level: 100,
      term: 1,
      status: 'active',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 15 * 7 * 24 * 60 * 60 * 1000).toISOString(),
      compressedMode: false,
      originalDurationWeeks: 15,
      currentDurationWeeks: 15,
      localCreatedAt: new Date().toISOString(),
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'pending_insert',
      clientVersion: 1,
    };
    await db.semesters.put(semester);
    
    // Log semester creation in the sync queue outbox
    await db.reconciliationQueue.put({
      id: uuidv4(),
      tableName: 'semesters',
      recordId: semId,
      action: 'INSERT',
      payload: semester,
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  // 3. Setup Course data
  const courseId = uuidv4();
  const newCourse = {
    id: courseId,
    semesterId: semester.id,
    courseCode: payload.courseCode.trim().toUpperCase(),
    courseTitle: payload.courseTitle.trim(),
    creditUnits: payload.creditUnits,
    isPrerequisiteFor: [],
    localCreatedAt: new Date().toISOString(),
    localUpdatedAt: new Date().toISOString(),
    syncStatus: 'pending_insert' as const,
    clientVersion: 1,
  };

  // 4. Batch transaction for Course & Spaced Repetition Cards
  await db.transaction('rw', [db.courses, db.spacedRepetitionCards, db.reconciliationQueue], async () => {
    // Write Course & queue WAL
    await db.courses.put(newCourse);
    await db.reconciliationQueue.put({
      id: uuidv4(),
      tableName: 'courses',
      recordId: courseId,
      action: 'INSERT',
      payload: newCourse,
      timestamp: Date.now(),
      retryCount: 0,
    });

    // Write Cards & queue WAL
    for (const card of payload.cards) {
      const cardId = uuidv4();
      const newCard = {
        id: cardId,
        courseId: courseId,
        frontContent: card.frontContent.trim(),
        backContent: card.backContent.trim(),
        difficulty: card.difficulty,
        boxNumber: 1,
        nextReviewDue: new Date().toISOString(),
        proportionalFactor: 1.0,
        localCreatedAt: new Date().toISOString(),
        localUpdatedAt: new Date().toISOString(),
        syncStatus: 'pending_insert' as const,
        clientVersion: 1,
      };

      await db.spacedRepetitionCards.put(newCard);
      await db.reconciliationQueue.put({
        id: uuidv4(),
        tableName: 'spaced_repetition_cards',
        recordId: cardId,
        action: 'INSERT',
        payload: newCard,
        timestamp: Date.now(),
        retryCount: 0,
      });
    }
  });

  return { courseId, semesterId: semester.id };
}

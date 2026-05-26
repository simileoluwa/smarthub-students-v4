import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateWhatsAppDigest,
  encodeDeckPayload,
  decodeDeckPayload,
  importSharedDeck,
  SharedDeckPayload
} from '../tools/whatsapp';

// Mock Dexie database behavior to support headless test execution without standard IndexedDB drivers
vi.mock('../frontend/src/lib/db', () => {
  const mockProfiles: any[] = [];
  const mockSemesters: any[] = [];
  const mockCourses: any[] = [];
  const mockCards: any[] = [];
  const mockWAL: any[] = [];

  return {
    db: {
      profiles: {
        toCollection: () => ({
          first: async () => mockProfiles[0] || null,
        }),
        put: async (profile: any) => {
          mockProfiles[0] = profile;
          return profile.id;
        },
      },
      semesters: {
        toCollection: () => ({
          first: async () => mockSemesters[0] || null,
        }),
        put: async (sem: any) => {
          mockSemesters[0] = sem;
          return sem.id;
        },
      },
      courses: {
        put: async (course: any) => {
          mockCourses.push(course);
          return course.id;
        },
        toArray: async () => mockCourses,
      },
      spacedRepetitionCards: {
        put: async (card: any) => {
          mockCards.push(card);
          return card.id;
        },
        toArray: async () => mockCards,
      },
      reconciliationQueue: {
        put: async (event: any) => {
          mockWAL.push(event);
          return event.id;
        },
        toArray: async () => mockWAL,
      },
      transaction: async (mode: string, tables: any[], fn: () => Promise<void>) => {
        return fn();
      },
    },
  };
});

describe('WhatsApp Coordination Engine (SOP-005)', () => {
  describe('Study Digest Formatter', () => {
    it('should generate the exact formatted copy-paste study brief matching the SOP template', () => {
      const digest = generateWhatsAppDigest(
        'PHY111',
        'General Physics I',
        18,
        'Today, 5:00 PM',
        'Tunde',
        'https://smarthub.student/deck/PHY111-e4b2d'
      );

      expect(digest).toContain('📚 *SMARTHUB STUDY BRIEF*');
      expect(digest).toContain('🎓 Course: PHY111 (General Physics I)');
      expect(digest).toContain('🔥 Deck Items: 18 Active Cards');
      expect(digest).toContain('📅 Scheduled Session: Today, 5:00 PM');
      expect(digest).toContain('🚀 Shared by: Tunde');
      expect(digest).toContain('👉 https://smarthub.student/deck/PHY111-e4b2d');
      expect(digest).toContain('💡 _"Hard work beats talent when talent fails to work hard."_');
      expect(digest).toContain('──────────────────────────');
    });
  });

  describe('Deck Base64 Encoder / Decoder Round-trip', () => {
    it('should perform flawless round-trip encoding and decoding for a typical study deck', () => {
      const mockPayload: SharedDeckPayload = {
        courseCode: 'MTH101',
        courseTitle: 'Elementary Mathematics I',
        creditUnits: 4,
        cards: [
          { frontContent: 'What is lim (x->0) sin(x)/x?', backContent: '1', difficulty: 'easy' },
          { frontContent: 'What is the derivative of e^x?', backContent: 'e^x', difficulty: 'medium' }
        ]
      };

      const encoded = encodeDeckPayload(mockPayload);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = decodeDeckPayload(encoded);
      expect(decoded.courseCode).toBe('MTH101');
      expect(decoded.courseTitle).toBe('Elementary Mathematics I');
      expect(decoded.creditUnits).toBe(4);
      expect(decoded.cards.length).toBe(2);
      expect(decoded.cards[0].frontContent).toBe('What is lim (x->0) sin(x)/x?');
      expect(decoded.cards[1].difficulty).toBe('medium');
    });

    it('should correctly handle and preserve high-byte Unicode characters (Yoruba, Igbo, Hausa accent marks)', () => {
      const mockPayload: SharedDeckPayload = {
        courseCode: 'YOR101',
        courseTitle: 'Ìdánwò Yorùbá I',
        creditUnits: 2,
        cards: [
          { frontContent: 'Báwo ni àwọn ọmọ lédè Yorùbá?', backContent: 'Wọ́n wà dáadáa!', difficulty: 'hard' }
        ]
      };

      const encoded = encodeDeckPayload(mockPayload);
      const decoded = decodeDeckPayload(encoded);

      expect(decoded.courseTitle).toBe('Ìdánwò Yorùbá I');
      expect(decoded.cards[0].frontContent).toBe('Báwo ni àwọn ọmọ lédè Yorùbá?');
      expect(decoded.cards[0].backContent).toBe('Wọ́n wà dáadáa!');
    });
  });

  describe('Bandwidth Size Constraints', () => {
    it('should ensure the encoded Base64 string of a large 50-card deck is strictly under the 30KB (30720 bytes) budget limit', () => {
      const cardsList = Array.from({ length: 50 }, (_, i) => ({
        frontContent: `This is the detailed question for flashcard number ${i} which explains a core engineering concept.`,
        backContent: `This is the detailed answer for flashcard number ${i} which provides complete derivations.`,
        difficulty: (i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard') as 'easy' | 'medium' | 'hard'
      }));

      const largePayload: SharedDeckPayload = {
        courseCode: 'ENG211',
        courseTitle: 'Engineering Mathematics & Computing Applications',
        creditUnits: 6,
        cards: cardsList
      };

      const encoded = encodeDeckPayload(largePayload);
      const byteLength = new TextEncoder().encode(encoded).length;

      expect(byteLength).toBeLessThan(30720);
      
      const decoded = decodeDeckPayload(encoded);
      expect(decoded.cards.length).toBe(50);
      expect(decoded.courseCode).toBe('ENG211');
      expect(decoded.cards[49].frontContent).toContain('flashcard number 49');
    });
  });

  describe('Import Shared Deck Transaction (importSharedDeck)', () => {
    it('should successfully transactionally write shared deck details into local tables and log reconciliation outbox WAL entries', async () => {
      const importPayload: SharedDeckPayload = {
        courseCode: 'PHY111',
        courseTitle: 'General Physics I',
        creditUnits: 3,
        cards: [
          { frontContent: 'What is gravitational acceleration?', backContent: '9.81 m/s^2', difficulty: 'easy' },
          { frontContent: 'What is Newton\'s second law?', backContent: 'F = ma', difficulty: 'medium' }
        ]
      };

      // Execute import operation
      const { courseId, semesterId } = await importSharedDeck(importPayload);

      expect(courseId).toBeDefined();
      expect(semesterId).toBeDefined();

      // Resolve imported collections from mock db import
      const { db } = await import('../frontend/src/lib/db');
      
      const courses = await db.courses.toArray();
      const cards = await db.spacedRepetitionCards.toArray();
      const walEvents = await db.reconciliationQueue.toArray();

      // Assert course is imported
      const importedCourse = courses.find(c => c.id === courseId);
      expect(importedCourse).toBeDefined();
      expect(importedCourse?.courseCode).toBe('PHY111');
      expect(importedCourse?.creditUnits).toBe(3);

      // Assert cards are imported
      const importedCards = cards.filter(c => c.courseId === courseId);
      expect(importedCards.length).toBe(2);
      expect(importedCards[0].frontContent).toBe('What is gravitational acceleration?');
      expect(importedCards[1].backContent).toBe('F = ma');

      // Assert WAL entries are created for sync
      const courseWal = walEvents.find(e => e.tableName === 'courses' && e.recordId === courseId);
      expect(courseWal).toBeDefined();
      expect(courseWal?.action).toBe('INSERT');
    });
  });
});

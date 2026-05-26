import { describe, it, expect } from 'vitest';
import { 
  computeSM2, 
  calculatePSRInterval, 
  calculateNextReviewDue,
  CardState, 
  ReviewRating, 
  PSRInput 
} from '../tools/spaced_rep';

describe('Proportional Spaced Repetition (PSR) Engine', () => {
  describe('Base SM-2 Scheduling Logic', () => {
    it('should reset repetitions and set interval to 1 on failure (rating = 1)', () => {
      const state: CardState = { easinessFactor: 2.5, repetitions: 4, intervalDays: 15 };
      const nextState = computeSM2(1, state);
      
      expect(nextState.repetitions).toBe(0);
      expect(nextState.intervalDays).toBe(1);
      // EF should change based on formula: EF = EF + (0.1 - (4-1)*(0.08 + (4-1)*0.02))
      // 2.5 + (0.1 - 3 * (0.08 + 3 * 0.02)) = 2.5 + (0.1 - 3 * 0.14) = 2.5 + (0.1 - 0.42) = 2.18
      expect(nextState.easinessFactor).toBe(2.18);
    });

    it('should set interval to 1 day on first successful repetition (repetitions = 0)', () => {
      const state: CardState = { easinessFactor: 2.5, repetitions: 0, intervalDays: 0 };
      const nextState = computeSM2(3, state); // Good rating
      
      expect(nextState.repetitions).toBe(1);
      expect(nextState.intervalDays).toBe(1);
    });

    it('should set interval to 4 days on second successful repetition (repetitions = 1)', () => {
      const state: CardState = { easinessFactor: 2.5, repetitions: 1, intervalDays: 1 };
      const nextState = computeSM2(3, state);
      
      expect(nextState.repetitions).toBe(2);
      expect(nextState.intervalDays).toBe(4);
    });

    it('should multiply previous interval by EF for repetitions >= 2', () => {
      const state: CardState = { easinessFactor: 2.0, repetitions: 2, intervalDays: 4 };
      const nextState = computeSM2(3, state); // Good (rating = 3)
      
      expect(nextState.repetitions).toBe(3);
      // Math.ceil(4 * 2.0) = 8 days
      expect(nextState.intervalDays).toBe(8);
    });

    it('should clamp easinessFactor at a minimum floor of 1.3', () => {
      const state: CardState = { easinessFactor: 1.4, repetitions: 2, intervalDays: 4 };
      // Multiple failures / bad reviews
      const nextState = computeSM2(1, state);
      expect(nextState.easinessFactor).toBe(1.3);
    });
  });

  describe('PSR Proportional Modifiers', () => {
    describe('Credit Unit Multiplier (F_credit)', () => {
      it('should shorten review intervals for high credit courses (6 CU gets 0.90)', () => {
        const input: PSRInput = { creditUnits: 6, strikeActive: false };
        const interval = calculatePSRInterval(10, input);
        // F_credit = 1.20 - (0.05 * 6) = 0.90
        // final = 10 * 0.90 * 1.0 (proximity) * 1.0 (strike) = 9
        expect(interval).toBe(9);
      });

      it('should retain baseline intervals for standard courses (4 CU gets 1.00)', () => {
        const input: PSRInput = { creditUnits: 4, strikeActive: false };
        const interval = calculatePSRInterval(10, input);
        // F_credit = 1.20 - (0.05 * 4) = 1.00
        expect(interval).toBe(10);
      });

      it('should widen intervals for low credit courses (1 CU gets 1.15)', () => {
        const input: PSRInput = { creditUnits: 1, strikeActive: false };
        const interval = calculatePSRInterval(10, input);
        // F_credit = 1.20 - (0.05 * 1) = 1.15
        // final = 10 * 1.15 = 11.5 -> rounds to 12
        expect(interval).toBe(12);
      });

      it('should throw an error on invalid credit units', () => {
        expect(() => calculatePSRInterval(10, { creditUnits: 0, strikeActive: false })).toThrow();
        expect(() => calculatePSRInterval(10, { creditUnits: 7, strikeActive: false })).toThrow();
        expect(() => calculatePSRInterval(10, { creditUnits: 3.5, strikeActive: false })).toThrow();
      });
    });

    describe('Exam Proximity Compression (F_proximity)', () => {
      it('should compress review intervals proportionally as exam approaches', () => {
        const input: PSRInput = { 
          creditUnits: 4, // F_credit = 1.0
          daysUntilExam: 40,
          totalSemesterDays: 80, // 40 / 80 = 0.50 factor
          strikeActive: false 
        };
        const interval = calculatePSRInterval(10, input);
        // final = 10 * 1.0 * 0.50 * 1.0 = 5
        expect(interval).toBe(5);
      });

      it('should clamp proximity compression at a floor of 0.20 to prevent fatigue', () => {
        const input: PSRInput = { 
          creditUnits: 4,
          daysUntilExam: 5,
          totalSemesterDays: 100, // 5 / 100 = 0.05 -> clamped to 0.20
          strikeActive: false 
        };
        const interval = calculatePSRInterval(10, input);
        // final = 10 * 1.0 * 0.20 = 2
        expect(interval).toBe(2);
      });

      it('should ignore proximity factors if exam/semester variables are missing or invalid', () => {
        const inputMissing: PSRInput = { creditUnits: 4, strikeActive: false };
        const intervalMissing = calculatePSRInterval(10, inputMissing);
        expect(intervalMissing).toBe(10);

        const inputInvalidDays: PSRInput = { creditUnits: 4, daysUntilExam: null, totalSemesterDays: 0, strikeActive: false };
        const intervalInvalidDays = calculatePSRInterval(10, inputInvalidDays);
        expect(intervalInvalidDays).toBe(10);
      });
    });

    describe('Active ASUU Strike Conservation (F_strike)', () => {
      it('should widen intervals by 50% during strikes to reduce pressure', () => {
        const input: PSRInput = { creditUnits: 4, strikeActive: true };
        const interval = calculatePSRInterval(10, input);
        // final = 10 * 1.0 * 1.0 * 1.50 = 15
        expect(interval).toBe(15);
      });

      it('should strictly clamp maximum strike interval to 21 days to prevent memory decay', () => {
        const input: PSRInput = { creditUnits: 4, strikeActive: true };
        // Base = 20 days. Striking: 20 * 1.50 = 30 days -> clamped to 21 days
        const interval = calculatePSRInterval(20, input);
        expect(interval).toBe(21);
      });
    });

    describe('General Mathematical Constraints', () => {
      it('should clamp final rounded days to a minimum of 1 day', () => {
        const input: PSRInput = { 
          creditUnits: 4, 
          daysUntilExam: 2, 
          totalSemesterDays: 100, // 0.20 proximity
          strikeActive: false 
        };
        // Base = 2 days -> 2 * 0.20 = 0.4 days -> rounded = 0 days -> clamped to 1 day minimum
        const interval = calculatePSRInterval(2, input);
        expect(interval).toBe(1);
      });
    });
  });

  describe('Midnight Local Time Due Date Alignment', () => {
    it('should generate ISO date strings set exactly to midnight local user time', () => {
      const fixedCurrentDate = '2026-05-26T14:00:00.000Z';
      const nextDueString = calculateNextReviewDue(5, fixedCurrentDate);
      
      const parsedDate = new Date(nextDueString);
      // Asserts that hours, minutes, seconds, and milliseconds are reset to 0 in local time context
      expect(parsedDate.getHours()).toBe(0);
      expect(parsedDate.getMinutes()).toBe(0);
      expect(parsedDate.getSeconds()).toBe(0);
      expect(parsedDate.getMilliseconds()).toBe(0);

      // Verify that it is precisely 5 days ahead of the midnight base
      const midnightBase = new Date(fixedCurrentDate);
      midnightBase.setHours(0, 0, 0, 0);
      
      const expectedTarget = new Date(midnightBase);
      expectedTarget.setDate(expectedTarget.getDate() + 5);

      expect(parsedDate.getTime()).toBe(expectedTarget.getTime());
    });
  });
});

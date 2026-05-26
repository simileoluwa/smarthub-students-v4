export interface CardState {
  easinessFactor: number; // Default: 2.5
  repetitions: number;    // Default: 0
  intervalDays: number;   // Default: 0
}

export type ReviewRating = 1 | 2 | 3 | 4; // 1 = Forgot, 2 = Hard, 3 = Good, 4 = Easy

export interface PSRInput {
  creditUnits: number;
  daysUntilExam?: number | null;
  totalSemesterDays?: number | null;
  strikeActive: boolean;
}

/**
 * Core SM-2 Base Spaced Repetition Algorithm.
 * Resets repetitions on fail, sets initial intervals, and updates easinessFactor.
 */
export function computeSM2(rating: ReviewRating, state: CardState): CardState {
  let { easinessFactor, repetitions, intervalDays } = state;

  if (rating === 1) { // Forgot
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 4; // Squeezed timeline standard
    } else {
      intervalDays = Math.ceil(intervalDays * easinessFactor);
    }
    repetitions += 1;
  }

  // Adjust EF based on rating: EF = EF + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02))
  easinessFactor = easinessFactor + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02));
  if (easinessFactor < 1.3) {
    easinessFactor = 1.3; // EF Floor
  }

  // Round easinessFactor to 2 decimal places to prevent floating point inaccuracies
  easinessFactor = Math.round((easinessFactor + Number.EPSILON) * 100) / 100;

  return { easinessFactor, repetitions, intervalDays };
}

/**
 * Calculates Proportional Spaced Repetition (PSR) interval.
 * Scales the base SM-2 interval by: F_credit * F_proximity * F_strike.
 * Implements strike-mode safety floor (21 days max) and rounds to integer days (1 day min).
 */
export function calculatePSRInterval(baseIntervalDays: number, input: PSRInput): number {
  const { creditUnits, daysUntilExam, totalSemesterDays, strikeActive } = input;

  // 1. Credit Unit Weight Multiplier (F_credit)
  if (!Number.isInteger(creditUnits) || creditUnits < 1 || creditUnits > 6) {
    throw new Error(`Invalid credit units: must be an integer between 1 and 6. Got ${creditUnits}`);
  }
  const fCredit = 1.20 - (0.05 * creditUnits);

  // 2. Exam Proximity Compression Multiplier (F_proximity)
  let fProximity = 1.00;
  if (
    daysUntilExam !== undefined && 
    daysUntilExam !== null && 
    totalSemesterDays !== undefined && 
    totalSemesterDays !== null && 
    totalSemesterDays > 0
  ) {
    fProximity = daysUntilExam / totalSemesterDays;
    fProximity = Math.max(0.20, Math.min(1.00, fProximity));
  }

  // 3. Strike Mode Multiplier (F_strike)
  const fStrike = strikeActive ? 1.50 : 1.00;

  // 4. Calculate Final Raw Interval
  let finalInterval = baseIntervalDays * fCredit * fProximity * fStrike;

  // 5. Apply ASUU Strike Safety Ceiling (Max 21 days)
  if (strikeActive && finalInterval > 21) {
    finalInterval = 21;
  }

  // 6. Round to nearest integer day and clamp to a minimum of 1 day
  return Math.max(1, Math.round(finalInterval));
}

/**
 * Aligns the next review due date to midnight (00:00:00) local user time
 * of the target day, returning a standardized ISO date string.
 */
export function calculateNextReviewDue(finalIntervalDays: number, currentDate?: string | Date): string {
  const baseDate = currentDate ? new Date(currentDate) : new Date();
  baseDate.setHours(0, 0, 0, 0); // Local midnight reset
  baseDate.setDate(baseDate.getDate() + finalIntervalDays);
  return baseDate.toISOString();
}

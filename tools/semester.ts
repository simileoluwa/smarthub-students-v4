export type SemesterStatus = 'active' | 'completed' | 'strike_paused';

export interface SemesterTimelineInput {
  id: string;
  level: number;
  term: number;
  status: SemesterStatus;
  startDate: string; // ISO Date String
  endDate: string; // ISO Date String
  compressedMode: boolean;
  originalDurationWeeks: number;
  currentDurationWeeks: number;
  strikeStartDate?: string; // ISO Date String
}

/**
 * Deterministic helper to calculate the exact difference in weeks between two dates
 */
export function calculateDifferenceInWeeks(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.round((diffDays / 7) * 10) / 10; // Round to 1 decimal place
}

/**
 * Transitions a semester into strike-paused mode
 * Locks countdowns and saves the strike start date.
 */
export function pauseSemesterForStrike(
  semester: SemesterTimelineInput,
  strikeStart: string
): SemesterTimelineInput {
  if (semester.status !== 'active') {
    throw new Error('Only active semesters can be paused for strikes.');
  }

  return {
    ...semester,
    status: 'strike_paused',
    strikeStartDate: strikeStart,
  };
}

/**
 * Recalibrates semester dates, duration, and compression parameters when resuming after a strike.
 */
export function recalibrateSemesterOnResume(
  semester: SemesterTimelineInput,
  resumeDate: string,
  newEndDate: string
): SemesterTimelineInput {
  if (semester.status !== 'strike_paused' || !semester.strikeStartDate) {
    throw new Error('Semester is not currently paused in strike mode.');
  }

  const strikeStart = new Date(semester.strikeStartDate);
  const resume = new Date(resumeDate);
  const originalEnd = new Date(semester.endDate);

  // 1. Calculate strike duration in days
  const strikeDurationMs = resume.getTime() - strikeStart.getTime();
  if (strikeDurationMs < 0) {
    throw new Error('Resume date cannot be before the strike start date.');
  }

  // 2. Calculate remaining days planned before the strike occurred
  const remainingPlannedMs = originalEnd.getTime() - strikeStart.getTime();
  const originalPlannedRemainingDays = Math.ceil(remainingPlannedMs / (1000 * 60 * 60 * 24));

  // 3. Calculate new remaining days available based on senate catch-up schedule
  const newEnd = new Date(newEndDate);
  const newAvailableMs = newEnd.getTime() - resume.getTime();
  const actualRemainingDays = Math.ceil(newAvailableMs / (1000 * 60 * 60 * 24));

  if (actualRemainingDays <= 0) {
    throw new Error('New end date must be after the resume date.');
  }

  // 4. Calculate compression ratio
  const compressionRatio = actualRemainingDays / originalPlannedRemainingDays;
  const isCompressed = compressionRatio < 0.95; // Compressed if time is squeezed by over 5%

  // 5. Calculate new total duration of active study weeks
  const originalTotalWeeks = semester.originalDurationWeeks;
  const newDurationWeeks = isCompressed
    ? Math.round((originalTotalWeeks * compressionRatio) * 10) / 10
    : originalTotalWeeks;

  return {
    ...semester,
    status: 'active',
    endDate: newEndDate,
    compressedMode: isCompressed,
    currentDurationWeeks: newDurationWeeks,
    strikeStartDate: undefined, // Clear strike tracker
  };
}

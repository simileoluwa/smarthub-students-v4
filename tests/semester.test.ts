import { describe, it, expect } from 'vitest';
import { 
  calculateDifferenceInWeeks, 
  pauseSemesterForStrike, 
  recalibrateSemesterOnResume,
  SemesterTimelineInput 
} from '../tools/semester';

describe('Deterministic Semester Timeline Engine', () => {
  it('should calculate difference in weeks accurately', () => {
    const start = '2026-01-01T00:00:00.000Z';
    const end = '2026-04-16T00:00:00.000Z'; // 105 days = 15 weeks
    const weeks = calculateDifferenceInWeeks(start, end);
    expect(weeks).toBe(15);
  });

  it('should pause an active semester during ASUU strike triggers', () => {
    const activeSemester: SemesterTimelineInput = {
      id: 'sem-1',
      level: 100,
      term: 1,
      status: 'active',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-04-16T00:00:00.000Z',
      compressedMode: false,
      originalDurationWeeks: 15,
      currentDurationWeeks: 15,
    };

    const strikeStart = '2026-02-05T00:00:00.000Z'; // Strike after 5 weeks
    const pausedSem = pauseSemesterForStrike(activeSemester, strikeStart);
    
    expect(pausedSem.status).toBe('strike_paused');
    expect(pausedSem.strikeStartDate).toBe(strikeStart);
  });

  it('should recalibrate and squeeze timeline on resume in compressed semesters', () => {
    const pausedSemester: SemesterTimelineInput = {
      id: 'sem-2',
      level: 100,
      term: 1,
      status: 'strike_paused',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-04-16T00:00:00.000Z', // Original remaining: 70 days (10 weeks)
      compressedMode: false,
      originalDurationWeeks: 15,
      currentDurationWeeks: 15,
      strikeStartDate: '2026-02-05T00:00:00.000Z', // Struck after 5 weeks
    };

    // Strike called off, resumes on May 1st.
    // Senate compresses remaining 10 weeks of syllabus/exams into 6 weeks (42 days)
    const resumeDate = '2026-05-01T00:00:00.000Z';
    const newEndDate = '2026-06-12T00:00:00.000Z'; // 42 days later

    const recalibratedSem = recalibrateSemesterOnResume(pausedSemester, resumeDate, newEndDate);
    
    expect(recalibratedSem.status).toBe('active');
    expect(recalibratedSem.compressedMode).toBe(true);
    expect(recalibratedSem.currentDurationWeeks).toBe(9); // 5 weeks (completed) + 4 weeks (squeezed duration index) = 9 weeks current (squeezed from 15)
    expect(recalibratedSem.strikeStartDate).toBeUndefined();
  });

  it('should throw exceptions on invalid status transitions and dates', () => {
    const completedSemester: SemesterTimelineInput = {
      id: 'sem-3',
      level: 100,
      term: 1,
      status: 'completed',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-04-16T00:00:00.000Z',
      compressedMode: false,
      originalDurationWeeks: 15,
      currentDurationWeeks: 15,
    };

    // Edge case: cannot pause completed semester
    expect(() => pauseSemesterForStrike(completedSemester, '2026-02-05T00:00:00.000Z')).toThrow(
      'Only active semesters can be paused'
    );
  });
});

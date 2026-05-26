export type GradingScale = '5.0_WITH_E' | '5.0_NO_E' | '4.0_NUC' | '7.0_UI';
export type CGPAPolicy = 'accumulative' | 'replacement';

export interface CourseInput {
  courseCode: string;
  creditUnits: number;
  gradeAchieved?: string | null;
}

export const GRADE_VALUES: Record<GradingScale, Record<string, number>> = {
  '5.0_WITH_E': { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1, 'F': 0 },
  '5.0_NO_E':   { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 0 },
  '4.0_NUC':    { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 },
  '7.0_UI':     { 'A': 7, 'B': 6, 'C': 5, 'D': 4, 'E': 3, 'F': 0 },
};

/**
 * Validates a single course's inputs.
 * Throws an Error if invalid.
 */
export function validateCourse(course: CourseInput, scale: GradingScale): void {
  if (!Number.isInteger(course.creditUnits) || course.creditUnits < 1 || course.creditUnits > 6) {
    throw new Error(`Invalid credit units: must be an integer between 1 and 6. Got ${course.creditUnits} for course ${course.courseCode || 'unknown'}`);
  }

  if (course.gradeAchieved !== undefined && course.gradeAchieved !== null && course.gradeAchieved !== '') {
    const scaleValues = GRADE_VALUES[scale];
    const gradeVal = course.gradeAchieved.trim().toUpperCase();
    if (scaleValues[gradeVal] === undefined) {
      throw new Error(`Invalid grade: "${course.gradeAchieved}" is not valid for grading scale ${scale}`);
    }
  }
}

/**
 * Calculates GPA for a single semester with absolute decimal precision
 */
export function calculateSemesterGPA(
  courses: CourseInput[],
  scale: GradingScale
): { gpa: number; totalCreditUnits: number } {
  let totalGradePoints = 0;
  let totalCreditUnits = 0;
  const scaleValues = GRADE_VALUES[scale];

  for (const course of courses) {
    validateCourse(course, scale);

    const grade = course.gradeAchieved;
    if (grade === undefined || grade === null || grade === '') {
      continue; // Skip incomplete courses
    }

    const gradeValue = scaleValues[grade.trim().toUpperCase()];
    totalGradePoints += course.creditUnits * gradeValue;
    totalCreditUnits += course.creditUnits;
  }

  if (totalCreditUnits === 0) {
    return { gpa: 0.00, totalCreditUnits: 0 };
  }

  const rawGpa = totalGradePoints / totalCreditUnits;
  // Use Number.EPSILON to avoid floating point precision bugs before rounding
  const stabilizedGpa = Math.round((rawGpa + Number.EPSILON) * 100) / 100;

  return { gpa: stabilizedGpa, totalCreditUnits };
}

/**
 * Calculates overall CGPA across multiple semesters
 */
export function calculateCGPA(
  semestersCourses: CourseInput[][],
  scale: GradingScale,
  policy: CGPAPolicy = 'accumulative'
): number {
  interface TrackedCourse {
    courseCode: string;
    creditUnits: number;
    gradeValue: number;
    isActive: boolean;
  }

  const flatList: TrackedCourse[] = [];
  const scaleValues = GRADE_VALUES[scale];

  // 1. Validate all courses and build the flat list of graded courses
  for (const semester of semestersCourses) {
    for (const course of semester) {
      validateCourse(course, scale);

      const grade = course.gradeAchieved;
      if (grade === undefined || grade === null || grade === '') {
        continue; // Skip incomplete
      }

      const gradeValue = scaleValues[grade.trim().toUpperCase()];
      flatList.push({
        courseCode: course.courseCode.trim().toUpperCase(),
        creditUnits: course.creditUnits,
        gradeValue,
        isActive: true,
      });
    }
  }

  // 2. If replacement policy is active, mark older attempts of repeated courses as inactive
  if (policy === 'replacement') {
    const latestAttemptIndexMap = new Map<string, number>();

    for (let i = 0; i < flatList.length; i++) {
      const code = flatList[i].courseCode;
      if (latestAttemptIndexMap.has(code)) {
        const prevIndex = latestAttemptIndexMap.get(code)!;
        flatList[prevIndex].isActive = false;
      }
      latestAttemptIndexMap.set(code, i);
    }
  }

  // 3. Compute final weighted cumulative CGPA
  let totalGradePoints = 0;
  let totalCreditUnits = 0;

  for (const tracked of flatList) {
    if (!tracked.isActive) {
      continue;
    }
    totalGradePoints += tracked.creditUnits * tracked.gradeValue;
    totalCreditUnits += tracked.creditUnits;
  }

  if (totalCreditUnits === 0) {
    return 0.00;
  }

  const rawCgpa = totalGradePoints / totalCreditUnits;
  return Math.round((rawCgpa + Number.EPSILON) * 100) / 100;
}

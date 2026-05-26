import { describe, it, expect } from 'vitest';
import { 
  calculateSemesterGPA, 
  calculateCGPA, 
  validateCourse,
  CourseInput, 
  GradingScale 
} from '../tools/cgpa';

describe('Deterministic CGPA/GPA Calculation Engine', () => {
  describe('Semester GPA Calculations', () => {
    it('should return 0.00 GPA when total credit units are 0', () => {
      const courses: CourseInput[] = [];
      const result = calculateSemesterGPA(courses, '5.0_WITH_E');
      expect(result.gpa).toBe(0.00);
      expect(result.totalCreditUnits).toBe(0);
    });

    it('should calculate standard GPA correctly', () => {
      // 3 CU of A (5), 4 CU of B (4), 2 CU of C (3)
      // Total GP = (3*5) + (4*4) + (2*3) = 15 + 16 + 6 = 37
      // Total CU = 3 + 4 + 2 = 9
      // GPA = 37 / 9 = 4.11111... -> rounds to 4.11
      const courses: CourseInput[] = [
        { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'A' },
        { courseCode: 'PHY101', creditUnits: 4, gradeAchieved: 'B' },
        { courseCode: 'CHM101', creditUnits: 2, gradeAchieved: 'C' },
      ];

      const result = calculateSemesterGPA(courses, '5.0_WITH_E');
      expect(result.totalCreditUnits).toBe(9);
      expect(result.gpa).toBe(4.11);
    });

    it('should skip incomplete courses with null/undefined/empty grades', () => {
      const courses: CourseInput[] = [
        { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'A' }, // 3 * 5 = 15
        { courseCode: 'PHY101', creditUnits: 4, gradeAchieved: undefined },
        { courseCode: 'CHM101', creditUnits: 2, gradeAchieved: null },
        { courseCode: 'GST101', creditUnits: 1, gradeAchieved: '' },
      ];

      const result = calculateSemesterGPA(courses, '5.0_WITH_E');
      expect(result.totalCreditUnits).toBe(3);
      expect(result.gpa).toBe(5.00);
    });

    it('should throw exceptions on invalid credit units', () => {
      const coursesZeroCU: CourseInput[] = [
        { courseCode: 'MTH101', creditUnits: 0, gradeAchieved: 'A' }
      ];
      const coursesHighCU: CourseInput[] = [
        { courseCode: 'MTH101', creditUnits: 7, gradeAchieved: 'A' }
      ];
      const coursesFloatCU: CourseInput[] = [
        { courseCode: 'MTH101', creditUnits: 2.5, gradeAchieved: 'A' }
      ];

      expect(() => calculateSemesterGPA(coursesZeroCU, '5.0_WITH_E')).toThrow(
        'Invalid credit units: must be an integer between 1 and 6'
      );
      expect(() => calculateSemesterGPA(coursesHighCU, '5.0_WITH_E')).toThrow(
        'Invalid credit units: must be an integer between 1 and 6'
      );
      expect(() => calculateSemesterGPA(coursesFloatCU, '5.0_WITH_E')).toThrow(
        'Invalid credit units: must be an integer between 1 and 6'
      );
    });

    it('should throw exceptions on invalid grade letters for the scale', () => {
      const courses: CourseInput[] = [
        { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'E' }
      ];

      // E is invalid for 5.0_NO_E
      expect(() => calculateSemesterGPA(courses, '5.0_NO_E')).toThrow(
        'Invalid grade: "E" is not valid for grading scale 5.0_NO_E'
      );

      // Z is invalid for any scale
      expect(() => calculateSemesterGPA([{ courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'Z' }], '5.0_WITH_E')).toThrow(
        'Invalid grade: "Z" is not valid for grading scale 5.0_WITH_E'
      );
    });
  });

  describe('CGPA Cumulative Calculations and Rounding', () => {
    it('should perform exact decimal boundary rounding', () => {
      // Test rounding down: 4.494382... -> 4.49
      // Total CU = 89, Total GP = 400 (10 A * 6 CU * 5 GP = 300, 3 B * 6 CU * 4 GP = 72, 1 C * 6 CU * 3 GP = 18, 1 D * 5 CU * 2 GP = 10)
      const coursesDown: CourseInput[][] = [
        [
          { courseCode: 'A1', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A2', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A3', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A4', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A5', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A6', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A7', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A8', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A9', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A10', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'B1', creditUnits: 6, gradeAchieved: 'B' },
          { courseCode: 'B2', creditUnits: 6, gradeAchieved: 'B' },
          { courseCode: 'B3', creditUnits: 6, gradeAchieved: 'B' },
          { courseCode: 'C1', creditUnits: 6, gradeAchieved: 'C' },
          { courseCode: 'D1', creditUnits: 5, gradeAchieved: 'D' },
        ]
      ];

      expect(calculateCGPA(coursesDown, '5.0_WITH_E')).toBe(4.49);

      // Test rounding up: 4.495 -> 4.50
      // Let's find a fraction that gives 4.495.
      // GP = 400, CU = 89 -> 4.49438...
      // What about GP = 378, CU = 84 -> 378 / 84 = 4.50
      // What about GP = 191, CU = 42.5? No, CU is integer.
      // 179 GP, 40 CU -> 179 / 40 = 4.475 -> rounds to 4.48
      // 355 GP, 79 CU -> 355 / 79 = 4.4936...
      // 356 GP, 79 CU -> 356 / 79 = 4.506...
      // 267 GP, 59 CU -> 267 / 59 = 4.525...
      // 310 GP, 69 CU -> 310 / 69 = 4.4927...
      // 311 GP, 69 CU -> 311 / 69 = 4.5072...
      // Let's use 166 GP, 37 CU -> 166 / 37 = 4.486...
      // Let's try 89 CU and 400.1 GP? No, GP is integer.
      // Let's check 382 GP, 85 CU -> 382 / 85 = 4.4941... -> rounds to 4.49
      // Let's check 383 GP, 85 CU -> 383 / 85 = 4.5058... -> rounds to 4.51
      // What about 162 GP, 36 CU -> 162 / 36 = 4.50
      // What about 125 GP, 28 CU -> 125 / 28 = 4.464...
      // What about 126 GP, 28 CU -> 126 / 28 = 4.50
      // Let's find a division that evaluates to exactly *.495:
      // 400.05 / 89 = 4.495 (if possible, but GP is integer).
      // With integer GP:
      // Let's look at 89 * 4.495 = 400.05.
      // If GP = 400, Raw = 4.49438... (rounds to 4.49)
      // If GP = 401, Raw = 4.5056... (rounds to 4.51)
      // Let's check 200 * 4.495 = 899.
      // If GP = 899, CU = 200 -> 899 / 200 = 4.495 exactly!
      // This is perfect! Let's build a combination of CU = 200 and GP = 899.
      // 30 courses of 6 CU with A (5 GP): 30 * 6 * 5 = 900 GP, 180 CU.
      // 3 courses of 6 CU with D (2 GP): 3 * 6 * 2 = 36 GP, 18 CU.
      // 1 course of 2 CU with F (0 GP): 1 * 2 * 0 = 0 GP, 2 CU.
      // Total CU = 180 + 18 + 2 = 200 CU.
      // Total GP = 900 + 36 + 0 = 936 GP.
      // Let's adjust to get exactly 899 GP:
      // We want to reduce from 936 GP by 37 GP.
      // 1 course of 6 CU from A (5 GP, 30 GP units) to B (4 GP, 24 GP units) -> -6 GP
      // 6 courses of 6 CU from A to B -> -36 GP (Now at 900 GP total).
      // We need -37 GP.
      // Let's reduce a 1 CU course from E (1 GP) to F (0 GP) -> -1 GP.
      // Let's check exact sum:
      // 24 courses of 6 CU with A (5 GP): 24 * 6 * 5 = 720 GP (144 CU)
      // 6 courses of 6 CU with B (4 GP): 6 * 6 * 4 = 144 GP (36 CU)
      // 3 courses of 6 CU with D (2 GP): 3 * 6 * 2 = 36 GP (18 CU)
      // 1 course of 1 CU with E (1 GP): 1 * 1 * 1 = 1 GP (1 CU)
      // 1 course of 1 CU with F (0 GP): 1 * 1 * 0 = 0 GP (1 CU)
      // Total CU = 144 + 36 + 18 + 1 + 1 = 200 CU.
      // Total GP = 720 + 144 + 36 + 1 = 901 GP. (gives 901 / 200 = 4.505)
      // We want exactly 899 GP!
      // Let's change the 1 CU with E to F (-1 GP): Total GP = 900.
      // Let's change one 6 CU with B to C (3 GP): -6 GP (Now at 894 GP).
      // Let's change five 1 CU with E (1 GP):
      // Let's design exactly:
      // We have 200 CU.
      // We want 899 GP.
      // 200 CU of average 4.495.
      // Let's do:
      // 179 courses of 1 CU with A (5 GP): 179 * 5 = 895 GP, 179 CU
      // 4 courses of 1 CU with B (4 GP): 4 * 4 = 16 GP, 4 CU
      // 17 courses of 1 CU with F (0 GP): 17 * 0 = 0 GP, 17 CU
      // Total CU = 179 + 4 + 17 = 200 CU.
      // Total GP = 895 + 16 = 911 GP.
      // We want 899 GP.
      // Let's change 12 of the A (5 GP) courses to B (4 GP): reduces GP by 12.
      // 167 A (5 GP): 835 GP
      // 16 B (4 GP): 64 GP
      // 17 F (0 GP): 0 GP
      // Total CU = 167 + 16 + 17 = 200 CU.
      // Total GP = 835 + 64 = 899 GP.
      // 899 / 200 = 4.495 exactly!
      // Since credit units are validated 1-6, we can just group these 1 CU courses into 6 CU courses!
      // 167 / 6 = 27 courses of 6 CU + 1 course of 5 CU:
      // 27 courses of 6 CU with A (5 GP): 162 CU, 810 GP
      // 1 course of 5 CU with A (5 GP): 5 CU, 25 GP
      // (Total A = 167 CU, 835 GP)
      // 16 B:
      // 2 courses of 6 CU with B (4 GP): 12 CU, 48 GP
      // 1 course of 4 CU with B (4 GP): 4 CU, 16 GP
      // (Total B = 16 CU, 64 GP)
      // 17 F:
      // 2 courses of 6 CU with F (0 GP): 12 CU, 0 GP
      // 1 course of 5 CU with F (0 GP): 5 CU, 0 GP
      // (Total F = 17 CU, 0 GP)
      // Grand Total CU = (27*6) + 5 + (2*6) + 4 + (2*6) + 5 = 162 + 5 + 12 + 4 + 12 + 5 = 200 CU.
      // Grand Total GP = 810 + 25 + 48 + 16 + 0 + 0 = 899 GP.
      // 899 / 200 = 4.495. This is beautifully deterministic and completely valid! Let's put this in the test!

      const coursesUp: CourseInput[][] = [
        [
          // A courses
          { courseCode: 'A1', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A2', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A3', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A4', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A5', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A6', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A7', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A8', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A9', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A10', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A11', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A12', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A13', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A14', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A15', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A16', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A17', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A18', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A19', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A20', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A21', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A22', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A23', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A24', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A25', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A26', creditUnits: 6, gradeAchieved: 'A' },
          { courseCode: 'A27', creditUnits: 6, gradeAchieved: 'A' }, { courseCode: 'A28', creditUnits: 5, gradeAchieved: 'A' },
          // B courses
          { courseCode: 'B1', creditUnits: 6, gradeAchieved: 'B' }, { courseCode: 'B2', creditUnits: 6, gradeAchieved: 'B' },
          { courseCode: 'B3', creditUnits: 4, gradeAchieved: 'B' },
          // F courses
          { courseCode: 'F1', creditUnits: 6, gradeAchieved: 'F' }, { courseCode: 'F2', creditUnits: 6, gradeAchieved: 'F' },
          { courseCode: 'F3', creditUnits: 5, gradeAchieved: 'F' },
        ]
      ];

      expect(calculateCGPA(coursesUp, '5.0_WITH_E')).toBe(4.50);
    });
  });

  describe('Carry-Over Repeats Logic', () => {
    const semester1: CourseInput[] = [
      { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'F' }, // First attempt failed: 3 * 0 = 0 GP
      { courseCode: 'PHY101', creditUnits: 4, gradeAchieved: 'C' }, // 4 * 3 = 12 GP
    ];

    const semester2: CourseInput[] = [
      { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'A' }, // Second attempt repeated: 3 * 5 = 15 GP
      { courseCode: 'CHM101', creditUnits: 3, gradeAchieved: 'B' }, // 3 * 4 = 12 GP
    ];

    it('should calculate CGPA under Accumulative Policy (Default)', () => {
      // Both attempts are included
      // Total CU = (3 + 4) + (3 + 3) = 13 CU
      // Total GP = (0 + 12) + (15 + 12) = 39 GP
      // CGPA = 39 / 13 = 3.00
      const cgpa = calculateCGPA([semester1, semester2], '5.0_WITH_E', 'accumulative');
      expect(cgpa).toBe(3.00);
    });

    it('should calculate CGPA under Replacement Policy', () => {
      // Historical MTH101 failed attempt in semester 1 is marked inactive (excluded)
      // Active courses:
      // - PHY101: 4 CU, C (3 GP) = 12 GP
      // - MTH101 (sem 2): 3 CU, A (5 GP) = 15 GP
      // - CHM101: 3 CU, B (4 GP) = 12 GP
      // Total active CU = 4 + 3 + 3 = 10 CU
      // Total active GP = 12 + 15 + 12 = 39 GP
      // CGPA = 39 / 10 = 3.90
      const cgpa = calculateCGPA([semester1, semester2], '5.0_WITH_E', 'replacement');
      expect(cgpa).toBe(3.90);
    });

    it('should keep the previous failure active in Replacement Policy if the repeat attempt is not yet graded', () => {
      const semester2Ongoing: CourseInput[] = [
        { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: undefined }, // Repeated but no grade recorded yet
        { courseCode: 'CHM101', creditUnits: 3, gradeAchieved: 'B' },
      ];

      // MTH101 failed attempt is NOT replaced yet because the repeated attempt has no grade
      // Total CU = 3 (MTH101 failed) + 4 (PHY101) + 3 (CHM101) = 10 CU
      // Total GP = 0 + 12 + 12 = 24 GP
      // CGPA = 24 / 10 = 2.40
      const cgpa = calculateCGPA([semester1, semester2Ongoing], '5.0_WITH_E', 'replacement');
      expect(cgpa).toBe(2.40);
    });
  });

  describe('Grading Scale Variations', () => {
    const courses: CourseInput[] = [
      { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'A' }, // GP varies: 5, 5, 4, 7
      { courseCode: 'PHY101', creditUnits: 3, gradeAchieved: 'B' }, // GP varies: 4, 4, 3, 6
      { courseCode: 'CHM101', creditUnits: 3, gradeAchieved: 'E' }, // GP varies: 1, invalid, invalid, 3
    ];

    it('should calculate GPA under 5.0_WITH_E scale', () => {
      // GP = (3*5) + (3*4) + (3*1) = 15 + 12 + 3 = 30
      // CU = 9
      // GPA = 30 / 9 = 3.33
      const result = calculateSemesterGPA(courses, '5.0_WITH_E');
      expect(result.gpa).toBe(3.33);
    });

    it('should calculate GPA under 7.0_UI scale', () => {
      // GP = (3*7) + (3*6) + (3*3) = 21 + 18 + 9 = 48
      // CU = 9
      // GPA = 48 / 9 = 5.33
      const result = calculateSemesterGPA(courses, '7.0_UI');
      expect(result.gpa).toBe(5.33);
    });

    it('should calculate GPA under 5.0_NO_E scale for valid subset', () => {
      const validCourses = [
        { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'A' },
        { courseCode: 'PHY101', creditUnits: 3, gradeAchieved: 'B' },
        { courseCode: 'CHM101', creditUnits: 3, gradeAchieved: 'F' }, // F = 0
      ];
      // GP = (3*5) + (3*4) + (3*0) = 15 + 12 + 0 = 27
      // CU = 9
      // GPA = 27 / 9 = 3.00
      const result = calculateSemesterGPA(validCourses, '5.0_NO_E');
      expect(result.gpa).toBe(3.00);
    });

    it('should calculate GPA under 4.0_NUC scale for valid subset', () => {
      const validCourses = [
        { courseCode: 'MTH101', creditUnits: 3, gradeAchieved: 'A' }, // 4 GP
        { courseCode: 'PHY101', creditUnits: 3, gradeAchieved: 'B' }, // 3 GP
        { courseCode: 'CHM101', creditUnits: 3, gradeAchieved: 'D' }, // 1 GP
      ];
      // GP = (3*4) + (3*3) + (3*1) = 12 + 9 + 3 = 24
      // CU = 9
      // GPA = 24 / 9 = 2.67
      const result = calculateSemesterGPA(validCourses, '4.0_NUC');
      expect(result.gpa).toBe(2.67);
    });
  });
});

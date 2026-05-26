# SOP-001: Deterministic CGPA Calculation Engine

## 1. Objective
Define the absolute mathematical and systemic rules governing CGPA and GPA calculations for Smart Student Hub v4. Critical academic logic must remain 100% deterministic and free of LLM heuristic estimations or floating-point rounding bugs.

## 2. Scope
This protocol applies to all calculations performed in `/tools/cgpa.ts` and rendered within the frontend dashboards.

## 3. Nigerian University Grading Systems & Formulations
The engine MUST support the following university configurations:

### A. Grading Scale Multipliers

| Scale Identifier | Grade Letter | GP Value | Percentage Range |
| :--- | :--- | :--- | :--- |
| **5.0_WITH_E** (Traditional Standard) | A <br> B <br> C <br> D <br> E <br> F | 5 <br> 4 <br> 3 <br> 2 <br> 1 <br> 0 | 70 - 100% <br> 60 - 69% <br> 50 - 59% <br> 45 - 49% <br> 40 - 44% <br> 0 - 39% |
| **5.0_NO_E** (Modern Standard) | A <br> B <br> C <br> D <br> F | 5 <br> 4 <br> 3 <br> 2 <br> 0 | 70 - 100% <br> 60 - 69% <br> 50 - 59% <br> 45 - 49% <br> 0 - 44% |
| **4.0_NUC** (National Univ. Comm.) | A <br> B <br> C <br> D <br> F | 4 <br> 3 <br> 2 <br> 1 <br> 0 | 70 - 100% <br> 60 - 69% <br> 50 - 59% <br> 45 - 49% <br> 0 - 44% |
| **7.0_UI** (Legacy Univ. of Ibadan) | A <br> B <br> C <br> D <br> E <br> F | 7 <br> 6 <br> 5 <br> 4 <br> 3 <br> 0 | 70 - 100% <br> 60 - 69% <br> 55 - 59% <br> 50 - 54% <br> 45 - 49% <br> 0 - 44% |

### B. Mathematical Formulas

#### Semester Grade Point Average (GPA)
$$\text{Semester GPA} = \frac{\sum_{i=1}^{n} (\text{Credit Units}_i \times \text{Grade Value}_i)}{\sum_{i=1}^{n} \text{Credit Units}_i}$$

*Note: Incomplete courses (where grades are not yet input) are excluded from the calculation denominator.*

#### Cumulative Grade Point Average (CGPA)
$$\text{CGPA} = \frac{\sum_{j=1}^{m} \text{Total Semester GP}_j}{\sum_{j=1}^{m} \text{Total Semester CU}_j}$$

---

## 4. Crucial Nigerian Edge Cases (Academic Policies)

### A. Carry-Over Course Repeats (Standard Policy)
In almost all Nigerian federal and state universities, **if a student fails a course (F) and carries it over to repeat in a subsequent year, BOTH the failed attempt (0 GP) and the repeated attempt (e.g. A = 5 GP) count in the cumulative CGPA.**
*   *System Rule:* Repeating a course does **not** overwrite or erase the historical failed semester record. It appends the new course occurrence in the current semester. Both credit unit weights must remain in the grand total denominator.
*   *Implementation:* Do NOT deduplicate course codes across semesters when computing cumulative CGPA.

### B. Carry-Over Course Repeats (Replacement Policy)
Some private or specific departments allow a "grade replacement" model, where only the highest score or the latest score replaces the previous failure.
*   *System Rule:* The engine must check `profiles.grading_policy` (either `'accumulative'` or `'replacement'`). If `'replacement'`, the previous course entry with the same code must set its calculation multiplier to inactive (excluded from calculation) when a newer grade is recorded.

---

## 5. Technical Safety Measures

### A. Floating Point Precision Protection
Floating point representation in JavaScript (double-precision 64-bit binary format IEEE 754) leads to rounding errors during simple decimal divisions:
```javascript
0.1 + 0.2 // Outputs 0.30000000000000004
```
For CGPA calculations where a `4.49` (Second Class Upper) vs a `4.50` (First Class) is a life-altering difference, **approximate floating points are strictly forbidden.**

#### Safe Precision Protocol:
1.  Compute all Grade Points as exact integers: $\text{Credit Units} \times \text{Grade Value}$.
2.  Maintain separate accumulators for `TotalGP` (Integer) and `TotalCU` (Integer).
3.  Calculate the final division with a precision stabilizer:
```typescript
const rawGpa = totalGradePoints / totalCreditUnits;
const stabilizedGpa = Math.round((rawGpa + Number.EPSILON) * 100) / 100;
```

### B. Inputs Validation Schema
Before calculations occur, course objects must satisfy the following strict validation checks:
*   `creditUnits` must be an integer between `1` and `6` inclusive.
*   `gradeAchieved` must be in the valid key set for the selected scale.
*   Empty input slots (`null` or `undefined`) are skipped entirely without throwing errors.

---

## 6. Implementation Test Assertions (VITEST Rules)
1.  **Test for 0 CU:** If total credit units are 0, return `0.00`.
2.  **Test Standard GPA:** 3 CU of A (5), 4 CU of B (4), 2 CU of C (3).
    *   $\text{Total GP} = (3 \times 5) + (4 \times 4) + (2 \times 3) = 15 + 16 + 6 = 37$.
    *   $\text{Total CU} = 3 + 4 + 2 = 9$.
    *   $\text{GPA} = 37 / 9 = 4.11111... \rightarrow 4.11$.
3.  **Test Boundary Rounding:** Ensure that `4.494` rounds down to `4.49` and `4.495` rounds up to `4.50`.

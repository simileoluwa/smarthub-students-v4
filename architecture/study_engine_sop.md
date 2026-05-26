# SOP-002: Proportional Spaced Repetition (PSR) Scheduler

## 1. Objective
Define the algorithmic intervals and scheduling constraints for study items (flashcards, lecture materials) in Smart Student Hub v4. The system must adapt standard spaced repetition logic to the specific academic calendars and course credit weights typical of Nigerian universities.

## 2. Scope
This protocol governs scheduling functions located in `/tools/spaced_rep.ts` and their interaction with Dexie local collections.

## 3. The Core Algorithmic Adjustments

Traditional Spaced Repetition (SM-2) calculates intervals based purely on memory recall ratings. This is insufficient for Nigerian students facing compressed semesters, battery deficits, and variable course credit units (CUs). 

Smart Student Hub introduces three proportional multipliers to scale the base SM-2 interval:

$$\text{Final Interval (Days)} = \text{SM2\_Interval} \times F_{\text{credit}} \times F_{\text{proximity}} \times F_{\text{strike}}$$

---

## 4. Multiplier Specifications

### A. Credit Unit Proportionality ($F_{\text{credit}}$)
Courses with higher credit units (e.g. 4 CU, 6 CU) have a disproportionately large impact on a student's CGPA. To guarantee that students allocate study time to high-value courses, the PSR engine accelerates the repeat cycle of items linked to these courses.

$$F_{\text{credit}} = 1.20 - (0.05 \times \text{Credit Units})$$

#### Multiplier Values:
*   **1 Credit Unit:** $F_{\text{credit}} = 1.15$ (review intervals are widened, less frequent reviews)
*   **2 Credit Units:** $F_{\text{credit}} = 1.10$
*   **3 Credit Units:** $F_{\text{credit}} = 1.05$
*   **4 Credit Units:** $F_{\text{credit}} = 1.00$ (baseline)
*   **6 Credit Units:** $F_{\text{credit}} = 0.90$ (review intervals are shortened, 10% more frequent reviews)

---

### B. Exam Proximity Compression ($F_{\text{proximity}}$)
Standard spacing intervals can stretch to 30 or 60 days. In a compressed academic calendar, a 60-day interval means the student won't review a card again before the exam.
As the exam approaches, the system compresses scheduling intervals to force hyper-dense consolidation loops.

$$F_{\text{proximity}} = \text{Clamp}\left( \frac{\text{Days Until Exam}}{\text{Total Semester Days}}, 0.20, 1.00 \right)$$

*   *Example:* If a student is 14 days away from exams in a 70-day compressed semester:
    $$F_{\text{proximity}} = 14 / 70 = 0.20$$
    All calculated intervals are compressed by 80%, shrinking a calculated 10-day review interval to just 2 days.
*   *Clamp Limit:* The modifier never shrinks below `0.20` to prevent "review lock" (where cards are rescheduled multiple times a day, causing cognitive fatigue).

---

### C. Active Strike Preservation ($F_{\text{strike}}$)
During an ASUU strike, semesters are frozen. The system transitions into **Academic Conservation Mode**. The priority shifts from active exam prep to *passive retention maintenance* under low-pressure circumstances.

$$F_{\text{strike}} = \text{Active ? } 1.50 \text{ : } 1.00$$

*   *Effect:* Review intervals are widened by 50% to ease cognitive load.
*   *Safety Floor:* To prevent students from forgetting materials entirely, the maximum review interval during a strike is strictly clamped to **21 days**.

---

## 5. Leitner / SM-2 Base Calculations

For atomic card objects, the system implements a modified SM-2 algorithm:

```typescript
export interface CardState {
  easinessFactor: number; // Default: 2.5
  repetitions: number;    // Default: 0
  intervalDays: number;   // Default: 0
}

export type ReviewRating = 1 | 2 | 3 | 4; // 1 = Forgot, 2 = Hard, 3 = Good, 4 = Easy

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

  // Adjust EF based on rating
  easinessFactor = easinessFactor + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02));
  if (easinessFactor < 1.3) easinessFactor = 1.3; // Floor

  return { easinessFactor, repetitions, intervalDays };
}
```

---

## 6. Storage & Execution Rules

1.  **Low Network Footprint:** Cards store scheduling metrics (`easinessFactor`, `repetitions`, `intervalDays`, `next_review_due`) in local IndexedDB. 
2.  **Date Alignment:** `next_review_due` is computed as:
    $$\text{next\_review\_due} = \text{Current Date} + \text{Final Interval (Days)}$$
    To avoid minor timezone skewing, reviews are aligned to `00:00:00` local user time.
3.  **Battery Conservation:** Batch-process cards during scheduling. Do not perform write operations card-by-card; use Dexie bulk updates.

# SOP-003: ASUU Strike & Elastic Semester Recalibration

## 1. Objective
Define the technical procedures and user experience shifts required when academic semesters are disrupted by ASUU strikes. The system must adapt its scheduling, notifications, and analytics to protect the student's emotional safety and academic progress.

## 2. Scope
This protocol governs calendar engines in `/tools/strike.ts` and the UI adaptations handled in the frontend application layers.

---

## 3. Structural State Transitions

The academic calendar is treated as an **Elastic Timeline**. Semesters are defined by status variables and duration trackers rather than static date boundaries.

```
[Normal Semester] ──(Strike Starts)──► [Strike Paused Mode]
       │                                     │
       │                               (Strike Ends)
       │                                     │
       ▼                                     ▼
[Normal Completion]                  [Compressed Catch-Up Mode]
```

### Transition Schemas:
*   `profiles.strike_mode_active`: BOOLEAN. Global toggle.
*   `semesters.status`: VARCHAR (`'active'`, `'completed'`, `'strike_paused'`).
*   `semesters.compressed_mode`: BOOLEAN. Set when a semester resumes with truncated timelines.

---

## 4. Strike Mode Activation Protocol

When the user activates "Strike Mode" (or a central administrative push is distributed to the PWA client):

### A. State Freezing
1.  Capture the transition date: `strike_start_date = CURRENT_TIMESTAMP`.
2.  Set `profiles.strike_mode_active = TRUE`.
3.  Set all active semesters' `status = 'strike_paused'`.
4.  Freeze all countdown timers to exams and assignments.

### B. Spaced Repetition Adaptations
1.  PSR shifts to **Academic Conservation Mode** ($F_{\text{strike}} = 1.50$).
2.  Deactivate standard "days of inactivity" warnings and notifications to prevent user guilt (Constitution Rule: *The system must never guilt students*).

### C. Visual Theme Shift (Emotional Safety Design)
1.  The UI shifts color tones: from high-energy workspace colors to deep, calming earth greens, blues, or soft neutral tones.
2.  The Dashboard header changes from "12 Days to Exams" to **"Academic Preservation Mode Active. Focus on Self-Paced Mastery."**
3.  Display self-paced, casual study suggestions rather than strict daily goals.

---

## 5. Resurrection and Recalibration Protocol

When a strike is called off, the university resumes. Semesters are almost always compressed to catch up with calendar deficits (e.g. compressing a 15-week term into 8 weeks).

### Recalibration Calculation Flow:
1.  Calculate total strike duration:
    $$\Delta_{\text{strike}} = \text{Current Date} - \text{strike\_start\_date}$$
2.  Prompt the user to enter their new **Exam Start Date** or **Semester End Date**.
3.  Compute the **Compression Ratio ($R_{\text{compression}}$)** for the remaining coursework:
    $$R_{\text{compression}} = \frac{\text{Remaining Calendar Days}}{\text{Original Planned Remaining Days}}$$
4.  Adjust spaced repetition review dates by multiplying intervals by $R_{\text{compression}}$.
5.  If $R_{\text{compression}} < 0.70$ (indicating extreme compression), activate **"High Priority Visual Indicator"** on course cards where Credit Units are $\ge 3$. This alerts the student to prioritize heavy-weight courses.

---

## 6. Mathematical Example of Recalibration

A student has a standard semester:
*   Original Semester Duration: 105 Days (15 weeks)
*   Completed Before Strike: 35 Days (5 weeks)
*   Remaining Before Strike: 70 Days (10 weeks)

An ASUU strike begins and lasts for **90 Days**.
*   The semester resumes, but the Senate compresses the remaining 10 weeks of lectures/exams into **42 Days (6 weeks)**.

### Calculations:
1.  **Original Planned Remaining Days** = 70 Days
2.  **Actual Remaining Days** = 42 Days
3.  **Compression Ratio ($R_{\text{compression}}$):**
    $$R_{\text{compression}} = \frac{42}{70} = 0.60 \quad (60\% \text{ time compression})$$
4.  **PSR Scheduling Adjustment:** A review item that would normally be scheduled in 10 days is scheduled in:
    $$10 \times 0.60 = 6 \text{ Days}$$

This compresses study intervals proportionally, keeping the student's revision pacing synchronized with the accelerated university schedule.

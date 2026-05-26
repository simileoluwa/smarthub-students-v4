# SOP-006: Student Onboarding Flow & Core Verification

## 1. Objective
Define the step-by-step onboarding sequences, initial configurations, and client validation checks for a student setting up Smart Student Hub v4 for the first time. The sequence must minimize onboarding friction, configure academic baselines, and function entirely offline.

## 2. Scope
This protocol governs pages in `/frontend/pages/onboarding.tsx`, the initialization state within Zustand, and initial database seeding functions inside `/tools/seed.ts`.

---

## 3. Onboarding Steps

```
[Step 1: Identity & University] ──► [Step 2: Grading Scale] ──► [Step 3: Level & Active Courses] ──► [Step 4: Academic Target] ──► [Dashboard]
```

### Step 1: Profile Details & University Matching
1.  **Student Identity:** Input full name, email address (optional for offline guest profiles), and matriculation/registration number.
2.  **University Selector:** A searchable, offline-cached list of major Nigerian Universities (e.g., Unilag, UI, OAU, UNIBEN, UNN, ABU, LASU, covenant, etc.).
    *   *Real-time matching:* As the user types, standard abbreviations are resolved (e.g., "OAU" resolves to "Obafemi Awolowo University").

### Step 2: Grading Scale Selection (Crucial Step)
The user selects their university's current grading scale. Based on the selected university, the system automatically suggests the most likely default scale:
*   *UNILAG/OAU/UNIBEN/UNN:* Default to `5.0_WITH_E`
*   *UI (Modern cohorts):* Default to `5.0_NO_E`
*   *Legacy Cohorts / older UI cohorts:* Suggest `7.0_UI`
*   *Modern NUC updates:* Suggest `4.0_NUC`

### Step 3: Current Level & Academic Course Import
1.  **Level Selection:** 100, 200, 300, 400, 500, or 600 Level.
2.  **Rapid Course Seeding Templates:** To prevent the student from typing a long list of courses by hand (which increases bounce rates), the system displays common standard departmental schedules:
    *   *Computer Science / Engineering / Science:* Seeds MTH101, PHY101, CHM101, CSC101, GNS101, etc.
    *   *Faculty Options:* Selecting a faculty (e.g. Science, Engineering, Law, Arts) loads a standard package of credit units and course codes.
    *   *Manual Adjustments:* The student can easily add, edit, or delete courses from the template list.

### Step 4: Academic Target Configuration
1.  **Target CGPA Setter:** The student sets an overall cumulative GPA target (e.g. `4.50` for First Class, or `3.50` for Second Class Upper).
2.  **Deterministic Grade Allocation Guidance:** The system calculates the exact letters grades required in the imported courses to mathematically meet the overall semester target GPA.
    *   *Validation Check:* If the student sets a target that is mathematically impossible (e.g., aiming for a `4.80` with only 12 credits and having already earned a `2.0` in previous terms), the system does not show an error, but instead gently adjusts the display metrics to show the **maximum possible score** they can mathematically achieve, advising them on realistic recovery pathways.

---

## 4. Local DB & Offline Initialization Verification

Onboarding is complete only when the local storage sandbox is validated:

```typescript
export async function verifyOnboardingState(): Promise<boolean> {
  try {
    // 1. Verify Dexie is initialized and accessible
    const dbExists = await Dexie.exists('SmartHubDatabase');
    if (!dbExists) return false;

    // 2. Check that profile document exists locally
    const profile = await db.profiles.toCollection().first();
    if (!profile) return false;

    // 3. Confirm target semester holds at least one active course
    const activeSemesters = await db.semesters.where('status').equals('active').toArray();
    if (activeSemesters.length === 0) return false;

    return true;
  } catch (error) {
    console.error('Onboarding validation failure:', error);
    return false;
  }
}
```

---

## 5. UI Guardrails & First-Impression Aesthetics
*   **Calm Onboarding:** Use soft transitions (via Framer Motion fade-ins) to move from screen to screen. Avoid noisy alert modals.
*   **Progressive Loading:** If the student loses connection mid-onboarding, the app preserves all currently inputted values in a temporary draft state (`.tmp` or localStorage) so they do not have to restart the sequence from the beginning when the page is reloaded.

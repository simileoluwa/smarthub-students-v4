# SOP-007: Edge Cases & Recovery Protocols

## 1. Objective
Define standard operations to troubleshoot, mitigate, and recover from failures in synchronization, storage, or runtime environments. The system must degrade gracefully during system disruptions to protect student data from corruption.

## 2. Scope
This protocol governs the error boundary catch handlers in the React frontend, database migrations in Dexie, and queue retries in the sync worker.

---

## 3. Storage Migrations & Schema Changes (No-Loss Rule)

When updating the Smart Student Hub application, database schemas may evolve (e.g. adding columns or updating table relationships). 

**Rule: A software update must NEVER erase or reset the student's offline database.**

### Dexie Schema Migration Strategy:
1.  **Versioned Migrations:** Use Dexie's incremental versioning strategy (`db.version(x).stores()`).
2.  **No Data Erasure:** If a column changes, write an explicit upgrade translation function rather than dropping tables.
3.  **Upgrade Schema Example:**
```typescript
db.version(2).stores({
  profiles: 'id, email, grading_scale',
  semesters: 'id, profile_id, level, term, status',
  courses: 'id, semester_id, course_code, grade_achieved',
  spaced_repetition_cards: 'id, course_id, next_review_due'
}).upgrade(tx => {
  // Translate older profiles data without dropping client records
  return tx.table('profiles').toCollection().modify(profile => {
    if (!profile.grading_scale) {
      profile.grading_scale = '5.0_WITH_E'; // Standard fallback
    }
  });
});
```

---

## 4. Replication Failures & Error Recoveries

Sync transactions may fail due to cellular gateway failures, server timeouts, or authentication expirations.

### A. Automatic Retries
1.  If a transaction fails due to network isolation, the sync worker leaves the record in the `reconciliation_queue` and increments `retry_count` by 1.
2.  The next sync check is delayed using **exponential backoff**:
    $$\text{Backoff Delay (seconds)} = \text{Clamp}(2^{\text{retry\_count}} \times 5, 5, 300)$$
3.  After **5 consecutive failures**, the worker changes the event status to `'failed'` and writes the response payload into the event's `error_message` column.

### B. Sync Lockout and Local Backup Export
If the sync engine fails consistently (e.g., due to user credential issues or custom data corruption), the student is not blocked. To guarantee absolute safety, we provide local recovery tools:
1.  **Direct DB Export:** A "Backup Database" button in Profile Settings. This generates a minified JSON dump containing all local Dexie tables (`profiles`, `semesters`, `courses`, `cards`) and triggers a browser download: `smarthub_backup_date.json`.
2.  **Emergency Local Flush:** A "Hard Re-sync" button. This exports local data as a backup JSON file, purges local IndexedDB tables, pulls the latest clean database state from Supabase, and re-hydrates the local state.

---

## 5. Mobile Hardware & Energy Starvation Mitigations

Low-end Android phones face performance throttling when battery capacity falls below critical limits.

### A. Active Performance Degradation Strategy:
When the battery status changes (`navigator.getBattery` alerts) or memory warnings are received:
*   **Battery < 15% (Critical):**
    *   Disable Framer Motion page transition animations (UI switches to instant cuts).
    *   Limit background sync interval loops to once every 15 minutes.
    *   Throttles list renders (use simple lists instead of paginated, animated lists).
*   **RAM/Resource Throttling:**
    *   Purge non-essential caches from memory (Zustand store keeps only the currently open semester's data in active memory).

---

## 6. Critical Transaction Recovery Protocol

If the student's browser tab is closed in the middle of a grade update write:
1.  Dexie's native transaction mechanism ensures that either *both* the course grade field is updated and the outbox log is written, or *neither* occurs.
2.  If the local write succeeds but the sync worker is killed before replication:
    *   On the next app boot, Zustand checks the WAL `reconciliation_queue`. Any pending entries trigger the worker immediately.

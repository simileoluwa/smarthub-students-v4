# SOP-004: Offline-First Synchronization & Replication

## 1. Objective
Define the synchronization schemas, replication protocols, and conflict resolution guidelines for Smart Student Hub v4. The platform must remain fully functional offline while guaranteeing eventually consistent synchronization with Supabase PostgreSQL without causing blocking freezes for the user.

## 2. Scope
This protocol governs the Dexie DB setups in `frontend/lib/db.ts`, the background replication worker inside `workers/sync.worker.ts`, and client state mutations in Zustand.

---

## 3. Synchronization Philosophy

1.  **Offline First:** The local browser database (IndexedDB) is the absolute authority for reads and writes.
2.  **Cloud Eventually Consistent:** The cloud database (Supabase PostgreSQL) is a secure remote backup and multi-device hub.
3.  **User Never Blocked:** UI updates occur instantaneously (<10ms). Remote synchronization occurs asynchronously in the background.

---

## 4. The Local Outbox Queue (Write-Ahead Log)

Every mutation (create, edit, delete) executed in the client follows a transaction pattern:

```
[UI Trigger: Course Edit]
           │
           ├───► 1. Modify local Dexie Table (e.g. `courses`)
           │        - Update target course details
           │        - Set `sync_status = 'pending_update'`
           │
           └───► 2. Append ReconciliationEvent to `reconciliation_queue`
                    - Store event: Action, Table, Record ID, Payload, Timestamp
```

### `ReconciliationEvent` Interface:
```typescript
export interface ReconciliationEvent {
  id: string; // UUIDv4
  table_name: string; // Target table e.g. 'courses'
  record_id: string; // Record's primary key
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any; // Serialized columns (null for DELETE)
  timestamp: number; // local Date.now()
  retry_count: number; // Defaults to 0
  error_message?: string;
}
```

---

## 5. Synchronization Worker Execution Loop

The background sync worker runs inside a dedicated Web Worker to prevent main thread blocking (Constitution Rule: *Optimized for low-end, low-RAM hardware*).

### A. Execution Triggers:
1.  **Online Event Listener:** `window.addEventListener('online', triggerSync)`
2.  **Service Worker Periodic Sync:** Triggers when browser regains network connectivity in the background.
3.  **Immediate Flush:** Zustand store triggers a sync check immediately after logging a mutation if `navigator.onLine` is true.

### B. Replication Steps:
1.  Query `reconciliation_queue` for records with `retry_count < 5` ordered by `timestamp` ascending.
2.  Group events by table to perform **batch updates** (minimizing Supabase API request headers and saving user bandwidth).
3.  Execute transactions on Supabase:
    *   **INSERT / UPDATE:** Perform a Supabase Upsert (`.upsert()`) matching the record UUID.
    *   **DELETE:** Perform a Supabase Delete (`.delete()`) matching the record UUID.
4.  On successful database commit:
    *   Set the local record's `sync_status = 'synced'`.
    *   Delete the processed event from the `reconciliation_queue`.
5.  On network failure: Pause execution. Keep items in the queue and reschedule sync.

---

## 6. Conflict Resolution Protocol

Because students might use multiple devices (e.g., their mobile device and a desktop in a cybercafe), concurrent modifications can happen. 

Smart Student Hub implements a **Hybrid Last-Write-Wins (LWW) with client-versioning** strategy.

### Column Rules:
*   Every table contains: `local_updated_at` (TIMESTAMP) and `client_version` (INTEGER, increments by 1 on every local mutation).

### Resolution Logic:
When the worker pushes a modification, the server compares the incoming client payload with the server's record state:

1.  **If Incoming `client_version` > Server `client_version`:**
    *   Accept changes. Update server record and set server's `client_version` to match.
2.  **If Incoming `client_version` <= Server `client_version`:**
    *   A collision occurred (a newer or concurrent write already exists on the server).
    *   Compare timestamps:
        *   If incoming `local_updated_at` > server `updated_at`: The client's modification is actually newer. Apply client edits.
        *   If incoming `local_updated_at` <= server `updated_at`: The server has a newer modification. Overwrite the client's local record with the server's data, set `sync_status = 'synced'`, and purge the event from the local outbox.
3.  **Terminal Grade Lock Rule:**
    *   If a course's `grade_achieved` is finalized on the server (confirmed academic record), the client CANNOT overwrite it with predicted grades. The server record remains locked. Client updates are rejected, and local state is updated to match the server.

---

## 7. Bandwidth Mitigation & Network Rules
*   **Packet Cap:** Limit bulk synchronization payloads to `100KB` per network call.
*   **Compression:** Encode long flashcard strings using basic JSON compression stringifiers before remote transmissions.
*   **Cache Headers:** Set aggressive caching for static data libraries (e.g. university lists, course templates) to avoid data consumption charges.

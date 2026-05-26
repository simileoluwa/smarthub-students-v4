import { db, ReconciliationEvent } from './db';
import { supabase } from './supabaseClient';

export interface SyncStats {
  processed: number;
  success: number;
  failed: number;
}

/**
 * Sync Queue Engine for Smart Student Hub v4.
 * Processes local WAL ReconciliationEvents and synchronizes them eventually with Supabase.
 */
export async function flushOutboxQueue(): Promise<SyncStats> {
  const stats: SyncStats = { processed: 0, success: 0, failed: 0 };
  
  try {
    // 1. Get all events in the reconciliation queue ordered by timestamp ascending
    const events = await db.reconciliationQueue.orderBy('timestamp').toArray();
    if (events.length === 0) return stats;

    // Process events sequentially to preserve logical order
    for (const event of events) {
      stats.processed += 1;
      const isSuccess = await processReconciliationEvent(event);
      if (isSuccess) {
        stats.success += 1;
      } else {
        stats.failed += 1;
      }
    }
  } catch (error) {
    console.error('WAL flush failed:', error);
  }

  return stats;
}

/**
 * Processes a single outbox event with conflict resolution and versioning checks
 */
async function processReconciliationEvent(event: ReconciliationEvent): Promise<boolean> {
  const { id, tableName, recordId, action, payload } = event;
  const dexieTable = tableName === 'spaced_repetition_cards'
    ? db.spacedRepetitionCards
    : (db as unknown as Record<string, typeof db.profiles>)[tableName];

  const clientPayload = payload as Record<string, unknown>;

  try {
    // If deleted, sync deletes
    if (action === 'DELETE') {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', recordId);

      if (error) throw error;

      // Clean WAL on success
      await db.reconciliationQueue.delete(id);
      return true;
    }

    // For inserts or updates, verify concurrent remote versions first
    const { data: serverRecord, error: fetchError } = await supabase
      .from(tableName)
      .select('client_version, local_updated_at')
      .eq('id', recordId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    // Conflict Resolution Logic (Hybrid LWW + Client version validator)
    if (serverRecord) {
      const serverVersion = serverRecord.client_version || 0;
      const clientVersion = (clientPayload?.clientVersion as number) || 1;

      if (clientVersion <= serverVersion) {
        // Concurrency clash! Check timestamps
        const serverUpdatedAt = new Date(serverRecord.local_updated_at).getTime();
        const clientUpdatedAt = new Date(clientPayload?.localUpdatedAt as string).getTime();

        if (clientUpdatedAt <= serverUpdatedAt) {
          // Server wins: overwrite local IndexedDB record, set synced status, clean WAL event
          await db.transaction('rw', [dexieTable, db.reconciliationQueue], async () => {
            // Fetch complete server record
            const { data: fullServerRecord } = await supabase
              .from(tableName)
              .select('*')
              .eq('id', recordId)
              .single();

            if (fullServerRecord) {
              await (dexieTable as any).put({
                ...fullServerRecord,
                syncStatus: 'synced',
              }); 
            }
            await db.reconciliationQueue.delete(id);
          });
          return true;
        }
      }
    }

    // Client wins or no conflict: push payload to Supabase
    const { error: upsertError } = await supabase
      .from(tableName)
      .upsert({
        ...clientPayload,
        sync_status: 'synced', // Align schema syntax with server columns
      });

    if (upsertError) throw upsertError;

    // Update local table sync status and clean WAL event on successful remote commit
    await db.transaction('rw', [dexieTable, db.reconciliationQueue], async () => {
      const localRecord = await dexieTable.get(recordId);
      if (localRecord) {
        await (dexieTable as any).put({
          ...localRecord,
          syncStatus: 'synced',
        });
      }
      await db.reconciliationQueue.delete(id);
    });

    return true;
  } catch (error) {
    const err = error as Error;
    console.error(`Reconciliation event ${id} process failure:`, err);
    
    // Increment retry count and write error description to WAL logs
    await db.reconciliationQueue.update(id, {
      retryCount: event.retryCount + 1,
      errorMessage: err.message || 'Unknown synchronization error',
    });

    return false;
  }
}

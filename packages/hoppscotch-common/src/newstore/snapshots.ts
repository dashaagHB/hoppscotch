import { pluck } from "rxjs/operators"
import DispatchingStore, { defineDispatchers } from "./DispatchingStore"
import {
  DiffSnapshot,
  SnapshotStoreState,
  makeSnapshotFromResponse,
} from "~/helpers/types/DiffSnapshot"
import { executedResponses$ } from "~/helpers/RequestRunner"
import { getSetting } from "./settings"
import { useToast } from "~/composables/toast"

const SNAPSHOT_LIMIT = 50

const defaultSnapshotStoreState: SnapshotStoreState = {
  snapshots: [],
  pendingSync: [],
}

type AddSnapshotPayload = {
  snapshot: DiffSnapshot
}

type RemoveSnapshotPayload = {
  id: string
}

type MarkSyncedPayload = {
  id: string
}

type SetSnapshotsPayload = {
  snapshots: DiffSnapshot[]
}

const dispatchers = defineDispatchers({
  /**
   * Add a snapshot with FIFO eviction if limit reached.
   * Auto-captured snapshots are evicted first.
   */
  addSnapshot(
    state: SnapshotStoreState,
    { snapshot }: AddSnapshotPayload
  ): Partial<SnapshotStoreState> {
    let snapshots = [...state.snapshots]

    // Check if we've hit the limit
    if (snapshots.length >= SNAPSHOT_LIMIT) {
      // Try to evict oldest auto-captured snapshot first
      const oldestAutoIndex = snapshots.findIndex((s) => !s.isManual)

      if (oldestAutoIndex !== -1) {
        // Remove oldest auto-captured
        snapshots.splice(oldestAutoIndex, 1)
      } else if (!snapshot.isManual) {
        // All snapshots are manual and new one is auto-captured—refuse
        console.warn("Snapshot limit reached with all manual snapshots. Auto-capture skipped.")
        return {} // No state change
      } else {
        // All manual, new one is manual—evict oldest (FIFO)
        snapshots.shift()
      }
    }

    // Add new snapshot at the beginning (most recent first)
    snapshots.unshift(snapshot)

    return {
      snapshots,
      pendingSync: [...state.pendingSync, snapshot.id],
    }
  },

  /**
   * Remove a specific snapshot by ID
   */
  removeSnapshot(
    state: SnapshotStoreState,
    { id }: RemoveSnapshotPayload
  ): Partial<SnapshotStoreState> {
    return {
      snapshots: state.snapshots.filter((s) => s.id !== id),
      pendingSync: state.pendingSync.filter((sid) => sid !== id),
    }
  },

  /**
   * Clear all snapshots, optionally filtered by requestKey
   */
  clearSnapshots(
    state: SnapshotStoreState,
    { requestKey }: { requestKey?: string }
  ): Partial<SnapshotStoreState> {
    if (requestKey) {
      const filtered = state.snapshots.filter((s) => s.requestKey !== requestKey)
      return {
        snapshots: filtered,
        pendingSync: state.pendingSync.filter((id) =>
          filtered.some((s) => s.id === id)
        ),
      }
    }

    return {
      snapshots: [],
      pendingSync: [],
    }
  },

  /**
   * Mark a snapshot as synced to backend
   */
  markSynced(
    state: SnapshotStoreState,
    { id }: MarkSyncedPayload
  ): Partial<SnapshotStoreState> {
    return {
      snapshots: state.snapshots.map((s) =>
        s.id === id ? { ...s, syncedToBackend: true } : s
      ),
      pendingSync: state.pendingSync.filter((sid) => sid !== id),
    }
  },

  /**
   * Replace all snapshots (used when loading from persistence or backend sync)
   */
  setSnapshots(
    state: SnapshotStoreState,
    { snapshots }: SetSnapshotsPayload
  ): Partial<SnapshotStoreState> {
    return {
      snapshots: snapshots.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      ),
      pendingSync: snapshots
        .filter((s) => !s.syncedToBackend)
        .map((s) => s.id),
    }
  },
})

export const snapshotStore = new DispatchingStore(
  defaultSnapshotStoreState,
  dispatchers
)

// Observables for reactive subscriptions
export const snapshots$ = snapshotStore.subject$.pipe(pluck("snapshots"))
export const pendingSync$ = snapshotStore.subject$.pipe(pluck("pendingSync"))

// Dispatcher actions
export function addSnapshot(snapshot: DiffSnapshot) {
  snapshotStore.dispatch({
    dispatcher: "addSnapshot",
    payload: { snapshot },
  })
}

export function removeSnapshot(id: string) {
  snapshotStore.dispatch({
    dispatcher: "removeSnapshot",
    payload: { id },
  })
}

export function clearSnapshots(requestKey?: string) {
  snapshotStore.dispatch({
    dispatcher: "clearSnapshots",
    payload: { requestKey },
  })
}

export function markSnapshotSynced(id: string) {
  snapshotStore.dispatch({
    dispatcher: "markSynced",
    payload: { id },
  })
}

export function setSnapshots(snapshots: DiffSnapshot[]) {
  snapshotStore.dispatch({
    dispatcher: "setSnapshots",
    payload: { snapshots },
  })
}

/**
 * Get the most recent snapshot for a given requestKey (the "previous" execution)
 */
export function getPreviousSnapshot(requestKey: string): DiffSnapshot | null {
  const { snapshots } = snapshotStore.value
  return (
    snapshots.find((s) => s.requestKey === requestKey) ?? null
  )
}

/**
 * Get all snapshots for a specific requestKey
 */
export function getSnapshotsForRequest(requestKey: string): DiffSnapshot[] {
  const { snapshots } = snapshotStore.value
  return snapshots.filter((s) => s.requestKey === requestKey)
}

/**
 * Check if auto-capture should be skipped (all manual snapshots at limit)
 */
export function shouldSkipAutoCapture(): boolean {
  const { snapshots } = snapshotStore.value
  if (snapshots.length < SNAPSHOT_LIMIT) return false

  // Check if all snapshots are manual
  return snapshots.every((s) => s.isManual)
}

// Auto-capture subscription - listens to executed responses
executedResponses$.subscribe(async (res) => {
  // Only capture success or failure responses (not loading, network_fail, etc.)
  if (res.type !== "success" && res.type !== "fail") return

  // Check if auto-capture is enabled (count > 0)
  const autoCaptureCount = getSetting("DIFF_AUTO_CAPTURE_COUNT")
  if (!autoCaptureCount || autoCaptureCount === 0) return

  // Check if auto-capture should be skipped (quota full with manual snapshots)
  if (shouldSkipAutoCapture()) {
    console.warn("Auto-capture skipped: snapshot limit reached with all manual snapshots")
    return
  }

  // Size check BEFORE processing body (check meta.responseSize, not ArrayBuffer)
  const responseSize = res.meta.responseSize
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB

  if (responseSize > MAX_SIZE) {
    useToast().error(
      `Response too large to snapshot (${(responseSize / 1024 / 1024).toFixed(1)}MB). Max: 5MB`
    )
    return
  }

  // Storage quota check (only on web, Tauri has larger quota)
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      const remaining = (estimate.quota || 0) - (estimate.usage || 0)
      const MIN_REMAINING = 10 * 1024 * 1024 // 10MB minimum

      if (remaining < MIN_REMAINING) {
        useToast().error(
          `Storage quota low (${(remaining / 1024 / 1024).toFixed(1)}MB remaining). Cannot auto-capture snapshot.`
        )
        return
      }
    } catch (err) {
      console.warn("Storage quota check failed:", err)
      // Continue anyway—quota check is best-effort
    }
  }

  // Check how many auto-captured snapshots exist for this request
  const endpoint = "endpoint" in res.req ? res.req.endpoint : res.req.url
  const method = "method" in res.req ? res.req.method : "POST"
  const requestKey = `${endpoint}_${method}`

  const { snapshots } = snapshotStore.value
  const existingForRequest = snapshots.filter(
    (s) => s.requestKey === requestKey && !s.isManual
  )

  // Evict oldest auto-captured for this request if we've hit the N limit
  if (existingForRequest.length >= autoCaptureCount) {
    const oldest = existingForRequest[existingForRequest.length - 1]
    removeSnapshot(oldest.id)
  }

  // Create snapshot (no async body conversion yet—store ArrayBuffer as-is)
  const snapshot = makeSnapshotFromResponse(
    res.req,
    res.body,
    res.headers,
    res.statusCode,
    res.statusText || "",
    res.meta.responseDuration,
    "endpoint" in res.req ? "REST" : "GQL",
    false // isManual = false for auto-capture
  )

  addSnapshot(snapshot)
})

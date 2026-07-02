import { HoppRESTRequest, HoppGQLRequest } from "@hoppscotch/data"
import { HoppRESTResponseHeader } from "./HoppRESTResponse"

/**
 * Request type discriminator
 */
export type ReqType = "REST" | "GQL"

/**
 * Snapshot of a request/response execution for diffing.
 * Stored locally in kernel Store, synced to backend when user is authenticated.
 */
export type DiffSnapshot = {
  id: string // Local UUID, matches backend ID when synced
  requestKey: string // Format: "${endpoint}_${method}" for grouping
  reqType: ReqType
  request: HoppRESTRequest | HoppGQLRequest // Full request object
  responseData: {
    body: ArrayBuffer // Raw response body (NOT base64—conversion only for backend sync)
    headers: HoppRESTResponseHeader[]
    statusCode: number
    statusText: string
    duration: number // Response time in milliseconds
  }
  isManual: boolean // true = user-created, false = auto-captured
  createdAt: Date
  syncedToBackend: boolean // false = pending sync, true = synced
}

/**
 * Result of comparing two snapshots
 */
export type DiffResult = {
  left: DiffSnapshot // "Previous" snapshot
  right: DiffSnapshot // "Current" snapshot (or current response, not yet a snapshot)
  changes: {
    statusCode: boolean // true if different
    headers: DiffHeaderChange[]
    body: boolean // true if body content differs (actual diff rendered by MergeView)
    duration: number // Difference in milliseconds (positive = slower, negative = faster)
  }
}

/**
 * Header-level change for granular diff display
 */
export type DiffHeaderChange = {
  key: string
  changeType: "added" | "removed" | "modified" | "unchanged"
  leftValue?: string
  rightValue?: string
}

/**
 * Store state for snapshot management
 */
export type SnapshotStoreState = {
  snapshots: DiffSnapshot[] // All snapshots, sorted by createdAt desc
  pendingSync: string[] // Array of snapshot IDs pending backend sync
}

/**
 * Helper to create a snapshot from a response
 */
export function makeSnapshotFromResponse(
  request: HoppRESTRequest | HoppGQLRequest,
  responseBody: ArrayBuffer,
  headers: HoppRESTResponseHeader[],
  statusCode: number,
  statusText: string,
  duration: number,
  reqType: ReqType,
  isManual: boolean = false
): DiffSnapshot {
  const endpoint = "endpoint" in request ? request.endpoint : request.url
  const method = "method" in request ? request.method : "POST" // GQL is always POST
  const requestKey = `${endpoint}_${method}`

  return {
    id: crypto.randomUUID(),
    requestKey,
    reqType,
    request,
    responseData: {
      body: responseBody,
      headers,
      statusCode,
      statusText,
      duration,
    },
    isManual,
    createdAt: new Date(),
    syncedToBackend: false,
  }
}

/**
 * Convert ArrayBuffer to base64 for backend sync
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert base64 to ArrayBuffer when syncing from backend
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

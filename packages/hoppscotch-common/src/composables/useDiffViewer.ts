import { ref } from "vue"
import { DiffSnapshot, DiffResult, DiffHeaderChange } from "~/helpers/types/DiffSnapshot"
import { HoppRESTResponse } from "~/helpers/types/HoppRESTResponse"
import { getPreviousSnapshot } from "~/newstore/snapshots"

export function useDiffViewer() {
  const isOpen = ref(false)
  const diffResult = ref<DiffResult | null>(null)
  const isComputing = ref(false)

  /**
   * Open diff modal comparing current response with previous snapshot
   */
  async function openDiff(currentResponse: HoppRESTResponse) {
    if (currentResponse.type !== "success" && currentResponse.type !== "failure") {
      console.warn("Cannot diff non-response types")
      return
    }

    const endpoint = currentResponse.req.endpoint
    const method = currentResponse.req.method
    const requestKey = `${endpoint}_${method}`

    const previousSnapshot = getPreviousSnapshot(requestKey)
    if (!previousSnapshot) {
      console.warn("No previous snapshot found for this request")
      return
    }

    isComputing.value = true

    try {
      // Compute header changes
      const headerChanges = computeHeaderDiff(
        previousSnapshot.responseData.headers,
        currentResponse.headers
      )

      // Check status code change
      const statusCodeChanged =
        previousSnapshot.responseData.statusCode !== currentResponse.statusCode

      // Check body change (simple byte comparison, actual diff rendered by MergeView)
      const bodyChanged = !arrayBuffersEqual(
        previousSnapshot.responseData.body,
        currentResponse.body
      )

      // Compute timing difference
      const durationDiff =
        currentResponse.meta.responseDuration -
        previousSnapshot.responseData.duration

      diffResult.value = {
        left: previousSnapshot,
        right: {
          // Convert current response to snapshot shape for consistent rendering
          id: "current",
          requestKey,
          reqType: "REST",
          request: currentResponse.req,
          responseData: {
            body: currentResponse.body,
            headers: currentResponse.headers,
            statusCode: currentResponse.statusCode,
            statusText: currentResponse.statusText,
            duration: currentResponse.meta.responseDuration,
          },
          isManual: false,
          createdAt: new Date(),
          syncedToBackend: false,
        },
        changes: {
          statusCode: statusCodeChanged,
          headers: headerChanges,
          body: bodyChanged,
          duration: durationDiff,
        },
      }

      isOpen.value = true
    } finally {
      isComputing.value = false
    }
  }

  function closeDiff() {
    isOpen.value = false
  }

  return {
    isOpen,
    diffResult,
    isComputing,
    openDiff,
    closeDiff,
  }
}

/**
 * Compare headers and return granular changes
 */
function computeHeaderDiff(
  leftHeaders: Array<{ key: string; value: string }>,
  rightHeaders: Array<{ key: string; value: string }>
): DiffHeaderChange[] {
  const changes: DiffHeaderChange[] = []
  const leftMap = new Map(leftHeaders.map((h) => [h.key.toLowerCase(), h.value]))
  const rightMap = new Map(rightHeaders.map((h) => [h.key.toLowerCase(), h.value]))

  // Check for removed and modified
  leftMap.forEach((leftValue, key) => {
    const rightValue = rightMap.get(key)
    if (rightValue === undefined) {
      changes.push({ key, changeType: "removed", leftValue })
    } else if (rightValue !== leftValue) {
      changes.push({ key, changeType: "modified", leftValue, rightValue })
    }
  })

  // Check for added
  rightMap.forEach((rightValue, key) => {
    if (!leftMap.has(key)) {
      changes.push({ key, changeType: "added", rightValue })
    }
  })

  return changes
}

/**
 * Compare ArrayBuffers for equality
 */
function arrayBuffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false
  const viewA = new Uint8Array(a)
  const viewB = new Uint8Array(b)
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== viewB[i]) return false
  }
  return true
}

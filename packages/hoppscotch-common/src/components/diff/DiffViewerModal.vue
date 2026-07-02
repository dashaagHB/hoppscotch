<script setup lang="ts">
import { computed } from "vue"
import { useDiffViewer } from "~/composables/useDiffViewer"
import IconX from "~icons/lucide/x"
import IconArrowRight from "~icons/lucide/arrow-right"
import AiexperimentsMergeView from "../aiexperiments/MergeView.vue"

const { isOpen, diffResult, closeDiff } = useDiffViewer()

const leftBody = computed(() => {
  if (!diffResult.value) return ""
  const decoder = new TextDecoder()
  return decoder.decode(diffResult.value.left.responseData.body)
})

const rightBody = computed(() => {
  if (!diffResult.value) return ""
  const decoder = new TextDecoder()
  return decoder.decode(diffResult.value.right.responseData.body)
})

const hasChanges = computed(() => {
  if (!diffResult.value) return false
  return (
    diffResult.value.changes.statusCode ||
    diffResult.value.changes.headers.length > 0 ||
    diffResult.value.changes.body
  )
})

function formatTimestamp(date: Date): string {
  return date.toLocaleString()
}

function formatDuration(ms: number): string {
  return `${ms}ms`
}
</script>

<template>
  <HoppSmartModal
    v-if="isOpen && diffResult"
    styles="sm:max-w-6xl"
    full-width
    @close="closeDiff"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h2 class="text-lg font-semibold">
          Response Comparison: {{ diffResult.left.requestKey }}
        </h2>
        <HoppButtonSecondary
          :icon="IconX"
          @click="closeDiff"
        />
      </div>
    </template>

    <template #body>
      <div class="flex flex-col h-full">
        <!-- Metadata comparison -->
        <div class="border-b border-divider p-4 space-y-3">
          <!-- Timestamps -->
          <div class="flex items-center text-sm gap-4">
            <div class="flex-1">
              <span class="text-secondary">Previous:</span>
              <span class="ml-2">{{ formatTimestamp(diffResult.left.createdAt) }}</span>
            </div>
            <IconArrowRight class="text-secondary" />
            <div class="flex-1">
              <span class="text-secondary">Current:</span>
              <span class="ml-2">{{ formatTimestamp(diffResult.right.createdAt) }}</span>
            </div>
          </div>

          <!-- Status code comparison -->
          <div
            class="flex items-center text-sm gap-4"
            :class="{
              'text-yellow-500': diffResult.changes.statusCode,
            }"
          >
            <div class="flex-1">
              <span class="text-secondary">Status:</span>
              <span class="ml-2">{{ diffResult.left.responseData.statusCode }}</span>
            </div>
            <IconArrowRight />
            <div class="flex-1">
              <span class="ml-2">{{ diffResult.right.responseData.statusCode }}</span>
            </div>
          </div>

          <!-- Duration comparison -->
          <div
            class="flex items-center text-sm gap-4"
            :class="{
              'text-green-500': diffResult.changes.duration < 0,
              'text-red-500': diffResult.changes.duration > 0,
            }"
          >
            <div class="flex-1">
              <span class="text-secondary">Duration:</span>
              <span class="ml-2">{{ formatDuration(diffResult.left.responseData.duration) }}</span>
            </div>
            <IconArrowRight />
            <div class="flex-1">
              <span class="ml-2">{{ formatDuration(diffResult.right.responseData.duration) }}</span>
              <span v-if="diffResult.changes.duration !== 0" class="ml-2">
                ({{ diffResult.changes.duration > 0 ? '+' : '' }}{{ formatDuration(diffResult.changes.duration) }})
              </span>
            </div>
          </div>

          <!-- Header changes summary -->
          <div v-if="diffResult.changes.headers.length > 0" class="text-sm">
            <span class="text-secondary">Header changes:</span>
            <ul class="ml-4 mt-1 space-y-1">
              <li
                v-for="change in diffResult.changes.headers"
                :key="change.key"
                :class="{
                  'text-green-500': change.changeType === 'added',
                  'text-red-500': change.changeType === 'removed',
                  'text-yellow-500': change.changeType === 'modified',
                }"
              >
                <span v-if="change.changeType === 'added'">+ {{ change.key }}</span>
                <span v-else-if="change.changeType === 'removed'">- {{ change.key }}</span>
                <span v-else>~ {{ change.key }}</span>
              </li>
            </ul>
          </div>

          <!-- No changes indicator -->
          <div v-if="!hasChanges" class="text-green-500 text-sm">
            ✓ Responses are identical
          </div>
        </div>

        <!-- Body diff -->
        <div class="flex-1 overflow-auto">
          <AiexperimentsMergeView
            :content-left="{
              content: leftBody,
              langMime: 'application/json',
            }"
            :content-right="{
              content: rightBody,
              langMime: 'application/json',
            }"
          />
        </div>
      </div>
    </template>
  </HoppSmartModal>
</template>

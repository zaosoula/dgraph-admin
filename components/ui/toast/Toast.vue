<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from "lucide-vue-next"
import { useToast, type ToastTone } from "./state"

const { toasts, dismiss } = useToast()

const icons: Record<ToastTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertOctagon,
  info: Info
}

const toneClass: Record<ToastTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info"
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      leave-active-class="transition duration-100 ease-in absolute"
      leave-to-class="opacity-0"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg"
      >
        <component
          :is="icons[item.tone]"
          class="mt-px h-4 w-4 shrink-0"
          :class="toneClass[item.tone]"
        />

        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-medium leading-5">{{ item.title }}</p>
          <p
            v-if="item.description"
            class="mt-0.5 text-xs leading-5 text-muted-foreground break-words"
          >
            {{ item.description }}
          </p>
        </div>

        <button
          type="button"
          class="-mr-1 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          :aria-label="`Dismiss: ${item.title}`"
          @click="dismiss(item.id)"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

import { ref } from "vue"

export type ToastTone = "success" | "warning" | "danger" | "info"

export type ToastItem = {
  id: string
  tone: ToastTone
  title: string
  description?: string
  /** Milliseconds before the toast dismisses itself. 0 keeps it until dismissed. */
  duration: number
}

export type ToastInput = {
  tone?: ToastTone
  title: string
  description?: string
  duration?: number
}

/**
 * Notification state, declared at module scope so every caller — a page, a
 * dialog, the connection switcher — pushes onto the same queue that the single
 * `<UiToast />` in the layout renders.
 */
const toasts = ref<ToastItem[]>([])

const timers = new Map<string, ReturnType<typeof setTimeout>>()

const MAX_VISIBLE = 4

const dismiss = (id: string) => {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  toasts.value = toasts.value.filter(toast => toast.id !== id)
}

const push = (input: ToastInput): string => {
  const id = crypto.randomUUID()
  const toast: ToastItem = {
    id,
    tone: input.tone ?? "info",
    title: input.title,
    description: input.description,
    duration: input.duration ?? (input.tone === "danger" ? 8000 : 5000)
  }

  toasts.value = [...toasts.value, toast].slice(-MAX_VISIBLE)

  if (toast.duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), toast.duration)
    )
  }

  return id
}

export function useToast() {
  return {
    toasts,
    toast: push,
    success: (title: string, description?: string) =>
      push({ tone: "success", title, description }),
    warning: (title: string, description?: string) =>
      push({ tone: "warning", title, description }),
    danger: (title: string, description?: string) =>
      push({ tone: "danger", title, description }),
    info: (title: string, description?: string) =>
      push({ tone: "info", title, description }),
    dismiss
  }
}

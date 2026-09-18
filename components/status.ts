import type { ConnectionState } from "@/types/connection"

/** The whole status vocabulary of the app. Anything with hue says one of these. */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

/**
 * One reading of connection health, shared by the sidebar, the connections list
 * and the switcher so the same dot never means two different things:
 *
 *   grey   — never tested
 *   blue   — a test is running
 *   green  — last test reached every endpoint
 *   red    — last test failed
 */
export const connectionTone = (state?: ConnectionState): StatusTone => {
  if (!state) return "neutral"
  if (state.isLoading) return "info"
  if (!state.lastChecked) return "neutral"
  return state.isConnected ? "success" : "danger"
}

export const connectionStatusLabel = (state?: ConnectionState): string => {
  if (!state) return "Not tested"
  if (state.isLoading) return "Testing…"
  if (!state.lastChecked) return "Not tested"
  return state.isConnected ? "Online" : "Unreachable"
}

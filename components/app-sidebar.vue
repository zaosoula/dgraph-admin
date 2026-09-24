<script setup lang="ts">
import { ref, computed } from "vue"
import { useRoute } from "vue-router"
import { useConnectionsStore } from "@/stores/connections"
import {
  LayoutGrid,
  Database,
  GitBranch,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-vue-next"

const route = useRoute()
const connectionsStore = useConnectionsStore()

const isCollapsed = ref(false)
const isMobileOpen = ref(false)

const navigationItems = computed(() => [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutGrid,
    description: "Connection health, schema sync and recent activity",
    disabled: false,
  },
  {
    name: "Connections",
    href: "/connections",
    icon: Database,
    description: "Add, edit and test Dgraph endpoints",
    disabled: false,
  },
  {
    name: "Schema",
    href: "/schema",
    icon: GitBranch,
    description: connectionsStore.activeConnection
      ? "Edit the GraphQL schema on the active connection"
      : "Select a connection first",
    disabled: !connectionsStore.activeConnection,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Credential storage and app information",
    disabled: false,
  },
])

const isActiveRoute = (href: string) => {
  if (href === "/") return route.path === "/"
  return route.path.startsWith(href)
}

const totalConnections = computed(() => connectionsStore.connections.length)

const onlineConnections = computed(
  () =>
    connectionsStore.connections.filter(
      conn => connectionsStore.connectionStates[conn.id]?.isConnected
    ).length
)

const checkedConnections = computed(
  () =>
    connectionsStore.connections.filter(
      conn => connectionsStore.connectionStates[conn.id]?.lastChecked
    ).length
)

// One shared reading of fleet health: green only when everything that has been
// checked answered, red when nothing did, amber in between, grey when untested.
const healthTone = computed(() => {
  if (totalConnections.value === 0) return "empty"
  if (checkedConnections.value === 0) return "unknown"
  if (onlineConnections.value === 0) return "down"
  if (onlineConnections.value === totalConnections.value) return "up"
  return "partial"
})

const healthDotClass = computed(
  () =>
    ({
      empty: "bg-border-strong",
      unknown: "bg-border-strong",
      down: "bg-danger",
      partial: "bg-warning",
      up: "bg-success",
    })[healthTone.value]
)

const healthLabel = computed(
  () =>
    ({
      empty: "No connections",
      unknown: "Not tested yet",
      down: `0 of ${totalConnections.value} online`,
      partial: `${onlineConnections.value} of ${totalConnections.value} online`,
      up: `${onlineConnections.value} of ${totalConnections.value} online`,
    })[healthTone.value]
)

const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value
}

const toggleMobile = () => {
  isMobileOpen.value = !isMobileOpen.value
}

const closeMobile = () => {
  isMobileOpen.value = false
}
</script>

<template>
  <!-- Mobile bar: in flow, so nothing ever sits underneath it -->
  <header
    class="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-sidebar px-3 md:hidden"
  >
    <button
      type="button"
      class="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
      :aria-label="isMobileOpen ? 'Close navigation' : 'Open navigation'"
      :aria-expanded="isMobileOpen"
      @click="toggleMobile"
    >
      <X v-if="isMobileOpen" class="h-4 w-4" />
      <Menu v-else class="h-4 w-4" />
    </button>

    <span class="text-[13px] font-semibold tracking-tight">Dgraph Admin</span>

    <ThemeToggle />
  </header>

  <div
    v-if="isMobileOpen"
    class="fixed inset-0 z-40 bg-overlay md:hidden"
    @click="closeMobile"
  />

  <aside
    :class="[
      'fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out',
      'md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:transition-[width]',
      isMobileOpen ? 'translate-x-0' : '-translate-x-full',
      isCollapsed ? 'md:w-14' : 'md:w-60',
    ]"
  >
    <div
      class="flex h-12 shrink-0 items-center border-b border-sidebar-border px-3"
      :class="isCollapsed ? 'md:justify-center md:px-0' : 'justify-between'"
    >
      <NuxtLink
        v-if="!isCollapsed"
        to="/"
        class="truncate text-[13px] font-semibold tracking-tight text-sidebar-foreground"
        @click="closeMobile"
      >
        Dgraph Admin
      </NuxtLink>

      <button
        type="button"
        class="hidden h-7 w-7 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:flex"
        :aria-label="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="toggleCollapsed"
      >
        <PanelLeftOpen v-if="isCollapsed" class="h-4 w-4" />
        <PanelLeftClose v-else class="h-4 w-4" />
      </button>

      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent md:hidden"
        aria-label="Close navigation"
        @click="closeMobile"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Active connection + fleet health -->
    <div
      v-if="!isCollapsed"
      class="shrink-0 space-y-2 border-b border-sidebar-border p-3"
    >
      <ConnectionSwitcher class="w-full" />

      <NuxtLink
        to="/connections"
        class="flex items-center gap-2 rounded-md px-1 py-1 text-xs text-sidebar-muted transition-colors hover:text-sidebar-accent-foreground"
        @click="closeMobile"
      >
        <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="healthDotClass" />
        <span class="truncate">{{ healthLabel }}</span>
      </NuxtLink>
    </div>

    <!-- Collapsed health marker keeps the signal visible at 56px -->
    <div
      v-else
      class="flex shrink-0 justify-center border-b border-sidebar-border py-3"
      :title="healthLabel"
    >
      <span class="h-2 w-2 rounded-full" :class="healthDotClass" />
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto p-2">
      <ul class="space-y-0.5">
        <li v-for="item in navigationItems" :key="item.name">
          <span
            v-if="item.disabled"
            :title="item.description"
            aria-disabled="true"
            :class="[
              'flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-sidebar-muted opacity-50',
              isCollapsed ? 'md:justify-center md:px-0' : '',
            ]"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0" />
            <span v-if="!isCollapsed" class="truncate">{{ item.name }}</span>
          </span>

          <NuxtLink
            v-else
            :to="item.href"
            :title="item.description"
            :class="[
              'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
              isActiveRoute(item.href)
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
              isCollapsed ? 'md:justify-center md:px-0' : '',
            ]"
            @click="closeMobile"
          >
            <component
              :is="item.icon"
              class="h-4 w-4 shrink-0"
              :class="
                isActiveRoute(item.href)
                  ? 'text-sidebar-accent-foreground'
                  : 'text-sidebar-muted'
              "
            />
            <span v-if="!isCollapsed" class="truncate">{{ item.name }}</span>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div
      class="flex shrink-0 items-center gap-2 border-t border-sidebar-border p-2"
      :class="isCollapsed ? 'md:justify-center' : 'justify-between'"
    >
      <span v-if="!isCollapsed" class="px-1 text-[11px] text-sidebar-muted">
        Appearance
      </span>
      <ThemeToggle />
    </div>
  </aside>
</template>

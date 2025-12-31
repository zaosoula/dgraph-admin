<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { useConnectionsStore } from "@/stores/connections";
import {
  Home,
  Database,
  GitBranch,
  Settings,
  Menu,
  X,
  ChevronRight,
  Activity,
  Zap,
} from "lucide-vue-next";

const route = useRoute();
const connectionsStore = useConnectionsStore();

const isCollapsed = ref(false);
const isMobileOpen = ref(false);

const navigationItems = [
  {
    name: "Dashboard",
    href: "/",
    icon: Home,
    description: "Overview and quick actions",
  },
  {
    name: "Connections",
    href: "/connections",
    icon: Database,
    description: "Manage Dgraph connections",
  },
  {
    name: "Schema",
    href: "/schema",
    icon: GitBranch,
    description: "Edit GraphQL schema",
    disabled: !connectionsStore.activeConnection,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Application preferences",
  },
];

const isActiveRoute = (href: string) => {
  if (href === "/") {
    return route.path === "/";
  }
  return route.path.startsWith(href);
};

const activeConnections = computed(() => {
  return connectionsStore.connections.filter((conn) => {
    const state = connectionsStore.connectionStates[conn.id];
    return state?.isConnected;
  }).length;
});

const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value;
};

const toggleMobile = () => {
  isMobileOpen.value = !isMobileOpen.value;
};

const closeMobile = () => {
  isMobileOpen.value = false;
};
</script>

<template>
  <!-- Mobile menu button -->
  <button
    @click="toggleMobile"
    class="fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border shadow-sm md:hidden hover:bg-muted transition-colors"
  >
    <Menu v-if="!isMobileOpen" class="h-5 w-5" />
    <X v-else class="h-5 w-5" />
  </button>

  <!-- Mobile overlay -->
  <div
    v-if="isMobileOpen"
    class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
    @click="closeMobile"
  />

  <!-- Sidebar -->
  <aside
    :class="[
      'fixed left-0 top-0 z-40 h-full min-h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out',
      'md:relative md:translate-x-0',
      isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      isCollapsed ? 'w-16' : 'w-64',
    ]"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between p-4 border-b border-sidebar-border"
    >
      <div v-if="!isCollapsed" class="flex items-center space-x-2">
        <div>
          <h1 class="text-lg font-semibold text-sidebar-foreground">
            Dgraph Admin
          </h1>
        </div>
      </div>

      <button
        @click="toggleCollapsed"
        class="hidden md:flex p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
      >
        <ChevronRight
          :class="[
            'h-4 w-4 text-sidebar-foreground transition-transform',
            isCollapsed ? 'rotate-0' : 'rotate-180',
          ]"
        />
      </button>
    </div>

    <!-- Connection Status -->
    <div v-if="!isCollapsed" class="p-4 border-b border-sidebar-border">
      <ConnectionSwitcher class="w-full" />
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-2">
      <ul class="space-y-1">
        <li v-for="item in navigationItems" :key="item.name">
          <NuxtLink
            :to="item.href"
            :class="[
              'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              'focus:outline-none focus:ring-2 focus:ring-sidebar-ring',
              isActiveRoute(item.href)
                ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                : 'text-sidebar-foreground',
              item.disabled ? 'opacity-50 cursor-not-allowed' : '',
              isCollapsed ? 'justify-center px-2' : '',
            ]"
            @click="closeMobile"
          >
            <component
              :is="item.icon"
              :class="[
                'h-5 w-5 flex-shrink-0',
                isActiveRoute(item.href)
                  ? 'text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70',
              ]"
            />

            <div v-if="!isCollapsed" class="flex-1 min-w-0">
              <p class="truncate">{{ item.name }}</p>
              <p class="text-xs opacity-70 truncate">{{ item.description }}</p>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <!-- Footer -->
    <div v-if="!isCollapsed" class="p-4 border-t border-sidebar-border">
      <div class="text-xs text-sidebar-foreground/60 text-center">
        <p>Dgraph Admin v1.0</p>
        <p class="mt-1">Built with ❤️</p>
      </div>
    </div>
  </aside>
</template>

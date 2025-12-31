<script setup lang="ts"></script>

<template>
  <div class="min-h-screen bg-background flex">
    <!-- Sidebar -->
    <AppSidebar />

    <!-- Main Content -->
    <div class="flex-1 flex flex-col md:ml-0">
      <!-- Main Content Area -->
      <main class="flex-1 p-4 md:p-6 gradient-bg">
        <div class="max-w-7xl mx-auto">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

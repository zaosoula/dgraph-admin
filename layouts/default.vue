<script setup lang="ts"></script>

<template>
  <div class="flex min-h-screen flex-col bg-background md:flex-row">
    <AppSidebar />

    <div class="flex min-w-0 flex-1 flex-col">
      <main class="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div class="mx-auto w-full max-w-[1280px]">
          <slot />
        </div>
      </main>
    </div>

    <UiToast />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  originalSchema: string
  newSchema: string
}>()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="mb-2">
      <h3 class="text-[13px] font-semibold tracking-tight">Saved version compared with the editor</h3>
      <p class="text-xs text-muted-foreground">Left is the saved version, right is what is in the editor now.</p>
    </div>

    <SchemaDiffViewer
      class="min-h-0 flex-1"
      :original-schema="originalSchema"
      :new-schema="newSchema"
      left-label="Saved version"
      right-label="Editor"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FileJson, Upload } from 'lucide-vue-next'
import { useConnectionExportImport } from '@/composables/useConnectionExportImport'
import type { ConnectionImportResult } from '@/composables/useConnectionExportImport'

const emit = defineEmits<{
  'imported': [result: ConnectionImportResult]
  'cancelled': []
}>()

const { importConnections } = useConnectionExportImport()

const isLoading = ref(false)
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)

// Handle file selection
const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]
    importError.value = null
  }
}

// Trigger file input click
const selectFile = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// Import the selected file
const importFile = async () => {
  if (!selectedFile.value) {
    importError.value = 'Please select a file to import'
    return
  }

  isLoading.value = true
  importError.value = null

  try {
    const result = await importConnections(selectedFile.value)
    emit('imported', result)
  } catch (error) {
    importError.value = `Import failed: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    isLoading.value = false
  }
}

// Cancel import
const cancelImport = () => {
  emit('cancelled')
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1.5">
      <p class="max-w-prose text-xs leading-5 text-muted-foreground">
        Choose a JSON file exported by Dgraph Admin. A file exported without credentials
        brings in the connections only, so you will need to enter passwords, tokens and
        API keys again afterwards.
      </p>
      <p class="max-w-prose text-xs leading-5 text-muted-foreground">
        A file exported <em>with</em> credentials holds them in plaintext. Delete it once
        the import is done.
      </p>
    </div>

    <button
      type="button"
      class="flex w-full cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border-strong px-6 py-8 text-center transition-colors hover:bg-accent/40"
      @click="selectFile"
    >
      <input 
        type="file" 
        ref="fileInputRef"
        class="hidden" 
        accept=".json" 
        @change="handleFileChange"
      />
      
      <template v-if="!selectedFile">
        <Upload class="h-5 w-5 text-muted-foreground" />
        <span class="text-[13px] font-medium">Choose a JSON file</span>
        <span class="text-xs text-muted-foreground">Exported from Dgraph Admin</span>
      </template>

      <template v-else>
        <FileJson class="h-5 w-5 text-muted-foreground" />
        <span class="font-mono text-[13px] font-medium">{{ selectedFile.name }}</span>
        <span class="font-mono text-xs text-muted-foreground">
          {{ Math.round(selectedFile.size / 1024) }} KB
        </span>
      </template>
    </button>
    
    <div
      v-if="importError"
      class="rounded-md border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] text-danger"
    >
      {{ importError }}
    </div>
    
    <div class="flex justify-end gap-2 border-t border-border pt-4">
      <UiButton variant="outline" size="sm" :disabled="isLoading" @click="cancelImport">
        Cancel
      </UiButton>

      <UiButton size="sm" :disabled="isLoading || !selectedFile" @click="importFile">
        {{ isLoading ? "Importing…" : "Import connections" }}
      </UiButton>
    </div>
  </div>
</template>


<script setup lang="ts">
import { ref } from 'vue'
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
    <div class="space-y-2">
      <h3 class="text-lg font-medium">Import Connections</h3>
      <p class="text-sm text-muted-foreground">
        Import connections from a JSON file. The file should be in the format exported by Dgraph Admin.
      </p>
    </div>

    <div 
      class="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
      @click="selectFile"
    >
      <input 
        type="file" 
        ref="fileInputRef"
        class="hidden" 
        accept=".json" 
        @change="handleFileChange"
      />
      
      <div v-if="!selectedFile" class="space-y-2">
        <div class="text-3xl mb-2">📁</div>
        <p class="text-sm font-medium">Click to select a file or drag and drop</p>
        <p class="text-xs text-muted-foreground">Supports JSON files</p>
      </div>
      
      <div v-else class="space-y-2">
        <div class="text-3xl mb-2">📄</div>
        <p class="text-sm font-medium">{{ selectedFile.name }}</p>
        <p class="text-xs text-muted-foreground">{{ Math.round(selectedFile.size / 1024) }} KB</p>
      </div>
    </div>
    
    <div v-if="importError" class="p-4 rounded-md bg-red-50 text-red-700 text-sm">
      {{ importError }}
    </div>
    
    <div class="flex justify-end space-x-2">
      <UiButton 
        variant="outline" 
        @click="cancelImport" 
        :disabled="isLoading"
      >
        Cancel
      </UiButton>
      
      <UiButton 
        @click="importFile" 
        :disabled="isLoading || !selectedFile"
      >
        <span v-if="isLoading">Importing...</span>
        <span v-else>Import</span>
      </UiButton>
    </div>
  </div>
</template>


<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  FileJson, 
  Table, 
  Network, 
  Download, 
  Clock, 
  Hash,
  AlertCircle,
  CheckCircle2,
  Copy
} from 'lucide-vue-next'
import type { QueryResult, ViewMode, ExportFormat } from '@/types/explorer'

type Props = {
  result: QueryResult | null
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false
})

const activeTab = ref<ViewMode>('json')
const showCopySuccess = ref(false)

// Computed properties
const hasData = computed(() => props.result?.data != null)
const isSuccess = computed(() => props.result?.success === true)
const formattedJson = computed(() => {
  if (!hasData.value) return ''
  return JSON.stringify(props.result?.data, null, 2)
})

const tableData = computed(() => {
  if (!hasData.value || !Array.isArray(props.result?.data)) return []
  return props.result?.data || []
})

const tableColumns = computed(() => {
  if (tableData.value.length === 0) return []
  const firstRow = tableData.value[0]
  if (typeof firstRow !== 'object' || firstRow === null) return ['value']
  return Object.keys(firstRow)
})

// Export functionality
const exportData = (format: ExportFormat) => {
  if (!hasData.value) return

  let content = ''
  let filename = ''
  let mimeType = ''

  if (format === 'json') {
    content = formattedJson.value
    filename = `dgraph-query-result-${Date.now()}.json`
    mimeType = 'application/json'
  } else if (format === 'csv') {
    content = convertToCSV(props.result?.data)
    filename = `dgraph-query-result-${Date.now()}.csv`
    mimeType = 'text/csv'
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const convertToCSV = (data: any): string => {
  if (!Array.isArray(data) || data.length === 0) {
    return 'No data available'
  }

  const headers = Object.keys(data[0])
  const csvHeaders = headers.join(',')
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header]
      if (value === null || value === undefined) return ''
      if (typeof value === 'object') return JSON.stringify(value)
      return `"${String(value).replace(/"/g, '""')}"`
    }).join(',')
  })

  return [csvHeaders, ...csvRows].join('\n')
}

// Copy to clipboard
const copyToClipboard = async () => {
  if (!hasData.value) return

  try {
    await navigator.clipboard.writeText(formattedJson.value)
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
  }
}

// Format execution time
const formatExecutionTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
</script>

<template>
  <UiCard class="hover-lift">
    <UiCardHeader>
      <div class="flex items-center justify-between">
        <UiCardTitle class="flex items-center space-x-2">
          <CheckCircle2 v-if="isSuccess" class="h-5 w-5 text-green-500" />
          <AlertCircle v-else-if="result && !isSuccess" class="h-5 w-5 text-red-500" />
          <span>Query Results</span>
        </UiCardTitle>
        
        <div v-if="result" class="flex items-center space-x-2">
          <!-- Metadata -->
          <div class="flex items-center space-x-4 text-sm text-muted-foreground">
            <div class="flex items-center space-x-1">
              <Clock class="h-4 w-4" />
              <span>{{ formatExecutionTime(result.metadata.executionTime) }}</span>
            </div>
            <div class="flex items-center space-x-1">
              <Hash class="h-4 w-4" />
              <span>{{ result.metadata.rowCount }} rows</span>
            </div>
          </div>
          
          <!-- Export buttons -->
          <div v-if="hasData" class="flex items-center space-x-1">
            <UiButton
              variant="outline"
              size="sm"
              @click="copyToClipboard"
              class="hover-lift"
            >
              <Copy class="h-4 w-4 mr-1" />
              {{ showCopySuccess ? 'Copied!' : 'Copy' }}
            </UiButton>
            
            <UiButton
              variant="outline"
              size="sm"
              @click="exportData('json')"
              class="hover-lift"
            >
              <Download class="h-4 w-4 mr-1" />
              Export JSON
            </UiButton>
          </div>
        </div>
      </div>
    </UiCardHeader>
    
    <UiCardContent>
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <div class="flex items-center space-x-3">
          <div class="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span class="text-muted-foreground">Executing query...</span>
        </div>
      </div>
      
      <!-- Error state -->
      <div v-else-if="result && !isSuccess" class="py-8">
        <div class="flex items-start space-x-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle class="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h4 class="font-medium text-destructive mb-1">Query Error</h4>
            <p class="text-sm text-destructive/80">{{ result.error }}</p>
          </div>
        </div>
      </div>
      
      <!-- No results state -->
      <div v-else-if="!result" class="text-center py-12">
        <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <FileJson class="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 class="text-lg font-medium mb-2">No Results</h3>
        <p class="text-muted-foreground">Execute a query to see results here</p>
      </div>
      
      <!-- Results with view switcher -->
      <div v-else-if="hasData">
        <!-- View Switcher -->
        <div class="flex items-center space-x-2 mb-4">
          <UiButton
            :variant="activeTab === 'json' ? 'default' : 'outline'"
            size="sm"
            @click="activeTab = 'json'"
            class="flex items-center space-x-2"
          >
            <FileJson class="h-4 w-4" />
            <span>JSON</span>
          </UiButton>
          <UiButton
            :variant="activeTab === 'table' ? 'default' : 'outline'"
            size="sm"
            @click="activeTab = 'table'"
            :disabled="!Array.isArray(result.data)"
            class="flex items-center space-x-2"
          >
            <Table class="h-4 w-4" />
            <span>Table</span>
          </UiButton>
          <UiButton
            variant="outline"
            size="sm"
            disabled
            class="flex items-center space-x-2 opacity-50"
          >
            <Network class="h-4 w-4" />
            <span>Graph (Soon)</span>
          </UiButton>
        </div>
        
        <!-- JSON View -->
        <div v-if="activeTab === 'json'" class="mt-4">
          <div class="relative">
            <pre class="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-sm"><code>{{ formattedJson }}</code></pre>
          </div>
        </div>
        
        <!-- Table View -->
        <div v-else-if="activeTab === 'table'" class="mt-4">
          <div v-if="Array.isArray(result.data) && result.data.length > 0" class="border rounded-lg overflow-auto max-h-96">
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th v-for="column in tableColumns" :key="column" class="px-4 py-2 text-left font-medium">
                    {{ column }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in tableData" :key="index" class="border-t">
                  <td v-for="column in tableColumns" :key="column" class="px-4 py-2">
                    <span v-if="typeof row[column] === 'object'">
                      {{ JSON.stringify(row[column]) }}
                    </span>
                    <span v-else>{{ row[column] }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="text-center py-8 text-muted-foreground">
            Data is not in table format
          </div>
        </div>
      </div>
      
      <!-- Empty results -->
      <div v-else class="text-center py-8">
        <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 class="h-8 w-8 text-green-500" />
        </div>
        <h3 class="text-lg font-medium mb-2">Query Executed Successfully</h3>
        <p class="text-muted-foreground">No data returned</p>
      </div>
    </UiCardContent>
  </UiCard>
</template>

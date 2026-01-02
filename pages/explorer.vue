<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Database,
  AlertCircle,
} from "lucide-vue-next";
import { useConnectionsStore } from "@/stores/connections";
import { useDgraphClient } from "@/composables/useDgraphClient";
import type { QueryResult } from "@/types/explorer";

// Stores and composables
const connectionsStore = useConnectionsStore();
const dgraphClient = useDgraphClient();

// Page metadata
useHead({
  title: "Visual Data Explorer - Dgraph Admin",
  meta: [
    {
      name: "description",
      content: "Visually explore your Dgraph data by browsing schema types",
    },
  ],
});

// Reactive state
const selectedType = ref<string | null>(null);
const typeResults = ref<QueryResult | null>(null);
const isLoadingData = ref(false);

// Computed properties
const hasActiveConnection = computed(() => !!connectionsStore.activeConnection);
const isConnected = computed(() => {
  if (!connectionsStore.activeConnection) return false;
  const state =
    connectionsStore.connectionStates[connectionsStore.activeConnection.id];
  return state?.isConnected || false;
});

const canExploreData = computed(
  () => hasActiveConnection.value && isConnected.value
);

// Event handlers
const handleSelectType = async (typeName: string, query: string) => {
  if (!canExploreData.value) return;
  
  selectedType.value = typeName;
  isLoadingData.value = true;
  
  try {
    const startTime = Date.now();
    const result = await dgraphClient.query(query);
    const executionTime = Date.now() - startTime;
    
    if (result.success && result.data) {
      // Count the results
      const resultKey = Object.keys(result.data)[0];
      const resultData = result.data[resultKey];
      const rowCount = Array.isArray(resultData) ? resultData.length : 1;
      
      typeResults.value = {
        data: result.data,
        executionTime,
        rowCount,
        queryType: 'query'
      };
    } else {
      typeResults.value = null;
    }
  } catch (error) {
    console.error('Error loading type data:', error);
    typeResults.value = null;
  } finally {
    isLoadingData.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1
          class="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
        >
          Visual Data Explorer
        </h1>
        <p class="text-muted-foreground mt-2">
          Explore your Dgraph data by browsing schema types visually
        </p>
      </div>

      <div class="flex items-center space-x-3">
        <UiButton
          v-if="typeResults"
          variant="outline"
          size="sm"
          @click="typeResults = null; selectedType = null"
          class="hover-lift"
        >
          Clear Results
        </UiButton>
      </div>
    </div>

    <!-- Connection Status -->
    <div v-if="!canExploreData" class="mb-6">
      <UiCard class="border-orange-200 bg-orange-50">
        <UiCardContent class="pt-6">
          <div class="flex items-start space-x-3">
            <AlertCircle class="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 class="font-medium text-orange-800 mb-1">
                Connection Required
              </h4>
              <p class="text-sm text-orange-700">
                <span v-if="!hasActiveConnection">
                  Please select an active connection to explore data.
                </span>
                <span v-else-if="!isConnected">
                  The selected connection is not active. Please check your
                  connection status.
                </span>
                <NuxtLink to="/connections" class="underline ml-2">
                  Manage Connections
                </NuxtLink>
              </p>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column: Schema Type Browser -->
      <div class="lg:col-span-1">
        <TypeBrowser
          @select-type="handleSelectType"
        />
      </div>
      
      <!-- Right Column: Results Display -->
      <div class="lg:col-span-2">
        <!-- Selected Type Header -->
        <div v-if="selectedType" class="mb-4">
          <div class="flex items-center space-x-3">
            <Database class="h-5 w-5 text-primary" />
            <h2 class="text-xl font-semibold">{{ selectedType }}</h2>
            <span v-if="typeResults" class="text-sm text-muted-foreground">
              ({{ typeResults.rowCount }} records)
            </span>
          </div>
        </div>

        <!-- Results Display -->
        <ResultsDisplay
          :result="typeResults"
          :is-loading="isLoadingData"
        />
        
        <!-- Empty State -->
        <div v-if="!selectedType && !isLoadingData" class="text-center py-12">
          <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Database class="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 class="text-lg font-medium text-foreground mb-2">
            Select a Type to Explore
          </h3>
          <p class="text-muted-foreground max-w-md mx-auto">
            Choose a schema type from the left panel to view its data. 
            Click on any type to see sample records and explore your data visually.
          </p>
        </div>
      </div>
    </div>

  </div>
</template>

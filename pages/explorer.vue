<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Search,
  Database,
  BookOpen,
  Lightbulb,
  AlertCircle,
} from "lucide-vue-next";
import { useConnectionsStore } from "@/stores/connections";
import { useQueryExecution } from "@/composables/useQueryExecution";
import type { ExampleQuery } from "@/types/explorer";

// Stores and composables
const connectionsStore = useConnectionsStore();
const {
  queryResults,
  queryHistory,
  isExecuting,
  hasError,
  errorMessage,
  executeQueryWithHistory,
  clearHistory,
  removeHistoryItem,
  clearResults,
} = useQueryExecution();

// Page metadata
useHead({
  title: "Data Explorer - Dgraph Admin",
  meta: [
    {
      name: "description",
      content: "Explore and query your Dgraph data with DQL",
    },
  ],
});

// Reactive state
const currentQuery = ref("");
const showExamples = ref(false);
const historyCollapsed = ref(false);

// Example queries
const exampleQueries: ExampleQuery[] = [
  {
    id: "basic-1",
    title: "Get All Nodes",
    description: "Retrieve all nodes with their predicates",
    category: "basic",
    query: `{
  all(func: has(dgraph.type)) {
    uid
    dgraph.type
    expand(_all_)
  }
}`,
  },
  {
    id: "basic-2",
    title: "Get Schema",
    description: "Query the current schema",
    category: "basic",
    query: `schema {
  type
  predicate
  index
}`,
  },
  {
    id: "advanced-1",
    title: "Filter by Type",
    description: "Get nodes of a specific type",
    category: "advanced",
    query: `{
  nodes(func: type(Person)) {
    uid
    name
    age
    email
  }
}`,
  },
  {
    id: "advanced-2",
    title: "Traverse Relationships",
    description: "Follow edges between nodes",
    category: "advanced",
    query: `{
  person(func: eq(name, "John")) {
    uid
    name
    friends {
      uid
      name
    }
  }
}`,
  },
  {
    id: "aggregation-1",
    title: "Count Nodes",
    description: "Count nodes by type",
    category: "aggregation",
    query: `{
  count(func: has(dgraph.type)) {
    count(uid)
  }
}`,
  },
];

// Computed properties
const hasActiveConnection = computed(() => !!connectionsStore.activeConnection);
const isConnected = computed(() => {
  if (!connectionsStore.activeConnection) return false;
  const state =
    connectionsStore.connectionStates[connectionsStore.activeConnection.id];
  return state?.isConnected || false;
});

const canExecuteQueries = computed(
  () => hasActiveConnection.value && isConnected.value
);

const groupedExamples = computed(() => {
  const groups = {
    basic: exampleQueries.filter((q) => q.category === "basic"),
    advanced: exampleQueries.filter((q) => q.category === "advanced"),
    aggregation: exampleQueries.filter((q) => q.category === "aggregation"),
  };
  return groups;
});

// Event handlers
const handleExecuteQuery = async (query: string) => {
  if (!canExecuteQueries.value) return;

  try {
    await executeQueryWithHistory(query);
  } catch (error) {
    // Error is already handled in the composable
    console.error("Query execution failed:", error);
  }
};

const handleLoadExample = (query: string) => {
  currentQuery.value = query;
  showExamples.value = false;
};

const handleSelectFromHistory = (query: string) => {
  currentQuery.value = query;
};

const handleSelectType = (typeName: string, query: string) => {
  currentQuery.value = query
  // Optionally execute the query immediately
  if (canExecuteQueries.value) {
    handleExecuteQuery(query)
  }
}

const handleClearQuery = () => {
  currentQuery.value = "";
};

const handleShowHelp = () => {
  showExamples.value = true;
};

const handleToggleHistory = () => {
  historyCollapsed.value = !historyCollapsed.value;
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
          Data Explorer
        </h1>
        <p class="text-muted-foreground mt-2">
          Query and explore your Dgraph data using DQL
        </p>
      </div>

      <div class="flex items-center space-x-3">
        <UiButton
          variant="outline"
          size="sm"
          @click="showExamples = true"
          class="hover-lift"
        >
          <BookOpen class="h-4 w-4 mr-2" />
          Examples
        </UiButton>

        <UiButton
          v-if="queryResults"
          variant="outline"
          size="sm"
          @click="clearResults"
          class="hover-lift"
        >
          Clear Results
        </UiButton>
      </div>
    </div>

    <!-- Connection Status -->
    <div v-if="!canExecuteQueries" class="mb-6">
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
                  Please select an active connection to execute queries.
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
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- Left Column: Query Editor and Results -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Query Editor -->
        <ExplorerQueryInput
          v-model="currentQuery"
          :is-executing="isExecuting"
          :disabled="!canExecuteQueries"
          @execute="handleExecuteQuery"
          @clear="handleClearQuery"
          @help="handleShowHelp"
        />

        <!-- Results Display -->
        <ExplorerResultsDisplay
          :result="queryResults"
          :is-loading="isExecuting"
        />
      </div>
      
      <!-- Right Column: Type Browser and Query History -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Schema Type Browser -->
        <TypeBrowser
          @select-type="handleSelectType"
        />
        
        <!-- Query History -->
        <QueryHistory
          :history="queryHistory"
          :is-collapsed="historyCollapsed"
          @select-query="handleSelectFromHistory"
          @remove-item="removeHistoryItem"
          @clear-history="clearHistory"
          @toggle-collapsed="handleToggleHistory"
        />
      </div>
    </div>

    <!-- Examples Dialog -->
    <UiDialog v-model:open="showExamples">
      <UiDialogContent class="max-w-4xl max-h-[80vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle class="flex items-center space-x-2">
            <Lightbulb class="h-5 w-5 text-primary" />
            <span>DQL Query Examples</span>
          </UiDialogTitle>
          <UiDialogDescription>
            Click on any example to load it into the query editor
          </UiDialogDescription>
        </UiDialogHeader>

        <div class="space-y-6 mt-6">
          <!-- Basic Queries -->
          <div>
            <h3 class="text-lg font-semibold mb-3 flex items-center space-x-2">
              <Database class="h-4 w-4" />
              <span>Basic Queries</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="example in groupedExamples.basic"
                :key="example.id"
                class="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                @click="handleLoadExample(example.query)"
              >
                <h4 class="font-medium mb-1">{{ example.title }}</h4>
                <p class="text-sm text-muted-foreground mb-2">
                  {{ example.description }}
                </p>
                <pre
                  class="text-xs bg-muted p-2 rounded overflow-x-auto"
                ><code>{{ example.query.trim() }}</code></pre>
              </div>
            </div>
          </div>

          <!-- Advanced Queries -->
          <div>
            <h3 class="text-lg font-semibold mb-3 flex items-center space-x-2">
              <Search class="h-4 w-4" />
              <span>Advanced Queries</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="example in groupedExamples.advanced"
                :key="example.id"
                class="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                @click="handleLoadExample(example.query)"
              >
                <h4 class="font-medium mb-1">{{ example.title }}</h4>
                <p class="text-sm text-muted-foreground mb-2">
                  {{ example.description }}
                </p>
                <pre
                  class="text-xs bg-muted p-2 rounded overflow-x-auto"
                ><code>{{ example.query.trim() }}</code></pre>
              </div>
            </div>
          </div>

          <!-- Aggregation Queries -->
          <div>
            <h3 class="text-lg font-semibold mb-3">Aggregation Queries</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="example in groupedExamples.aggregation"
                :key="example.id"
                class="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                @click="handleLoadExample(example.query)"
              >
                <h4 class="font-medium mb-1">{{ example.title }}</h4>
                <p class="text-sm text-muted-foreground mb-2">
                  {{ example.description }}
                </p>
                <pre
                  class="text-xs bg-muted p-2 rounded overflow-x-auto"
                ><code>{{ example.query.trim() }}</code></pre>
              </div>
            </div>
          </div>
        </div>

        <UiDialogFooter class="mt-6">
          <UiButton variant="outline" @click="showExamples = false">
            Close
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>

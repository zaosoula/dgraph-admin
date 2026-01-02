<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  useSchemaPromotion,
  type SchemaComparisonResult,
} from "@/composables/useSchemaPromotion";
import { useConnectionsStore } from "@/stores/connections";
import type { Connection } from "@/types/connection";

const props = defineProps<{
  open: boolean;
  devConnection: Connection;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "promotion-success": [];
}>();

const connectionsStore = useConnectionsStore();
const { isPromoting, isComparing, compareSchemas, promoteSchema } =
  useSchemaPromotion();

const comparisonResult = ref<SchemaComparisonResult | null>(null);
const promotionError = ref<string | null>(null);
const promotionSuccess = ref(false);

const prodConnection = computed(() => {
  if (!props.devConnection.linkedProductionId) return null;
  return connectionsStore.getLinkedProduction(props.devConnection.id);
});

const canProceed = computed(() => {
  return comparisonResult.value && prodConnection.value && !isPromoting.value;
});

// Compare schemas when dialog opens
const handleCompareSchemas = async () => {
  if (!prodConnection.value) return;

  promotionError.value = null;
  comparisonResult.value = null;

  const result = await compareSchemas(
    props.devConnection,
    prodConnection.value
  );
  if (result) {
    comparisonResult.value = result;
  } else {
    promotionError.value =
      "Failed to compare schemas. Please check your connections.";
  }
};

// Execute schema promotion
const handlePromoteSchema = async () => {
  if (!prodConnection.value) return;

  promotionError.value = null;
  promotionSuccess.value = false;

  const result = await promoteSchema(props.devConnection, prodConnection.value);

  if (result.success) {
    promotionSuccess.value = true;
    emit("promotion-success");
    setTimeout(() => {
      emit("update:open", false);
    }, 2000);
  } else {
    promotionError.value = result.error || "Schema promotion failed";
  }
};

// Reset state when dialog closes
const handleOpenChange = (open: boolean) => {
  if (!open) {
    comparisonResult.value = null;
    promotionError.value = null;
    promotionSuccess.value = false;
  }
  emit("update:open", open);
};

// Auto-compare when dialog opens
const handleDialogOpen = () => {
  if (props.open && prodConnection.value) {
    handleCompareSchemas();
  }
};

// Watch for dialog opening
watch(
  () => props.open,
  (newValue) => {
    if (newValue) {
      handleDialogOpen();
    }
  }
);
</script>

<template>
  <UiDialog :open="open" @update:open="handleOpenChange">
    <UiDialogContent
      class="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
    >
      <UiDialogHeader>
        <UiDialogTitle>Promote Schema to Production</UiDialogTitle>
        <UiDialogDescription>
          Promote schema from <strong>{{ devConnection.name }}</strong> to
          <strong>{{ prodConnection?.name || "Unknown" }}</strong>
        </UiDialogDescription>
      </UiDialogHeader>

      <div class="flex-1 overflow-auto space-y-4">
        <!-- Loading State -->
        <div v-if="isComparing" class="flex items-center justify-center py-8">
          <div class="flex items-center space-x-2">
            <div
              class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"
            ></div>
            <span>Comparing schemas...</span>
          </div>
        </div>

        <!-- Error State -->
        <div
          v-else-if="promotionError"
          class="p-4 bg-red-50 border border-red-200 rounded-md"
        >
          <div class="flex items-center space-x-2">
            <svg
              class="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span class="text-red-700 font-medium">Error</span>
          </div>
          <p class="text-red-600 mt-1">{{ promotionError }}</p>
        </div>

        <!-- Success State -->
        <div
          v-else-if="promotionSuccess"
          class="p-4 bg-green-50 border border-green-200 rounded-md"
        >
          <div class="flex items-center space-x-2">
            <svg
              class="w-5 h-5 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
            <span class="text-green-700 font-medium">Success!</span>
          </div>
          <p class="text-green-600 mt-1">
            Schema has been successfully promoted to production.
          </p>
        </div>

        <!-- Comparison Results -->
        <div v-else-if="comparisonResult" class="space-y-4">
          <!-- No Differences -->
          <div
            v-if="!comparisonResult.hasDifferences"
            class="p-4 bg-blue-50 border border-blue-200 rounded-md"
          >
            <div class="flex items-center space-x-2">
              <svg
                class="w-5 h-5 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <span class="text-blue-700 font-medium">No Differences</span>
            </div>
            <p class="text-blue-600 mt-1">
              The development and production schemas are identical.
            </p>
          </div>

          <!-- Schema Differences -->
          <div v-else class="space-y-4">
            <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div class="flex items-center space-x-2">
                <svg
                  class="w-5 h-5 text-yellow-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  ></path>
                </svg>
                <span class="text-yellow-700 font-medium"
                  >Schema Differences Detected</span
                >
              </div>
              <p class="text-yellow-600 mt-1">
                The following changes will be applied to the production schema:
              </p>
            </div>

            <!-- Differences List -->
            <div
              v-if="comparisonResult.differences"
              class="bg-gray-50 border rounded-md p-4"
            >
              <h4 class="font-medium text-sm mb-2">Changes:</h4>
              <div class="space-y-1 font-mono text-sm max-h-40 overflow-auto">
                <div
                  v-for="(diff, index) in comparisonResult.differences"
                  :key="index"
                  :class="{
                    'text-green-600': diff.startsWith('+'),
                    'text-red-600': diff.startsWith('-'),
                  }"
                >
                  {{ diff }}
                </div>
              </div>
            </div>

            <!-- Schema Preview -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <h4 class="font-medium text-sm mb-2">Development Schema</h4>
                <div
                  class="bg-gray-50 border rounded-md p-3 max-h-40 overflow-auto"
                >
                  <pre class="text-xs font-mono whitespace-pre-wrap">{{
                    comparisonResult.devSchema || "No schema"
                  }}</pre>
                </div>
              </div>
              <div>
                <h4 class="font-medium text-sm mb-2">
                  Production Schema (Current)
                </h4>
                <div
                  class="bg-gray-50 border rounded-md p-3 max-h-40 overflow-auto"
                >
                  <pre class="text-xs font-mono whitespace-pre-wrap">{{
                    comparisonResult.prodSchema || "No schema"
                  }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <UiDialogFooter class="flex justify-between">
        <UiButton
          variant="outline"
          @click="handleOpenChange(false)"
          :disabled="isPromoting"
        >
          Cancel
        </UiButton>
        <div class="space-x-2">
          <UiButton
            variant="outline"
            @click="handleCompareSchemas"
            :disabled="isComparing || isPromoting"
          >
            <svg
              v-if="isComparing"
              class="animate-spin -ml-1 mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Refresh Comparison
          </UiButton>
          <UiButton
            @click="handlePromoteSchema"
            :disabled="!canProceed || promotionSuccess"
            class="bg-red-600 hover:bg-red-700 text-white"
          >
            <svg
              v-if="isPromoting"
              class="animate-spin -ml-1 mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {{ isPromoting ? "Promoting..." : "Promote to Production" }}
          </UiButton>
        </div>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  useSchemaPromotion,
  type SchemaComparisonResult,
  type SchemaDifference,
} from "@/composables/useSchemaPromotion";
import { useConnectionsStore } from "@/stores/connections";
import type { Connection } from "@/types/connection";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  UploadCloud,
} from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  devConnection: Connection;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "promotion-success": [];
}>();

const connectionsStore = useConnectionsStore();
const { isPromoting, isComparing, compareSchemas, promoteSchema, restoreSchema } =
  useSchemaPromotion();

const comparisonResult = ref<SchemaComparisonResult | null>(null);
const promotionError = ref<string | null>(null);
const promotionSuccess = ref(false);
const backupSchema = ref<string | null>(null);
const rollbackError = ref<string | null>(null);
const rollbackSuccess = ref(false);

const prodConnection = computed(() => {
  if (!props.devConnection.linkedProductionId) return null;
  return connectionsStore.getLinkedProduction(props.devConnection.id);
});

const canProceed = computed(() => {
  return comparisonResult.value && prodConnection.value && !isPromoting.value;
});

// Group differences by type for better display
const groupedDifferences = computed(() => {
  if (!comparisonResult.value?.enhancedDifferences) return {};

  const groups: Record<string, { typeKind: string; changes: SchemaDifference[] }> = {};

  comparisonResult.value.enhancedDifferences.forEach(diff => {
    if (diff.context) {
      const key = `${diff.context.typeKind}_${diff.context.typeName}`;
      if (!groups[key]) {
        groups[key] = {
          typeKind: diff.context.typeKind,
          changes: []
        };
      }
      groups[key].changes.push(diff);
    }
  });

  // Convert to display format with type names as keys
  const result: Record<string, { typeKind: string; changes: SchemaDifference[] }> = {};
  Object.entries(groups).forEach(([key, group]) => {
    const typeName = key.split('_').slice(1).join('_'); // Remove typeKind prefix
    result[typeName] = group;
  });

  return result;
});

// Get differences without context (ungrouped)
const ungroupedDifferences = computed(() => {
  if (!comparisonResult.value?.enhancedDifferences) return [];

  return comparisonResult.value.enhancedDifferences.filter(diff => !diff.context);
});

// Total number of changes, for the summary line
const changeCount = computed(() => {
  const enhanced = comparisonResult.value?.enhancedDifferences
  if (enhanced) return enhanced.length
  return comparisonResult.value?.differences?.length ?? 0
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
      "Could not read one of the schemas. Check that both connections are reachable and try again.";
  }
};

// Execute schema promotion
const handlePromoteSchema = async () => {
  if (!prodConnection.value) return;

  promotionError.value = null;
  promotionSuccess.value = false;

  const result = await promoteSchema(props.devConnection, prodConnection.value);

  // Keep the captured production schema available so the user can download it
  // or roll back. The dialog stays open until the user closes it explicitly.
  backupSchema.value = result.backupSchema ?? null;

  if (result.success) {
    promotionSuccess.value = true;
    emit("promotion-success");
  } else {
    promotionError.value = result.error || "Schema promotion failed";
  }
};

const backupFileName = computed(() => {
  const name = (prodConnection.value?.name || "production")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${name || "production"}-schema-backup-${stamp}.graphql`;
});

// Download the pre-promotion production schema as a .graphql file
const handleDownloadBackup = () => {
  if (!backupSchema.value) return;

  const blob = new Blob([backupSchema.value], {
    type: "application/graphql;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName.value;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Restore the captured backup onto production
const handleRollback = async () => {
  if (!prodConnection.value || !backupSchema.value) return;

  rollbackError.value = null;
  rollbackSuccess.value = false;

  const result = await restoreSchema(prodConnection.value, backupSchema.value);

  if (result.success) {
    rollbackSuccess.value = true;
    emit("promotion-success");
  } else {
    rollbackError.value = result.error || "Schema rollback failed";
  }
};

// Reset state when dialog closes
const handleOpenChange = (open: boolean) => {
  if (!open) {
    comparisonResult.value = null;
    promotionError.value = null;
    promotionSuccess.value = false;
    backupSchema.value = null;
    rollbackError.value = null;
    rollbackSuccess.value = false;
  }
  emit("update:open", open);
};

// Auto-compare when dialog opens
const handleDialogOpen = () => {
  if (props.open && prodConnection.value) {
    handleCompareSchemas();
  }
};

// Watch for dialog opening. `immediate` matters for the callers that mount this
// component only once the dialog is already open (the dashboard), otherwise the
// first comparison would never run.
watch(
  () => props.open,
  (newValue) => {
    if (newValue) {
      handleDialogOpen();
    }
  },
  { immediate: true }
);
</script>

<template>
  <UiDialog :open="open" @update:open="handleOpenChange">
    <UiDialogContent class="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
      <UiDialogHeader class="border-b border-border px-5 py-4">
        <UiDialogTitle>Promote schema to production</UiDialogTitle>
        <UiDialogDescription>
          The schema on the development database replaces the one on production. The
          current production schema is captured first so you can roll back.
        </UiDialogDescription>
      </UiDialogHeader>

      <!-- Where this is going. The two endpoints stay visible the whole time. -->
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-danger-border bg-danger-subtle px-5 py-2.5"
      >
        <span class="font-mono text-[13px] text-foreground">{{ devConnection.name }}</span>
        <ArrowRight class="h-3.5 w-3.5 text-danger" />
        <span class="font-mono text-[13px] font-medium text-danger">
          {{ prodConnection?.name || "no linked production database" }}
        </span>
        <span v-if="prodConnection" class="truncate font-mono text-[11px] text-danger/80">
          {{ prodConnection.url }}
        </span>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <!-- Comparing -->
        <div
          v-if="isComparing"
          class="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground"
        >
          <Loader2 class="h-4 w-4 animate-spin" />
          Comparing the two schemas…
        </div>

        <!-- Error -->
        <div
          v-else-if="promotionError"
          class="flex items-start gap-2.5 rounded-md border border-danger-border bg-danger-subtle px-3 py-3"
        >
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-danger">Promotion did not run</p>
            <p class="mt-0.5 text-xs leading-5 text-foreground/80">{{ promotionError }}</p>
          </div>
        </div>

        <!-- Promoted -->
        <div v-else-if="promotionSuccess" class="space-y-4">
          <div
            class="flex items-start gap-2.5 rounded-md border border-success-border bg-success-subtle px-3 py-3"
          >
            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div class="min-w-0">
              <p class="text-[13px] font-medium text-success">
                {{ prodConnection?.name || "Production" }} is now running the development
                schema
              </p>
              <p class="mt-0.5 text-xs leading-5 text-foreground/80">
                Close this dialog when you are done — the backup below is only kept while
                it is open.
              </p>
            </div>
          </div>

          <section class="rounded-md border border-border">
            <div class="border-b border-border px-3 py-2.5">
              <h4 class="text-[13px] font-medium">Backup of the previous schema</h4>
              <p v-if="backupSchema" class="mt-0.5 text-xs text-muted-foreground">
                Captured before the write,
                <span class="font-mono">{{ backupSchema.length }}</span> characters.
              </p>
              <p v-else class="mt-0.5 text-xs text-muted-foreground">
                No previous production schema was captured, so there is nothing to roll
                back to.
              </p>
            </div>

            <div v-if="backupSchema" class="space-y-3 px-3 py-3">
              <div class="flex flex-wrap items-center gap-2">
                <UiButton variant="outline" size="sm" @click="handleDownloadBackup">
                  <Download class="h-3.5 w-3.5" />
                  Download .graphql
                </UiButton>
                <UiButton
                  variant="outline"
                  size="sm"
                  :disabled="isPromoting || rollbackSuccess"
                  @click="handleRollback"
                >
                  <RotateCcw class="h-3.5 w-3.5" :class="{ 'animate-spin': isPromoting }" />
                  {{ isPromoting ? "Restoring…" : "Restore this schema" }}
                </UiButton>
              </div>

              <p v-if="rollbackSuccess" class="text-xs leading-5 text-success">
                The previous production schema has been restored.
              </p>
              <p v-if="rollbackError" class="text-xs leading-5 text-danger">
                {{ rollbackError }}
              </p>

              <details class="group">
                <summary
                  class="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  View the backup
                </summary>
                <pre
                  class="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap"
                >{{ backupSchema }}</pre>
              </details>
            </div>
          </section>
        </div>

        <!-- Nothing compared yet -->
        <div v-else-if="!comparisonResult" class="py-10 text-center">
          <p class="text-[13px] font-medium">
            {{ prodConnection ? "No comparison yet" : "No linked production database" }}
          </p>
          <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            {{
              prodConnection
                ? "Compare the two schemas to see exactly what promoting would write to production."
                : "Edit this development connection and choose the production connection it should promote to."
            }}
          </p>
        </div>

        <!-- Comparison -->
        <div v-else class="space-y-4">
          <div
            v-if="!comparisonResult.hasDifferences"
            class="flex items-start gap-2.5 rounded-md border border-border bg-muted px-3 py-3"
          >
            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div>
              <p class="text-[13px] font-medium">The two schemas are identical</p>
              <p class="mt-0.5 text-xs leading-5 text-muted-foreground">
                Promoting would not change anything on production.
              </p>
            </div>
          </div>

          <template v-else>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h4 class="text-[13px] font-medium">
                {{ changeCount }} {{ changeCount === 1 ? "change" : "changes" }} will be
                written to production
              </h4>
              <p class="text-xs text-muted-foreground">
                Lines marked <span class="font-mono text-success">+</span> are added,
                <span class="font-mono text-danger">−</span> removed.
              </p>
            </div>

            <!-- Grouped by the type each change belongs to -->
            <div
              v-if="comparisonResult.enhancedDifferences"
              class="space-y-2 overflow-hidden"
            >
              <div
                v-for="(group, typeName) in groupedDifferences"
                :key="typeName"
                class="overflow-hidden rounded-md border border-border"
              >
                <div
                  class="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5"
                >
                  <StatusBadge tone="neutral" variant="outline" mono>
                    {{ group.typeKind }}
                  </StatusBadge>
                  <span class="truncate font-mono text-[13px] font-medium">
                    {{ typeName }}
                  </span>
                </div>

                <ul class="divide-y divide-border">
                  <li
                    v-for="(diff, index) in group.changes"
                    :key="index"
                    class="flex items-start gap-2 px-3 py-1.5 font-mono text-xs leading-5"
                    :class="diff.type === 'added' ? 'bg-success-subtle' : 'bg-danger-subtle'"
                  >
                    <span
                      class="shrink-0 font-medium"
                      :class="diff.type === 'added' ? 'text-success' : 'text-danger'"
                    >
                      {{ diff.type === 'added' ? '+' : '−' }}
                    </span>
                    <span
                      class="min-w-0 break-all"
                      :class="diff.type === 'added' ? 'text-success' : 'text-danger'"
                    >
                      {{ diff.line }}
                    </span>
                  </li>
                </ul>
              </div>

              <div
                v-if="ungroupedDifferences.length > 0"
                class="overflow-hidden rounded-md border border-border"
              >
                <div class="border-b border-border bg-muted px-3 py-1.5">
                  <span class="text-[13px] font-medium">Outside any type</span>
                </div>
                <ul class="divide-y divide-border">
                  <li
                    v-for="(diff, index) in ungroupedDifferences"
                    :key="index"
                    class="flex items-start gap-2 px-3 py-1.5 font-mono text-xs leading-5"
                    :class="diff.type === 'added' ? 'bg-success-subtle' : 'bg-danger-subtle'"
                  >
                    <span
                      class="shrink-0 font-medium"
                      :class="diff.type === 'added' ? 'text-success' : 'text-danger'"
                    >
                      {{ diff.type === 'added' ? '+' : '−' }}
                    </span>
                    <span
                      class="min-w-0 break-all"
                      :class="diff.type === 'added' ? 'text-success' : 'text-danger'"
                    >
                      {{ diff.line }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Fallback when the parser could not attribute changes to types -->
            <div
              v-else-if="comparisonResult.differences"
              class="overflow-hidden rounded-md border border-border"
            >
              <div class="border-b border-border bg-muted px-3 py-1.5">
                <span class="text-[13px] font-medium">Changes</span>
              </div>
              <ul class="max-h-56 divide-y divide-border overflow-auto">
                <li
                  v-for="(diff, index) in comparisonResult.differences"
                  :key="index"
                  class="px-3 py-1.5 font-mono text-xs leading-5 break-all"
                  :class="{
                    'bg-success-subtle text-success': diff.startsWith('+'),
                    'bg-danger-subtle text-danger': diff.startsWith('-'),
                  }"
                >
                  {{ diff }}
                </li>
              </ul>
            </div>

            <!-- The two schemas, side by side -->
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="min-w-0 overflow-hidden rounded-md border border-border">
                <div class="border-b border-border bg-muted px-3 py-1.5">
                  <span class="font-mono text-[11px] text-muted-foreground">
                    {{ devConnection.name }}
                  </span>
                </div>
                <pre
                  class="max-h-44 overflow-auto px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap"
                >{{ comparisonResult.devSchema || "No schema" }}</pre>
              </div>

              <div class="min-w-0 overflow-hidden rounded-md border border-border">
                <div class="border-b border-border bg-muted px-3 py-1.5">
                  <span class="font-mono text-[11px] text-muted-foreground">
                    {{ prodConnection?.name || "production" }} (current)
                  </span>
                </div>
                <pre
                  class="max-h-44 overflow-auto px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap"
                >{{ comparisonResult.prodSchema || "No schema" }}</pre>
              </div>
            </div>
          </template>
        </div>
      </div>

      <UiDialogFooter class="border-t border-border px-5 py-3 sm:justify-between">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="isPromoting"
          @click="handleOpenChange(false)"
        >
          {{ promotionSuccess ? "Close" : "Cancel" }}
        </UiButton>

        <div v-if="!promotionSuccess" class="flex gap-2">
          <UiButton
            variant="outline"
            size="sm"
            :disabled="isComparing || isPromoting"
            @click="handleCompareSchemas"
          >
            <Loader2 v-if="isComparing" class="h-3.5 w-3.5 animate-spin" />
            Compare again
          </UiButton>

          <UiButton
            variant="destructive"
            size="sm"
            :disabled="!canProceed || promotionSuccess"
            @click="handlePromoteSchema"
          >
            <Loader2 v-if="isPromoting" class="h-3.5 w-3.5 animate-spin" />
            <UploadCloud v-else class="h-3.5 w-3.5" />
            {{ isPromoting ? "Promoting…" : `Promote to ${prodConnection?.name || "production"}` }}
          </UiButton>
        </div>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>

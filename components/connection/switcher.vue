<script setup lang="ts">
import { computed, ref } from "vue";
import { useConnectionsStore } from "@/stores/connections";
import { useDgraphClient } from "@/composables/useDgraphClient";
import { useSchemaPromotion } from "@/composables/useSchemaPromotion";
import { useToast } from "@/components/ui/toast";
import { connectionTone, connectionStatusLabel } from "@/components/status";
import SchemaPromotionDialog from "./schema-promotion-dialog.vue";
import { Link2, UploadCloud } from "lucide-vue-next";

defineEmits<{
  "open-selector": [];
}>();

const connectionsStore = useConnectionsStore();
const dgraphClient = useDgraphClient();
const { canPromote } = useSchemaPromotion();
const toast = useToast();

const showPromotionDialog = ref(false);

const connections = computed(() => connectionsStore.connections);
const activeConnection = computed(() => connectionsStore.activeConnection);
const activeConnectionState = computed(
  () => connectionsStore.activeConnectionState
);

const selectedConnectionId = computed({
  get: () => connectionsStore.activeConnectionId,
  set: (id: string | null) => {
    if (id) {
      connectionsStore.setActiveConnection(id);
      dgraphClient.initializeClient();
    }
  },
});

const openPromotionDialog = () => {
  showPromotionDialog.value = true;
};

const handlePromotionSuccess = () => {
  toast.success(
    "Schema promoted to production",
    activeConnection.value
      ? `${activeConnection.value.name} is now the schema on its linked production database.`
      : undefined
  );
};

const linkedName = (id: string) =>
  connectionsStore.getLinkedProduction(id)?.name || "an unknown connection";
</script>

<template>
  <div class="relative flex flex-col gap-2">
    <!-- Custom dropdown slot (if provided) -->
    <div v-if="$slots.dropdown">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
        :class="activeConnection ? 'border-input' : 'border-dashed border-border-strong'"
        @click="$emit('open-selector')"
      >
        <template v-if="activeConnection">
          <StatusDot
            :tone="connectionTone(activeConnectionState ?? undefined)"
            :label="connectionStatusLabel(activeConnectionState ?? undefined)"
          />
          <span class="min-w-0 flex-1 truncate font-mono">{{ activeConnection.name }}</span>
          <StatusBadge
            v-if="activeConnection.environment === 'Production'"
            tone="warning"
            variant="outline"
          >
            Production
          </StatusBadge>
          <Link2
            v-else-if="activeConnection.linkedProductionId"
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            :title="`Promotes to ${linkedName(activeConnection.id)}`"
          />
        </template>
        <span v-else class="text-muted-foreground">Select a connection</span>
      </button>

      <div
        v-if="connections.length > 0"
        class="absolute left-0 right-0 top-full z-10 mt-1"
      >
        <div class="overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <slot name="dropdown" />
        </div>
      </div>
    </div>

    <!-- Default Select implementation -->
    <UiSelect
      v-else
      v-model="selectedConnectionId"
      :disabled="connections.length === 0"
    >
      <UiSelectTrigger
        class="w-full"
        :class="activeConnection ? '' : 'border-dashed border-border-strong'"
        :aria-label="
          activeConnection
            ? `Active connection: ${activeConnection.name}`
            : 'Select a connection'
        "
      >
        <UiSelectValue>
          <span v-if="activeConnection" class="flex min-w-0 items-center gap-1.5">
            <StatusDot
              :tone="connectionTone(activeConnectionState ?? undefined)"
              :label="connectionStatusLabel(activeConnectionState ?? undefined)"
            />
            <span class="min-w-0 flex-1 truncate font-mono">{{ activeConnection.name }}</span>
            <StatusBadge
              v-if="activeConnection.environment === 'Production'"
              tone="warning"
              variant="outline"
            >
              Prod
            </StatusBadge>
            <Link2
              v-else-if="activeConnection.linkedProductionId"
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
          </span>
          <span v-else class="text-muted-foreground">
            {{ connections.length === 0 ? "No connections yet" : "Select a connection" }}
          </span>
        </UiSelectValue>
      </UiSelectTrigger>

      <UiSelectContent>
        <UiSelectItem
          v-for="connection in connections"
          :key="connection.id"
          :value="connection.id"
        >
          <span class="flex w-full min-w-0 flex-col gap-0.5">
            <span class="flex min-w-0 items-center gap-1.5">
              <StatusDot
                :tone="connectionTone(connectionsStore.connectionStates[connection.id])"
                :label="connectionStatusLabel(connectionsStore.connectionStates[connection.id])"
              />
              <span class="min-w-0 flex-1 truncate font-mono">{{ connection.name }}</span>
              <StatusBadge
                v-if="connection.environment === 'Production'"
                tone="warning"
                variant="outline"
              >
                Prod
              </StatusBadge>
              <Link2
                v-else-if="connection.linkedProductionId"
                class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                :title="`Promotes to ${linkedName(connection.id)}`"
              />
            </span>
            <span class="truncate pl-3 font-mono text-[11px] text-muted-foreground">
              {{ connection.url }}
            </span>
          </span>
        </UiSelectItem>
      </UiSelectContent>
    </UiSelect>

    <UiButton
      v-if="activeConnection && canPromote(activeConnection)"
      variant="outline"
      size="sm"
      class="w-full"
      @click="openPromotionDialog"
    >
      <UploadCloud class="h-3.5 w-3.5" />
      Promote to production
    </UiButton>

    <SchemaPromotionDialog
      v-if="activeConnection"
      v-model:open="showPromotionDialog"
      :dev-connection="activeConnection"
      @promotion-success="handlePromotionSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { useDgraphClient } from '@/composables/useDgraphClient'
import type { Connection, ConnectionType, ConnectionCredentials } from '@/types/connection'

const props = defineProps<{
  connection?: Connection
}>()

const emit = defineEmits<{
  'saved': [connectionId: string]
  'cancelled': []
}>()

const connectionsStore = useConnectionsStore()
const credentialStorage = useCredentialStorage()
const dgraphClient = useDgraphClient()

const isLoading = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

// Form state
const formState = reactive({
  name: props.connection?.name || '',
  type: props.connection?.type || 'http' as ConnectionType,
  url: props.connection?.url || '',
  isSecure: props.connection?.isSecure || false,
  useUnifiedAuth: props.connection?.credentials.useUnifiedAuth ?? true,
  credentials: {
    graphql: {
      username: props.connection?.credentials.graphql?.username || '',
      password: props.connection?.credentials.graphql?.password || '',
      apiKey: props.connection?.credentials.graphql?.apiKey || '',
      token: props.connection?.credentials.graphql?.token || '',
      authToken: props.connection?.credentials.graphql?.authToken || ''
    },
    admin: {
      username: props.connection?.credentials.admin?.username || '',
      password: props.connection?.credentials.admin?.password || '',
      apiKey: props.connection?.credentials.admin?.apiKey || '',
      token: props.connection?.credentials.admin?.token || '',
      authToken: props.connection?.credentials.admin?.authToken || ''
    },
    useUnifiedAuth: props.connection?.credentials.useUnifiedAuth ?? true
  }
})

// Validation
const errors = reactive({
  name: '',
  url: ''
})

const validate = () => {
  let isValid = true
  
  // Reset errors
  errors.name = ''
  errors.url = ''
  
  // Validate name
  if (!formState.name.trim()) {
    errors.name = 'Connection name is required'
    isValid = false
  }
  
  // Validate URL
  if (!formState.url.trim()) {
    errors.url = 'URL is required'
    isValid = false
  } else {
    try {
      new URL(formState.url)
    } catch (e) {
      errors.url = 'Invalid URL format'
      isValid = false
    }
  }
  
  return isValid
}

// Test connection
const testConnection = async () => {
  if (!validate()) return
  
  isLoading.value = true
  testResult.value = null
  
  try {
    const tempConnection: Connection = {
      id: props.connection?.id || 'temp-id',
      name: formState.name,
      type: formState.type,
      url: formState.url,
      credentials: {
        graphql: formState.credentials.graphql,
        admin: formState.useUnifiedAuth ? formState.credentials.graphql : formState.credentials.admin,
        useUnifiedAuth: formState.useUnifiedAuth
      },
      isSecure: formState.isSecure,
      createdAt: props.connection?.createdAt || new Date(),
      updatedAt: new Date()
    }
    
    const isConnected = await dgraphClient.testConnection(tempConnection)
    
    testResult.value = {
      success: isConnected,
      message: isConnected ? 'Connection successful!' : 'Connection failed. Please check your settings.'
    }
  } catch (error) {
    testResult.value = {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    isLoading.value = false
  }
}

// Save connection
const saveConnection = async () => {
  if (!validate()) return
  
  isLoading.value = true
  
  try {
    let connectionId: string
    
    // Prepare credentials based on unified auth setting
    const credentials = {
      graphql: formState.credentials.graphql,
      admin: formState.useUnifiedAuth ? formState.credentials.graphql : formState.credentials.admin,
      useUnifiedAuth: formState.useUnifiedAuth
    }
    
    // Create or update connection
    if (props.connection) {
      // Update existing connection
      connectionsStore.updateConnection(props.connection.id, {
        name: formState.name,
        type: formState.type,
        url: formState.url,
        isSecure: formState.isSecure
      })
      connectionId = props.connection.id
    } else {
      // Create new connection
      connectionId = connectionsStore.addConnection({
        name: formState.name,
        type: formState.type,
        url: formState.url,
        credentials: { 
          graphql: {},
          admin: {},
          useUnifiedAuth: formState.useUnifiedAuth
        }, // Empty credentials in the store
        isSecure: formState.isSecure
      })
    }
    
    // Save credentials separately
    if (formState.isSecure) {
      credentialStorage.saveCredentials(connectionId, credentials)
    }
    
    emit('saved', connectionId)
  } catch (error) {
    console.error('Failed to save connection:', error)
    testResult.value = {
      success: false,
      message: `Error saving connection: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    isLoading.value = false
  }
}

// Cancel form
const cancelForm = () => {
  emit('cancelled')
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <label for="name" class="text-sm font-medium">Connection Name</label>
      <UiInput 
        id="name" 
        v-model="formState.name" 
        placeholder="My Dgraph Instance" 
        :class="errors.name ? 'border-destructive' : ''"
      />
      <p v-if="errors.name" class="text-sm text-destructive">{{ errors.name }}</p>
    </div>
    
    <div class="space-y-2">
      <label for="url" class="text-sm font-medium">URL</label>
      <UiInput 
        id="url" 
        v-model="formState.url" 
        placeholder="https://your-dgraph-instance.com" 
        :class="errors.url ? 'border-destructive' : ''"
      />
      <p v-if="errors.url" class="text-sm text-destructive">{{ errors.url }}</p>
    </div>
    
    <div class="space-y-2">
      <label for="type" class="text-sm font-medium">Connection Type</label>
      <select 
        id="type" 
        v-model="formState.type"
        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="http">HTTP</option>
        <option value="grpc">gRPC</option>
      </select>
    </div>
    
    <div class="space-y-2">
      <div class="flex items-center space-x-2">
        <input 
          id="isSecure" 
          type="checkbox" 
          v-model="formState.isSecure"
          class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label for="isSecure" class="text-sm font-medium">Requires Authentication</label>
      </div>
    </div>
    
    <div v-if="formState.isSecure" class="space-y-4 border rounded-md p-4">
      <div class="flex items-center space-x-2 mb-4">
        <input 
          id="useUnifiedAuth" 
          type="checkbox" 
          v-model="formState.useUnifiedAuth"
          class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label for="useUnifiedAuth" class="text-sm font-medium">Use same authentication for both GraphQL and Admin endpoints</label>
      </div>
      
      <!-- GraphQL Authentication -->
      <div class="border-b pb-4 mb-4">
        <h3 class="text-sm font-medium mb-4">GraphQL Endpoint Authentication</h3>
        
        <div class="space-y-2">
          <label for="graphql-username" class="text-sm font-medium">Username</label>
          <UiInput 
            id="graphql-username" 
            v-model="formState.credentials.graphql.username" 
            placeholder="Username"
          />
        </div>
        
        <div class="space-y-2">
          <label for="graphql-password" class="text-sm font-medium">Password</label>
          <UiInput 
            id="graphql-password" 
            type="password" 
            v-model="formState.credentials.graphql.password" 
            placeholder="Password"
          />
        </div>
        
        <div class="space-y-2">
          <label for="graphql-apiKey" class="text-sm font-medium">API Key</label>
          <UiInput 
            id="graphql-apiKey" 
            v-model="formState.credentials.graphql.apiKey" 
            placeholder="API Key"
          />
        </div>
        
        <div class="space-y-2">
          <label for="graphql-token" class="text-sm font-medium">Access Token</label>
          <UiInput 
            id="graphql-token" 
            v-model="formState.credentials.graphql.token" 
            placeholder="Access Token"
          />
        </div>
        
        <div class="space-y-2">
          <label for="graphql-authToken" class="text-sm font-medium">Auth Token (X-Dgraph-AuthToken)</label>
          <UiInput 
            id="graphql-authToken" 
            v-model="formState.credentials.graphql.authToken" 
            placeholder="Auth Token"
          />
        </div>
      </div>
      
      <!-- Admin Authentication (only shown when not using unified auth) -->
      <div v-if="!formState.useUnifiedAuth">
        <h3 class="text-sm font-medium mb-4">Admin Endpoint Authentication</h3>
        
        <div class="space-y-2">
          <label for="admin-username" class="text-sm font-medium">Username</label>
          <UiInput 
            id="admin-username" 
            v-model="formState.credentials.admin.username" 
            placeholder="Username"
          />
        </div>
        
        <div class="space-y-2">
          <label for="admin-password" class="text-sm font-medium">Password</label>
          <UiInput 
            id="admin-password" 
            type="password" 
            v-model="formState.credentials.admin.password" 
            placeholder="Password"
          />
        </div>
        
        <div class="space-y-2">
          <label for="admin-apiKey" class="text-sm font-medium">API Key</label>
          <UiInput 
            id="admin-apiKey" 
            v-model="formState.credentials.admin.apiKey" 
            placeholder="API Key"
          />
        </div>
        
        <div class="space-y-2">
          <label for="admin-token" class="text-sm font-medium">Access Token</label>
          <UiInput 
            id="admin-token" 
            v-model="formState.credentials.admin.token" 
            placeholder="Access Token"
          />
        </div>
        
        <div class="space-y-2">
          <label for="admin-authToken" class="text-sm font-medium">Auth Token (X-Dgraph-AuthToken)</label>
          <UiInput 
            id="admin-authToken" 
            v-model="formState.credentials.admin.authToken" 
            placeholder="Auth Token"
          />
        </div>
      </div>
      
      <p class="text-xs text-muted-foreground mt-4">
        Note: For each endpoint, provide either username/password, API key, access token, or auth token based on your Dgraph instance's authentication method.
      </p>
    </div>
    
    <div v-if="testResult" class="p-4 rounded-md" :class="testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'">
      {{ testResult.message }}
    </div>
    
    <div class="flex justify-end space-x-2">
      <UiButton 
        variant="outline" 
        @click="cancelForm" 
        :disabled="isLoading"
      >
        Cancel
      </UiButton>
      
      <UiButton 
        variant="outline" 
        @click="testConnection" 
        :disabled="isLoading"
      >
        Test Connection
      </UiButton>
      
      <UiButton 
        @click="saveConnection" 
        :disabled="isLoading"
      >
        {{ props.connection ? 'Update' : 'Save' }} Connection
      </UiButton>
    </div>
  </div>
</template>

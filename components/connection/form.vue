<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { useDgraphClient } from '@/composables/useDgraphClient'
import type { Connection, ConnectionType, ConnectionCredentials, AuthMethod } from '@/types/connection'

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
  credentials: {
    authMethod: props.connection?.credentials.authMethod || 'basic' as AuthMethod,
    username: props.connection?.credentials.username || '',
    password: props.connection?.credentials.password || '',
    apiKey: props.connection?.credentials.apiKey || '',
    token: props.connection?.credentials.token || '',
    authToken: props.connection?.credentials.authToken || '',
    xAuthToken: props.connection?.credentials.xAuthToken || '',
    jwt: props.connection?.credentials.jwt || '',
    jwtHeader: props.connection?.credentials.jwtHeader || ''
  }
})

// Validation
const errors = reactive({
  name: '',
  url: ''
})

// Authentication method descriptions
const authMethodDescriptions = {
  basic: 'Basic Authentication (username/password)',
  apiKey: 'API Key (X-Dgraph-ApiKey)',
  accessToken: 'Access Token (Authorization: Bearer)',
  authToken: 'Auth Token (X-Dgraph-AuthToken) - Used when ACL is enabled',
  xAuthToken: 'X-Auth-Token - Used when anonymous access is disabled',
  jwt: 'JWT - Used with Dgraph.Authorization'
}

// Show fields based on selected auth method
const showBasicAuth = computed(() => formState.credentials.authMethod === 'basic')
const showApiKey = computed(() => formState.credentials.authMethod === 'apiKey')
const showAccessToken = computed(() => formState.credentials.authMethod === 'accessToken')
const showAuthToken = computed(() => formState.credentials.authMethod === 'authToken')
const showXAuthToken = computed(() => formState.credentials.authMethod === 'xAuthToken')
const showJwt = computed(() => formState.credentials.authMethod === 'jwt')

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
      credentials: formState.credentials,
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
        credentials: { }, // Empty credentials in the store
        isSecure: formState.isSecure
      })
    }
    
    // Save credentials separately
    if (formState.isSecure) {
      credentialStorage.saveCredentials(connectionId, formState.credentials)
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

// Reset auth fields when auth method changes
watch(() => formState.credentials.authMethod, () => {
  // Clear all auth fields
  formState.credentials.username = ''
  formState.credentials.password = ''
  formState.credentials.apiKey = ''
  formState.credentials.token = ''
  formState.credentials.authToken = ''
  formState.credentials.xAuthToken = ''
  formState.credentials.jwt = ''
  formState.credentials.jwtHeader = ''
})
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
      <h3 class="text-sm font-medium">Authentication</h3>
      
      <!-- Authentication Method Selector -->
      <div class="space-y-2">
        <label for="authMethod" class="text-sm font-medium">Authentication Method</label>
        <select 
          id="authMethod" 
          v-model="formState.credentials.authMethod"
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option v-for="(description, method) in authMethodDescriptions" :key="method" :value="method">
            {{ description }}
          </option>
        </select>
      </div>
      
      <!-- Basic Auth (Username/Password) -->
      <div v-if="showBasicAuth" class="space-y-4">
        <div class="space-y-2">
          <label for="username" class="text-sm font-medium">Username</label>
          <UiInput 
            id="username" 
            v-model="formState.credentials.username" 
            placeholder="Username"
          />
        </div>
        
        <div class="space-y-2">
          <label for="password" class="text-sm font-medium">Password</label>
          <UiInput 
            id="password" 
            type="password" 
            v-model="formState.credentials.password" 
            placeholder="Password"
          />
        </div>
      </div>
      
      <!-- API Key (X-Dgraph-ApiKey) -->
      <div v-if="showApiKey" class="space-y-2">
        <label for="apiKey" class="text-sm font-medium">API Key (X-Dgraph-ApiKey)</label>
        <UiInput 
          id="apiKey" 
          v-model="formState.credentials.apiKey" 
          placeholder="API Key"
        />
      </div>
      
      <!-- Access Token (Authorization: Bearer) -->
      <div v-if="showAccessToken" class="space-y-2">
        <label for="token" class="text-sm font-medium">Access Token (Authorization: Bearer)</label>
        <UiInput 
          id="token" 
          v-model="formState.credentials.token" 
          placeholder="Access Token"
        />
      </div>
      
      <!-- Auth Token (X-Dgraph-AuthToken) -->
      <div v-if="showAuthToken" class="space-y-2">
        <label for="authToken" class="text-sm font-medium">Auth Token (X-Dgraph-AuthToken)</label>
        <UiInput 
          id="authToken" 
          v-model="formState.credentials.authToken" 
          placeholder="Auth Token"
        />
        <p class="text-xs text-muted-foreground">
          Used when ACL is enabled. Pass the access token you got in the login response.
        </p>
      </div>
      
      <!-- X-Auth-Token -->
      <div v-if="showXAuthToken" class="space-y-2">
        <label for="xAuthToken" class="text-sm font-medium">X-Auth-Token</label>
        <UiInput 
          id="xAuthToken" 
          v-model="formState.credentials.xAuthToken" 
          placeholder="Admin Key or Client Key"
        />
        <p class="text-xs text-muted-foreground">
          Used when anonymous access is disabled. Provide an Admin Key or Client Key.
        </p>
      </div>
      
      <!-- JWT -->
      <div v-if="showJwt" class="space-y-4">
        <div class="space-y-2">
          <label for="jwt" class="text-sm font-medium">JWT Token</label>
          <UiInput 
            id="jwt" 
            v-model="formState.credentials.jwt" 
            placeholder="JWT Token"
          />
        </div>
        
        <div class="space-y-2">
          <label for="jwtHeader" class="text-sm font-medium">JWT Header Name (Optional)</label>
          <UiInput 
            id="jwtHeader" 
            v-model="formState.credentials.jwtHeader" 
            placeholder="Authorization"
          />
          <p class="text-xs text-muted-foreground">
            Custom header name for JWT as set in Dgraph.Authorization. Defaults to "Authorization" if not specified.
          </p>
        </div>
      </div>
      
      <p class="text-xs text-muted-foreground">
        Note: Select the authentication method that matches your Dgraph instance's configuration.
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


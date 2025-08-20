<script setup lang="ts">
import { ref } from 'vue'
import { useCodeMirror } from '@/composables/useCodeMirror'

const editorElement = ref<HTMLElement | null>(null)
const initialValue = `type Person {
  id: ID!
  name: String!
  age: Int
}

type Query {
  getPerson(id: ID!): Person
}`

// Initialize CodeMirror
useCodeMirror(editorElement, initialValue, {
  onChange: (value) => {
    console.log('Content changed:', value)
  }
})
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">CodeMirror Test</h1>
    <div class="border rounded-md overflow-hidden h-[400px]">
      <div ref="editorElement" class="w-full h-full"></div>
    </div>
  </div>
</template>

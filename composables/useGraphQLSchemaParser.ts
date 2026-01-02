import { ref, computed, watch, type Ref } from 'vue'
import { parse, visit, type DocumentNode, type TypeDefinitionNode, type FieldDefinitionNode, type Location } from 'graphql'

export type TypeDefinition = {
  name: string
  kind: string
  description?: string
  location: {
    start: number
    end: number
    line: number
    column: number
  }
  fields?: Array<{
    name: string
    type: string
    description?: string
    location: {
      start: number
      end: number
      line: number
      column: number
    }
  }>
}

export type TypeReference = {
  name: string
  location: {
    start: number
    end: number
    line: number
    column: number
  }
}

export function useGraphQLSchemaParser(schemaText: Ref<string>) {
  const typeDefinitions = ref<Map<string, TypeDefinition>>(new Map())
  const typeReferences = ref<TypeReference[]>([])
  const parseError = ref<string | null>(null)

  // Helper function to convert GraphQL location to line/column
  const getLocationInfo = (location: Location | undefined, source: string) => {
    if (!location) {
      return { start: 0, end: 0, line: 1, column: 1 }
    }

    const lines = source.substring(0, location.start).split('\n')
    const line = lines.length
    const column = lines[lines.length - 1].length + 1

    return {
      start: location.start,
      end: location.end,
      line,
      column
    }
  }

  // Helper function to extract type name from type node
  const extractTypeName = (typeNode: any): string => {
    if (typeNode.kind === 'NamedType') {
      return typeNode.name.value
    }
    if (typeNode.kind === 'ListType') {
      return extractTypeName(typeNode.type)
    }
    if (typeNode.kind === 'NonNullType') {
      return extractTypeName(typeNode.type)
    }
    return 'Unknown'
  }

  // Helper function to format type string
  const formatTypeString = (typeNode: any): string => {
    if (typeNode.kind === 'NamedType') {
      return typeNode.name.value
    }
    if (typeNode.kind === 'ListType') {
      return `[${formatTypeString(typeNode.type)}]`
    }
    if (typeNode.kind === 'NonNullType') {
      return `${formatTypeString(typeNode.type)}!`
    }
    return 'Unknown'
  }

  // Parse the schema and extract type definitions and references
  const parseSchema = () => {
    if (!schemaText.value.trim()) {
      typeDefinitions.value.clear()
      typeReferences.value = []
      parseError.value = null
      return
    }

    try {
      const ast: DocumentNode = parse(schemaText.value)
      const newTypeDefinitions = new Map<string, TypeDefinition>()
      const newTypeReferences: TypeReference[] = []

      visit(ast, {
        ObjectTypeDefinition(node) {
          const location = getLocationInfo(node.loc, schemaText.value)
          const typeDef: TypeDefinition = {
            name: node.name.value,
            kind: 'ObjectType',
            description: node.description?.value,
            location,
            fields: []
          }

          // Extract fields
          if (node.fields) {
            for (const field of node.fields) {
              const fieldLocation = getLocationInfo(field.loc, schemaText.value)
              const fieldTypeName = extractTypeName(field.type)
              
              typeDef.fields!.push({
                name: field.name.value,
                type: formatTypeString(field.type),
                description: field.description?.value,
                location: fieldLocation
              })

              // Add type reference for field type
              if (!isBuiltInType(fieldTypeName)) {
                newTypeReferences.push({
                  name: fieldTypeName,
                  location: fieldLocation
                })
              }
            }
          }

          newTypeDefinitions.set(node.name.value, typeDef)
        },

        InterfaceTypeDefinition(node) {
          const location = getLocationInfo(node.loc, schemaText.value)
          const typeDef: TypeDefinition = {
            name: node.name.value,
            kind: 'Interface',
            description: node.description?.value,
            location,
            fields: []
          }

          // Extract fields
          if (node.fields) {
            for (const field of node.fields) {
              const fieldLocation = getLocationInfo(field.loc, schemaText.value)
              const fieldTypeName = extractTypeName(field.type)
              
              typeDef.fields!.push({
                name: field.name.value,
                type: formatTypeString(field.type),
                description: field.description?.value,
                location: fieldLocation
              })

              // Add type reference for field type
              if (!isBuiltInType(fieldTypeName)) {
                newTypeReferences.push({
                  name: fieldTypeName,
                  location: fieldLocation
                })
              }
            }
          }

          newTypeDefinitions.set(node.name.value, typeDef)
        },

        EnumTypeDefinition(node) {
          const location = getLocationInfo(node.loc, schemaText.value)
          const typeDef: TypeDefinition = {
            name: node.name.value,
            kind: 'Enum',
            description: node.description?.value,
            location,
            fields: []
          }

          // Extract enum values as "fields"
          if (node.values) {
            for (const value of node.values) {
              const valueLocation = getLocationInfo(value.loc, schemaText.value)
              typeDef.fields!.push({
                name: value.name.value,
                type: 'EnumValue',
                description: value.description?.value,
                location: valueLocation
              })
            }
          }

          newTypeDefinitions.set(node.name.value, typeDef)
        },

        UnionTypeDefinition(node) {
          const location = getLocationInfo(node.loc, schemaText.value)
          const typeDef: TypeDefinition = {
            name: node.name.value,
            kind: 'Union',
            description: node.description?.value,
            location
          }

          // Add type references for union members
          if (node.types) {
            for (const type of node.types) {
              const typeLocation = getLocationInfo(type.loc, schemaText.value)
              newTypeReferences.push({
                name: type.name.value,
                location: typeLocation
              })
            }
          }

          newTypeDefinitions.set(node.name.value, typeDef)
        },

        InputObjectTypeDefinition(node) {
          const location = getLocationInfo(node.loc, schemaText.value)
          const typeDef: TypeDefinition = {
            name: node.name.value,
            kind: 'Input',
            description: node.description?.value,
            location,
            fields: []
          }

          // Extract input fields
          if (node.fields) {
            for (const field of node.fields) {
              const fieldLocation = getLocationInfo(field.loc, schemaText.value)
              const fieldTypeName = extractTypeName(field.type)
              
              typeDef.fields!.push({
                name: field.name.value,
                type: formatTypeString(field.type),
                description: field.description?.value,
                location: fieldLocation
              })

              // Add type reference for field type
              if (!isBuiltInType(fieldTypeName)) {
                newTypeReferences.push({
                  name: fieldTypeName,
                  location: fieldLocation
                })
              }
            }
          }

          newTypeDefinitions.set(node.name.value, typeDef)
        },

        ScalarTypeDefinition(node) {
          const location = getLocationInfo(node.loc, schemaText.value)
          const typeDef: TypeDefinition = {
            name: node.name.value,
            kind: 'Scalar',
            description: node.description?.value,
            location
          }

          newTypeDefinitions.set(node.name.value, typeDef)
        }
      })

      typeDefinitions.value = newTypeDefinitions
      typeReferences.value = newTypeReferences
      parseError.value = null
    } catch (error) {
      parseError.value = error instanceof Error ? error.message : 'Failed to parse schema'
      typeDefinitions.value.clear()
      typeReferences.value = []
    }
  }

  // Check if a type is a built-in GraphQL type
  const isBuiltInType = (typeName: string): boolean => {
    const builtInTypes = new Set([
      'String', 'Int', 'Float', 'Boolean', 'ID',
      'Query', 'Mutation', 'Subscription'
    ])
    return builtInTypes.has(typeName)
  }

  // Find type definition by name
  const findTypeDefinition = (typeName: string): TypeDefinition | undefined => {
    return typeDefinitions.value.get(typeName)
  }

  // Find type at position
  const findTypeAtPosition = (position: number): TypeReference | undefined => {
    return typeReferences.value.find(ref => 
      position >= ref.location.start && position <= ref.location.end
    )
  }

  // Get all type names
  const allTypeNames = computed(() => {
    return Array.from(typeDefinitions.value.keys())
  })

  // Watch for schema changes and reparse
  watch(schemaText, parseSchema, { immediate: true })

  return {
    typeDefinitions: computed(() => typeDefinitions.value),
    typeReferences: computed(() => typeReferences.value),
    parseError: computed(() => parseError.value),
    allTypeNames,
    findTypeDefinition,
    findTypeAtPosition,
    parseSchema
  }
}

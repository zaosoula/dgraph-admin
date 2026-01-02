import { EditorView, Decoration, DecorationSet } from '@codemirror/view'
import { StateField, StateEffect, EditorState } from '@codemirror/state'
import { type TypeDefinition } from '../useGraphQLSchemaParser'

// Effect to update hover state
const setHoverEffect = StateEffect.define<{ from: number; to: number } | null>()

// State field to track hover decorations
const hoverState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes)
    
    for (const effect of tr.effects) {
      if (effect.is(setHoverEffect)) {
        decorations = Decoration.none
        if (effect.value) {
          const decoration = Decoration.mark({
            class: 'graphql-type-hover'
          }).range(effect.value.from, effect.value.to)
          decorations = Decoration.set([decoration])
        }
      }
    }
    
    return decorations
  },
  provide: f => EditorView.decorations.from(f)
})

export function createGraphQLNavigationExtension(
  findTypeDefinition: (typeName: string) => TypeDefinition | undefined,
  findTypeAtPosition: (position: number) => { name: string; location: any } | undefined
) {
  return [
    hoverState,
    highlightState,
    EditorView.domEventHandlers({
      mousemove(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false

        // Check if Ctrl/Cmd key is pressed
        const isCtrlPressed = event.ctrlKey || event.metaKey

        if (isCtrlPressed) {
          const word = view.state.wordAt(pos)
          if (word) {
            const typeRef = findTypeAtPosition(pos)
            if (typeRef && findTypeDefinition(typeRef.name)) {
              // Show hover decoration
              view.dispatch({
                effects: setHoverEffect.of({ from: word.from, to: word.to })
              })
              
              // Change cursor to pointer
              view.dom.style.cursor = 'pointer'
              return true
            }
          }
        }

        // Clear hover decoration and reset cursor
        view.dispatch({
          effects: setHoverEffect.of(null)
        })
        view.dom.style.cursor = ''
        return false
      },

      mouseleave(event, view) {
        // Clear hover decoration when mouse leaves
        view.dispatch({
          effects: setHoverEffect.of(null)
        })
        view.dom.style.cursor = ''
        return false
      },

      click(event, view) {
        // Check if Ctrl/Cmd key is pressed
        const isCtrlPressed = event.ctrlKey || event.metaKey
        if (!isCtrlPressed) return false

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false

        const word = view.state.wordAt(pos)
        if (!word) return false

        const typeRef = findTypeAtPosition(pos)
        if (!typeRef) return false

        const typeDef = findTypeDefinition(typeRef.name)
        if (!typeDef) return false

        // Navigate to the type definition
        navigateToDefinition(view, typeDef)
        
        // Prevent default click behavior
        event.preventDefault()
        return true
      }
    }),
    
    // Add CSS for hover decoration and highlight animation
    EditorView.theme({
      '.graphql-type-hover': {
        textDecoration: 'underline',
        textDecorationColor: '#3b82f6',
        textDecorationThickness: '2px',
        textUnderlineOffset: '2px'
      },
      '.graphql-definition-highlight': {
        backgroundColor: '#fef3c7',
        borderRadius: '2px',
        animation: 'graphql-highlight-fade 2s ease-out'
      }
    })
  ]
}

// Effect to add/remove highlight
const setHighlightEffect = StateEffect.define<{ from: number; to: number } | null>()

// State field to track highlight decorations
const highlightState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes)
    
    for (const effect of tr.effects) {
      if (effect.is(setHighlightEffect)) {
        decorations = Decoration.none
        if (effect.value) {
          const decoration = Decoration.mark({
            class: 'graphql-definition-highlight'
          }).range(effect.value.from, effect.value.to)
          decorations = Decoration.set([decoration])
        }
      }
    }
    
    return decorations
  },
  provide: f => EditorView.decorations.from(f)
})

function navigateToDefinition(view: EditorView, typeDef: TypeDefinition) {
  const { start } = typeDef.location
  
  // Move cursor to the definition
  view.dispatch({
    selection: { anchor: start, head: start },
    scrollIntoView: true
  })

  // Highlight the definition briefly
  const word = view.state.wordAt(start)
  if (word) {
    // Add highlight
    view.dispatch({
      effects: setHighlightEffect.of({ from: word.from, to: word.to })
    })

    // Remove highlight after animation
    setTimeout(() => {
      view.dispatch({
        effects: setHighlightEffect.of(null)
      })
    }, 2000)
  }
}

// CSS animation for definition highlight
export const navigationStyles = `
@keyframes graphql-highlight-fade {
  0% {
    background-color: #fef3c7;
  }
  100% {
    background-color: transparent;
  }
}

.cm-editor .cm-content {
  position: relative;
}

.cm-editor .graphql-type-hover {
  cursor: pointer;
}
`

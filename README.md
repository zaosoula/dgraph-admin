# Dgraph Admin

A web-based admin interface for managing Dgraph instances.

## Features

- Manage multiple Dgraph connections
- Securely store credentials in your browser
- Edit GraphQL schema with syntax highlighting
- Visualize GraphQL schema as interactive UML diagram
- Compare schema versions with diff view
- Track schema history

## Tech Stack

- [Nuxt 3](https://nuxt.com/) - Vue framework
- [Vue 3](https://vuejs.org/) - JavaScript framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Shadcn Vue](https://www.shadcn-vue.com/) - UI components
- [Radix Vue](https://radix-vue.com/) - Headless UI components
- [Pinia](https://pinia.vuejs.org/) - State management
- [VueUse](https://vueuse.org/) - Collection of Vue composition utilities

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm, yarn, or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/zaosoula/dgraph-admin.git
cd dgraph-admin

# Install dependencies
npm install
# or
yarn install
# or
pnpm install

# Start the development server
npm run dev
# or
yarn dev
# or
pnpm dev
```

Visit `http://localhost:3000` in your browser.

## Build for Production

```bash
# Build the application
npm run build
# or
yarn build
# or
pnpm build

# Preview the production build
npm run preview
# or
yarn preview
# or
pnpm preview
```

## Security

All credentials are encrypted before being stored in your browser. No data is sent to any external servers.

## License

[MIT](LICENSE)

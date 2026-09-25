# Dgraph Admin

A web-based admin interface for managing Dgraph instances.

## Features

- Manage multiple Dgraph connections
- Store connection credentials in your browser
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
- macOS or Linux. `.yarnrc.yml` pins `supportedArchitectures` to darwin and
  linux so the vendored `.yarn/cache` stays small, which means Windows native
  binaries (rollup, lightningcss, oxide, …) are not resolved. On Windows, use
  WSL.

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

Dgraph Admin runs entirely in your browser. Connections and credentials are kept in
`localStorage`/`sessionStorage` and are never sent to an external server &mdash; the only
hosts contacted are the Dgraph endpoints you configure.

Credentials are **obfuscated at rest, not securely encrypted**. By default the AES key is
generated once and stored in `localStorage` alongside the ciphertext, so anything that can
read the stored credentials can also read the key: a cross-site scripting bug in the app, a
malicious browser extension, or anyone with access to the browser profile on disk. Treat
this as protection against a casual glance at storage, not as a secret store.

What this means in practice:

- Prefer **session-only storage** (Settings &rarr; Credential Storage, persistence off) for
  production credentials. They then live in `sessionStorage` for the tab only.
- Prefer scoped, short-lived tokens over long-lived admin credentials wherever your Dgraph
  deployment allows it.

**Exporting connections writes a plaintext JSON file.** Credentials are excluded unless you
tick "Include credentials" at export time; if you do include them, the passwords, tokens and
API keys are readable by anyone who can open the file. Delete the file once you have
imported it.

## License

[MIT](LICENSE)

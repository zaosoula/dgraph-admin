# Code Review — dgraph-admin

**Reviewed at:** `92414b9` (v0.0.4), branch `main`
**Scope:** full source tree (~9,400 LOC across `components/`, `composables/`, `stores/`, `utils/`, `pages/`), plus build, Docker, and CI configuration.
**Method:** static reading of every source file. No test suite exists and `node_modules` was not installed at the time of review, so nothing here was verified at runtime; findings are derived from reading the code and should be confirmed against a running instance before being treated as reproduced.

> **Status:** sections 2 through 7 have since been implemented, in four parallel passes covering (a) the promotion path and Dgraph client, (b) shared state and stores, (c) credentials, import/export and forms, and (d) the editor, dead code, and build tooling. `yarn typecheck` and `yarn build` both exit 0. A visual redesign pass followed. This document is kept as the record of what was found and why each change was made — read it as history, not as an open list. Two claims in the original draft were wrong and have been corrected in place (§8's `.DS_Store` and auth-branch items); one new finding was added during the work (§8.1).
>
> Known remaining items, all deliberate: `yarn lint` runs but is not wired into CI, because 51 pre-existing errors — mostly `no-explicit-any` in the d3 code in `components/schema/schema-diagram.vue` and the two CodeMirror extension files — would turn every pull request red on day one. Untangling those is a typed-generics refactor this review did not ask for. Switching the Docker image from the Nitro server to `nuxt generate` behind a static server (§6.4) is still judged worthwhile but was left as the maintainer's call.

---

## 1. Summary

dgraph-admin is a client-only (`ssr: false`) Nuxt 3 SPA that manages several Dgraph endpoints, edits and versions the GraphQL schema, and promotes a schema from a development instance to a linked production instance. The architecture is sound in outline — a Pinia store for connections, a thin `DgraphClient` over `/admin` and `/graphql`, composables for cross-cutting concerns — and the UI layer is consistent (shadcn-vue + Tailwind).

The problems are concentrated in three places:

1. **Two composables hold their state in function-local `ref()`s instead of module scope.** This silently disables the activity feed and fragments schema-sync state. It is the single highest-impact defect because it makes a shipped feature look broken rather than fail loudly.
2. **Schema promotion drives its two endpoints by mutating the global active connection.** Combined with a cached client and parallel execution, this is a real (if intermittent) risk of writing a schema to the wrong database.
3. **The security story is overstated.** Credentials are "encrypted" with a key kept in `localStorage` beside the ciphertext, and the export feature writes them to disk in plaintext. The README and Settings page both make a stronger claim than the code supports.

Beyond that, there is no test suite, no linter, no type-check script, and no CI job that builds the project — so none of the type errors noted below are currently caught by anything.

---

## 2. Critical

### 2.1 `useActivityHistory` state is per-call — the activity feed can never show anything

`composables/useActivityHistory.ts:24` declares `const activities = ref<Activity[]>([])` **inside** the composable function. Every `useActivityHistory()` call therefore gets a fresh, empty array.

Writers and readers are always different instances:

- `stores/connections.ts:211` and `:259` dynamically `import()` the composable and call `addActivity` on a throwaway instance.
- `composables/useDgraphClient.ts` does the same in `testConnection`.
- `composables/useSchemaPromotion.ts` does the same in `compareSchemas` and `promoteSchema`.
- `pages/index.vue:24` calls it once for rendering, and reads `getRecentActivities`.

The dashboard's "Recent Activity" panel is permanently stuck on its empty state. The panel, the icon/colour helpers, the `activityCounts` computed, and the `MAX_ACTIVITIES` cap are all dead weight today.

**Fix:** hoist the state out of the factory, or convert it to a Pinia store:

```ts
// module scope — shared by every caller
const activities = ref<Activity[]>([])

export const useActivityHistory = () => { /* ... */ }
```

Given that the connections store already reaches for it via dynamic import specifically to avoid a circular dependency, a real Pinia store (`stores/activity.ts`) is the cleaner destination.

### 2.2 `useSchemaSyncStatus` has the same defect

`composables/useSchemaSyncStatus.ts:26-28` declares `syncStatuses`, `isCheckingAll`, and `checkProgress` inside the factory. `pages/index.vue` happens to call it once and use one instance for both writing and reading, which is why the dashboard appears to work. But the shape is fragile by construction: any second component that calls `useSchemaSyncStatus()` — for instance to show a sync badge in the sidebar or the connection list — will see an empty map and report every connection as "Unknown". Hoist to module scope or a store for the same reasons as 2.1.

### 2.3 Schema promotion switches the global active connection to pick its target

`composables/useSchemaPromotion.ts` — both `compareSchemas` and `promoteSchema` retarget requests by mutating shared application state:

```ts
const originalActiveId = connectionsStore.activeConnectionId
connectionsStore.setActiveConnection(devConnection.id)
const devSchemaResult = await getSchema()          // hopefully dev
connectionsStore.setActiveConnection(prodConnection.id)
const prodSchemaResult = await getSchema()         // hopefully prod
```

Three separate problems compound here:

- **The retarget is not synchronous with the request.** `useDgraphClient` caches the client in a `ref` and only rebuilds it when a `watch` on `activeConnectionId` fires. Vue watcher callbacks are queued, not immediate. Whether the client has actually been rebuilt by the time the next `await getSchema()` runs depends on microtask ordering, not on anything the code guarantees. If it has not, `promoteSchema` reads the *dev* schema as `backupSchema` and then calls `updateSchema(devSchema)` against the *dev* client — leaving production untouched while reporting success.
- **Concurrent callers interleave.** `useSchemaSyncStatus.checkAllSyncStatuses` maps `checkSyncStatus` over every promotable connection and awaits them with `Promise.allSettled`, so several `compareSchemas` calls are in flight at once, each writing to the same global `activeConnectionId`. Comparison results can be attributed to the wrong connection pair.
- **The UI churns.** Because `activeConnectionId` is the value the switcher, sidebar, and schema editor all render from, a background sync check visibly flips the user's selected connection back and forth.

**Fix:** give `DgraphClient` an explicit target. `compareSchemas(dev, prod)` should construct `new DgraphClient(dev)` and `new DgraphClient(prod)` directly (resolving credentials through `useCredentialStorage` as `useDgraphClient.testConnection` already does) and never touch `setActiveConnection`. That removes the race, the interleaving, and the UI churn in one change.

### 2.4 `promoteSchema` captures a backup it never offers back

`promoteSchema` reads the current production schema into `backupSchema` and returns it, but `components/connection/schema-promotion-dialog.vue` ignores the field entirely. On a bad promotion, the previous production schema exists only in a discarded return value. Either surface it (offer a one-click rollback, or at minimum a download) or push it into `stores/schema-history` as a version tagged against the production connection before the write.

Relatedly, `pages/schema.vue:applySelectedVersion` writes a historical schema version straight to the live database with no confirmation dialog at all — a single click on "Apply Selected Version" overwrites the active connection's schema. The in-editor save path (`schema-editor.vue:saveSchema`) does gate on a confirmation; this path should too.

---

## 3. Security

### 3.1 The encryption key is stored beside the ciphertext

`utils/encryption.ts` generates a random AES key and writes it to `localStorage` under `dgraph_admin_encryption_key`, then encrypts credentials with it and stores the result in `localStorage` (or `sessionStorage`) under another key. Anything that can read one can read the other: an XSS in the app, a malicious extension, or anyone with filesystem access to the browser profile.

This is obfuscation, not encryption, and both `README.md` ("All credentials are encrypted before being stored in your browser") and `pages/settings.vue` ("All credentials are encrypted before being stored in your browser") present it as a security guarantee. A user could reasonably store a production Dgraph admin token on that basis.

**Options, in rough order of effort:**

- *Cheapest and honest:* reword both claims to describe what actually happens — credentials are stored in your browser, obfuscated but recoverable by any code running on this origin — and recommend session-only storage for production credentials.
- *Better:* derive the key from a user-supplied passphrase via PBKDF2/scrypt and hold it only in memory for the session. `useCredentialStorage` already has the persistent/session split to build on.
- *Best:* keep credentials in a non-extractable `CryptoKey` in IndexedDB via WebCrypto, so the key material is never readable by script.

### 3.2 Export writes credentials to disk in plaintext

`composables/useConnectionExportImport.ts` — `exportConnection` and `exportAllConnections` both call `credentialStorage.getCredentials()` and embed the decrypted result in a JSON blob handed to the browser's download. Passwords, bearer tokens, API keys, and `DG-Auth` tokens land unprotected in the user's Downloads folder, with no warning in the UI and no way to opt out.

At minimum, warn prominently in `components/connection/list.vue` and `pages/connections.vue` before exporting, and offer a credentials-excluded export. Ideally, encrypt the export under a passphrase the user types at export time and requires again at import.

### 3.3 Unescaped interpolation into `innerHTML` in the hover tooltip

`composables/extensions/graphqlHoverExtension.ts:34` assigns a template-built HTML string to `dom.innerHTML`. Inside `createTooltipContent`, `typeDef.description` and `field.type` go through `escapeHtml`, but `typeDef.name` (line 47) and `field.name` (line 74) do not.

Those values come from `useGraphQLSchemaParser`, which parses whatever schema text the Dgraph endpoint returns. Valid GraphQL identifiers cannot contain `<`, so this is not exploitable through a well-formed schema — but the inconsistency is the bug: two of four interpolations are escaped and two are not, which reads as an oversight rather than a decision. Escape all four.

### 3.4 Minor

- `DgraphClient` never sets a request timeout or passes an `AbortSignal`. A hung endpoint leaves "Refresh All" spinning indefinitely with no way to cancel; `Promise.allSettled` will not resolve until every fetch does.
- `executeQuery` / `executeAdminQuery` call `response.json()` without checking `response.ok`. A 401 or 502 returning an HTML error page surfaces as a JSON parse error rather than the actual HTTP status, which is why `schema-editor.vue` has to guess at auth failures by string-matching error codes that `DgraphClient` never actually emits (`AUTH_ERROR`, `ErrorUnauthorized` appear in the handler but are never set anywhere in `utils/dgraph-client.ts`).
- No `.dockerignore`, so `.git`, `node_modules`, `.nuxt`, and `.output` are all shipped into the Docker build context.

---

## 4. Correctness

### 4.1 Dates are typed as `Date` but rehydrate from storage as strings

`types/connection.ts` declares `Connection.createdAt`/`updatedAt` as `Date` and `ConnectionState.lastChecked` as `Date | null`. `stores/connections.ts:safeParseJSON` is a bare `JSON.parse` with no reviver, so after a page reload every one of those fields is a `string` that TypeScript still believes is a `Date`.

`stores/schema-history.ts` gets this right (`loadFromLocalStorage` maps `timestamp` back through `new Date()`). The connections store does not. Two call sites already work around it defensively — `components/connection/list.vue:formatDate` and `version-selector.vue:formatDate` both wrap in `new Date(date)` — which is good evidence the problem is real rather than theoretical. Any future code that calls `connection.createdAt.getTime()` or `.toISOString()` will throw.

**Fix:** revive dates in `safeParseJSON` (or store ISO strings in the type and convert at the edges — pick one and be consistent).

### 4.2 `updateConnectionState` writes a malformed `ConnectionTestResult`

`stores/connections.ts:294-305` truncates test results to save space, producing:

```ts
cleanedState.testResults = {
  overallSuccess: testResults.overallSuccess,
  adminHealth: { success: testResults.adminHealth?.success || false },
  // ...
}
```

The `ConnectionTestCheckResult` type requires `responseTime`, `error`, and `timestamp`; `ConnectionTestResult` also requires `totalTime`. None are present. Under `strict: true` this should be a compile error — it goes unnoticed because nothing type-checks the project (see §6.1).

The functional consequence is that any consumer reading `state.testResults.adminHealth.error` gets `undefined`. `components/connection/form.vue` sidesteps it by keeping its own `testResult` ref from `testConnectionDetailed`, so the truncation currently costs error detail that no one displays — but it is a trap for the next person who tries to.

Note also that this truncation happens on *every* state update, not only on persistence, so the full results are discarded from in-memory state too. If the goal is purely to bound `localStorage`, strip in `saveToLocalStorage`, not in the store mutation.

### 4.3 Diff context is attributed to the wrong lines

`composables/useSchemaPromotion.ts:createEnhancedDifferences`:

```ts
const devLines = devSchema.split('\n').filter(line => line.trim())   // filtered
const devContext = parseSchemaContext(devSchema)                      // keyed by UNFILTERED index

devLines.forEach((line, index) => {
  if (!prodLines.includes(line)) {
    const context = devContext.get(index)   // index spaces do not match
```

`parseSchemaContext` builds its map over `schema.split('\n')` with no filtering, while the diff loop indexes into a blank-line-filtered array. As soon as the schema contains a single blank line, every subsequent lookup is offset, and the promotion dialog groups changes under the wrong type or enum name. Since GraphQL schemas are conventionally blank-line separated, this is the common case, not the edge case.

Two further problems in the same function:

- **Matching is by whole-line string equality with `Array.includes`.** Lines that legitimately repeat across a schema — `}`, `id: ID!`, `name: String`, enum values — produce false "unchanged" results. A field genuinely removed from one type is reported as present because an identical line exists under a different type.
- **It is O(n·m).** `includes` scans the whole opposite array for every line, twice.

**Fix:** drop the hand-rolled comparison and use the `diff` package already in `dependencies` (`diffLines`), which `schema-editor.vue` and `schema-diff.vue` both already use. Carry the original line index through so context lookups stay aligned.

### 4.4 Import breaks dev→production links and silently skips credentials

In `useConnectionExportImport.importConnections`:

- New connections are created through `connectionsStore.addConnection`, which mints a **fresh** `crypto.randomUUID()`. The imported `linkedProductionId` values still reference the *old* IDs, so on import into a clean browser every dev→prod link dangles. `getLinkedProduction` returns `null` and the promotion feature silently disappears for those connections. A two-pass import (create all, then remap links via an old-ID→new-ID table) fixes this.
- When a connection **already exists**, the update path passes only `name`, `type`, `url`, `isSecure`, `environment`, and `linkedProductionId` — credentials are never written. Re-importing to refresh a rotated token does nothing, with a "Successfully imported 1 connection" message.
- Credentials are only saved when `connection.isSecure` is true. An export of a connection whose `isSecure` was false but which carries credentials imports as `{ method: 'none' }` with the credentials dropped.
- `isValidConnection` requires `createdAt` and `updatedAt` to be present, but the import path never passes them through to `addConnection` (which sets its own). The validation is checking a field it then discards.

### 4.5 Deleting a connection leaves orphans

`pages/connections.vue:deleteConnection` correctly calls `credentialStorage.deleteCredentials` before `removeConnection`. But nothing cleans up:

- Schema history versions for that connection in `stores/schema-history` — they accumulate in `localStorage` forever, keyed to an ID that no longer resolves.
- `linkedProductionId` on other connections pointing at the deleted one — those links dangle exactly as in 4.4.

### 4.6 Sidebar's "Schema" item computes `disabled` once

`components/app-sidebar.vue:23` builds `navigationItems` as a plain array literal, with `disabled: !connectionsStore.activeConnection` evaluated a single time during `setup`. It never re-evaluates when a connection is selected or cleared. Wrap the array in a `computed`.

### 4.7 Credential method is re-derived from field contents, ignoring what was stored

`components/connection/form.vue:60-120` rebuilds the auth method when editing by testing which credential fields are non-empty, in a fixed precedence order (`basic` → `token` → `api-key` → `auth-token` → `dg-auth`), rather than reading the `method` that was stored. If a user previously filled in an API key, then switched the connection to token auth, reopening the form can resurrect the wrong method. The stored `AuthCredentials.method` is authoritative and should be used directly.

### 4.8 Toggling `isSecure` off leaves credentials behind

Still in `form.vue:saveConnection` — credentials are saved only `if (formState.isSecure)`. Turning security off on an existing connection leaves the previously stored credentials in `localStorage` untouched. Call `credentialStorage.deleteCredentials(connectionId)` on the `else` branch.

### 4.9 `require()` in a browser ESM bundle

`composables/useCodeMirror.ts:99` — `const { updateSchema: updateGraphQLSchema } = require('cm6-graphql')`. `require` does not exist in the Vite/Rollup browser output; this throws `ReferenceError: require is not defined` if ever reached. It is currently unreachable (see 5.3), which is why it has gone unnoticed. Use the static import that is already at the top of the file, or a dynamic `import()`.

---

## 5. Dead, duplicated, and non-functional code

### 5.1 `components/schema/schema-diff.vue` is unused

290 lines, imported by nothing (verified by grep across `components/`, `pages/`, `layouts/`, `composables/`). Its `processedDiff` computed is a near-verbatim copy of the ~130-line block inside `schema-editor.vue`. Either delete it, or — better — extract the shared diff logic into a composable and have both the editor and the promotion dialog consume it.

### 5.2 The "Diff View" tab renders the editor, not a diff

`pages/schema.vue` defines three tabs. The `diff` branch renders `<SchemaEditor>`, identical to the `editor` branch:

```vue
<div v-else-if="activeTab === 'diff' && selectedVersionId" class="h-[600px]">
  <SchemaEditor v-model:schema="currentSchema" ... />
</div>
```

The page computes `originalSchema` from the selected version specifically to feed a diff, and then never uses it. This is presumably why 5.1 exists — the component was written and never wired up.

### 5.3 `editorRef` is never bound, so `updateContent` is a permanent no-op

`useCodeMirror` returns an `editorRef` and an `updateContent` that guards on `editorRef.value?.view`. But `schema-editor.vue:528` renders `<Codemirror v-model="schema" :extensions="extensions" ... />` with **no `ref="editorRef"`**. `editorRef` is therefore always `null`, so `updateContent` and the composable's `updateSchema` both return immediately every time.

Content updates happen to work anyway, because the template uses `v-model="schema"` and `loadSchema` assigns `schema.value` directly. The `value` ref from the composable is a second, parallel copy of the same text whose only real consumer is the schema parser. Either bind the ref and use one source of truth, or drop `editorRef`/`updateContent`/`updateSchema` from the composable's surface.

### 5.4 Version deletion is wired to nothing meaningful

`version-selector.vue` emits `delete` from its template (line 68) without declaring it in `defineEmits` (only `select` is declared). `pages/schema.vue` binds `@delete="deleteVersion"`. This works in Vue 3 but triggers a dev-mode warning and is easy to break; declare the emit.

### 5.5 Fabricated dashboard metric

`pages/index.vue:132` passes a hardcoded trend to the "Total Connections" stat card:

```vue
:trend="{ value: 12, label: 'vs last week', isPositive: true }"
```

The dashboard displays "+12% vs last week" regardless of reality. The v0.0.3 changelog entry "Replace dashboard mock data with real connection and schema information" suggests this was meant to be removed. Either compute it or delete the prop.

Nearby: `isLoading` on the same page is declared `// Loading state for demo` and never set to `true`; the "View Documentation" button has no handler and no link.

### 5.6 Stray minimap placeholder

`composables/useCodeMirror.ts:29-32` defines, at odd indentation, a `create` function returning an empty `<div>` which is then handed to `showMinimap`. The minimap renders nothing. Either implement it or drop `@replit/codemirror-minimap` from `dependencies` (and the `:deep(.cm-minimap*)` styles in `schema-editor.vue`).

### 5.7 Duplicated `cn` helper

`utils/cn.ts` and `lib/utils.ts` are the same function. `components.json` points shadcn at `@/lib/utils`, so `utils/cn.ts` is the redundant one — but Nuxt auto-imports `utils/`, so `cn` may resolve to either depending on the import. Delete `utils/cn.ts`.

### 5.8 Leaked watchers

`useDgraphClient` registers `watch(() => connectionsStore.activeConnectionId, ...)` at composable-creation time. `useSchemaPromotion.compareSchemas` and `promoteSchema` call `useDgraphClient()` from inside async functions — outside any component setup or effect scope — so those watchers are never stopped. Every comparison leaks two of them. Fixing 2.3 (constructing clients directly) removes this as a side effect.

---

## 6. Build, tooling, and configuration

### 6.1 No tests, no linter, no type-check

`package.json` scripts are `build`, `dev`, `generate`, `preview`, `postinstall`, `docker:build`, `docker:run`, `release`. There is no `test`, no `lint`, and no `typecheck`, and no test files anywhere in the tree. `vue-tsc` is in `devDependencies` but nothing invokes it.

This is why §4.2's type error is live in `main`. The cheapest high-value change in this document is adding `"typecheck": "nuxt typecheck"` and running it in CI.

Note that `vue-tsc@^1.8.0` is pinned against `typescript@^5.3.0`; vue-tsc 1.x does not support recent TypeScript releases, so the upgrade to `vue-tsc@^2` is likely needed before the script will run at all.

### 6.2 CI builds nothing

`.github/workflows/publish.yml` triggers only on `release: published` and `workflow_dispatch`. There is no pull-request workflow, so nothing verifies that `main` compiles. Dependabot is configured for daily npm and GitHub Actions updates — those PRs are merged without any build ever running against them.

Add a PR workflow running `yarn install --immutable`, `yarn typecheck`, and `yarn build`.

Minor: `actions/checkout@v3` is two majors behind (and runs *after* `setup-buildx-action`, which is harmless but reads oddly).

### 6.3 Tailwind v3 config in a Tailwind v4 project

`package.json` has `tailwindcss@^4.1.18`, and `assets/css/tailwind.css` uses the v4 syntax (`@import "tailwindcss"`, `@theme inline`, `@custom-variant`). But `tailwind.config.js` is a v3-style CommonJS config with a full `theme.extend.colors` map and a `content` array.

Tailwind v4 does not read `tailwind.config.js` unless a `@config` directive points at it, so this file is dead — and since `package.json` sets `"type": "module"`, its `module.exports` would throw if anything did load it. `components.json` still points shadcn's CLI at it, which means future `shadcn-vue add` runs may consult a config the build ignores.

Delete `tailwind.config.js` and move anything still needed into the `@theme` block, or add `@config` and accept the v3 compatibility path. Do not leave both.

Related: `assets/css/tailwind.css` defines a `dark` variant, and components across the app use `dark:` classes (`pages/index.vue`, `components/connection/list.vue`, and others), but nothing in the codebase ever adds the `.dark` class to the document. Dark mode is styled but unreachable — add a toggle (`@vueuse/core` is already a dependency and provides `useDark`) or remove the dead variants.

### 6.4 Dockerfile issues

```dockerfile
COPY package.json yarn.lock .yarnrc.yml .yarn/ ./
```

`COPY <dir>/ ./` copies the *contents* of the directory, not the directory itself — so `.yarn/cache` lands at `/app/cache` and `.yarn/install-state.gz` at `/app/install-state.gz`. With `enableGlobalCache: false` in `.yarnrc.yml`, Yarn looks for `.yarn/cache` and finds nothing, so the cache this COPY was meant to provide is silently unused. Use `COPY .yarn/ ./.yarn/`.

Also:

- `yarn install` without `--immutable` lets the lockfile drift during an image build. Add `--immutable`.
- No `.dockerignore` (see §3.4).
- The app is `ssr: false` — a pure SPA. It is shipped as a Nitro node server on port 80. `nuxt generate` behind nginx or any static host would be a smaller, faster image with a smaller attack surface. Worth considering unless there are plans for server routes.

### 6.5 `process.client` is deprecated

Three uses in `stores/connections.ts` (lines 123, 211, 259). Nuxt 3 prefers `import.meta.client`. Given `ssr: false`, these guards are also unnecessary — the store never runs on a server.

### 6.6 `@codemirror/*` imported but not declared

`composables/useCodeMirror.ts` imports from `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, and `@codemirror/language`; `graphqlHoverExtension.ts` and `graphqlNavigationExtension.ts` import from `@codemirror/view` as well. None appear in `package.json` — they resolve transitively through the `codemirror` meta-package. This works with Yarn's node-modules linker but breaks under stricter resolution (pnpm, Yarn PnP) and leaves the versions unpinned. Declare them explicitly.

### 6.7 `README.md` links a LICENSE that does not exist

The README ends with `[MIT](LICENSE)`; there is no `LICENSE` file in the repository. Add one.

---

## 7. Performance

- **The GraphQL schema is fully re-parsed on every keystroke.** `useGraphQLSchemaParser` ends with `watch(schemaText, parseSchema, { immediate: true })`, and `parseSchema` runs `graphql.parse()` plus a full `visit()` over the document. On a large Dgraph schema this will be felt while typing. Debounce it (150–300 ms) — `@vueuse/core` provides `watchDebounced`.
- **`createEnhancedDifferences` is O(n·m)** (§4.3). Replaced by `diffLines`, it becomes O(n+m) in practice.
- **`cleanupLocalStorage` iterates all of `localStorage` with a `for...in` loop and sums string lengths** on every store initialisation (`stores/connections.ts:71-80`). It runs once per page load, so it is cheap in absolute terms, but the `for...in` over `localStorage` (which enumerates inherited properties, hence the `hasOwnProperty` guard) is better written as `Object.keys(localStorage)`.
- **Schema history is unbounded.** `stores/schema-history.ts` stores the complete schema text per version with no cap and no pruning, and the store's `QuotaExceededError` handling covers only the connections keys — a history overflow is caught and logged but the version is silently lost. Add a per-connection version cap (the activity history's `MAX_ACTIVITIES` pattern), and prune history when a connection is deleted (§4.5).

---

## 8. Smaller observations

- `DgraphClient.getBaseUrl` builds `` `${this.connection.url}/${endpoint}` `` with no trailing-slash normalisation. A URL entered as `https://host/` produces `https://host//admin`. The form validates with `new URL()`, which accepts the trailing slash. Normalise on save or on use.
- `DgraphClient.getHeaders` selects the header set with `endpoint.includes('admin')`. It works because both call sites pass literals, but it is an unnecessary stringly-typed dispatch — pass the header set directly.
- `testAdminSchemaRead` and `testClientIntrospection` return `success: hasSchema`, where `hasSchema` is `'' | undefined | boolean` and `any` respectively, against a field typed `boolean`. Coerce with `Boolean(...)` or `!!`.
- `testAdminHealth` posts `{ __typename }` and treats any `response.ok` as success. Dgraph's `/admin` endpoint returns 200 for many failure modes, including some auth rejections (GraphQL errors arrive in the body with a 200 status). Check the response body for `errors` as well.
- `connectionsByEnvironment` (`stores/connections.ts:139`) does `grouped[connection.environment].push(...)` against a map with exactly the `Development`/`Production`/`Untagged` keys. Import does not validate `environment`, so a hand-edited export file with any other value throws `Cannot read properties of undefined`. Guard the lookup.
- `pages/schema.vue` binds `v-model:schema` to `<SchemaEditor>`, but the component declares its prop as `initialSchema`. The `schema` prop falls through to attrs and is ignored; only the `update:schema` half of the binding does anything. The data flow works one-way by accident. Align the names.
- `schema-editor.vue:saveSchema` shows the confirmation dialog only when `hasChanges` is true. Saving with no changes writes to the database with no prompt — harmless, but inconsistent.
- `schema-editor.vue` branches on `result.error.code === 'AUTH_ERROR' || result.error.code === 'ErrorUnauthorized'`. The comparison itself is written correctly, but `DgraphClient` never populates `code` on any error it returns, so the branch is unreachable.
- `groupedDifferences` in `schema-promotion-dialog.vue` keys groups by `${typeKind}_${typeName}` and then re-keys the result by `typeName` alone, so a `type Foo` and an `enum Foo` in the same schema collide and one is dropped.
- 46 `console.*` calls across the source tree, including `console.log("Schema promotion successful!")` in `connection/switcher.vue`. Several stand in for user-facing feedback that never arrives — `pages/index.vue:handleRefreshAll` logs its result rather than showing it. A toast component would close that gap.
- `layouts/default.vue` has an empty `<script setup lang="ts"></script>` block.
- A `.DS_Store` (10 KB) sits at the repository root. It is correctly ignored by `.gitignore:30` and is *not* tracked — no action needed. (An earlier draft of this review claimed it was committed; that was wrong.)

### 8.1 The vendored Yarn cache is platform-specific

`.gitignore` un-ignores `.yarn/cache` (`!.yarn/cache`), so the repository vendors Yarn's package zips — including **platform-native binaries**. The committed set is `linux-x64`: `@esbuild-linux-x64`, `@rollup-rollup-linux-x64-gnu`, `@parcel-watcher-linux-x64-glibc`, `lightningcss-linux-x64-gnu`, `@tailwindcss-oxide-linux-x64-gnu`, and three `@oxc-*-binding-linux-x64-gnu` packages.

That set exists because the Dockerfile and CI build on Linux. But it means **running `yarn install` on a macOS or Windows machine deletes those zips** from the working tree (Yarn prunes cache entries it does not need) and adds the local platform's instead. Committing that deletion breaks the Docker image build and the new CI workflow, which both run `yarn install --immutable` on Linux.

This is not hypothetical — it happened while preparing the fixes for this review, and the Linux zips had to be restored by hand.

**Fix:** either commit the union of all platforms your builds target (add `supportedArchitectures` to `.yarnrc.yml` so a local install fetches Linux binaries too), or stop vendoring the cache entirely (`enableGlobalCache: true` plus removing the `!.yarn/cache` exception) and rely on CI caching instead. The second is simpler and is what most projects do; the first is worth keeping only if offline or hermetic builds matter. Until one of them is done, anyone on a non-Linux machine must check that `git status` shows no deleted `*-linux-*` zips before committing.

---

## 9. Suggested order of work

**First — correctness and safety of the promotion path:**

1. Give `DgraphClient` explicit targets in `useSchemaPromotion`; stop mutating `activeConnectionId` (§2.3). This also fixes §5.8.
2. Add a confirmation to `applySelectedVersion` and surface `backupSchema` in the promotion dialog (§2.4).
3. Replace `createEnhancedDifferences` with `diffLines` (§4.3).

**Second — make the tooling catch the next one:**

4. Add `typecheck` and `lint` scripts and a PR workflow that runs them alongside `build` (§6.1, §6.2). Fix the type errors this surfaces, starting with §4.2.
5. Resolve the Tailwind v3/v4 split (§6.3).

**Third — features that are silently broken:**

6. Hoist `useActivityHistory` and `useSchemaSyncStatus` state to module scope or Pinia stores (§2.1, §2.2).
7. Fix date rehydration in the connections store (§4.1).
8. Fix import: remap linked IDs, update credentials on existing connections (§4.4).
9. Clean up orphaned history and dangling links on delete (§4.5).

**Fourth — honesty and hygiene:**

10. Reword the security claims in `README.md` and `pages/settings.vue`, and warn before plaintext export (§3.1, §3.2).
11. Remove the fabricated dashboard trend (§5.5).
12. Delete `schema-diff.vue` or wire up the diff tab (§5.1, §5.2); delete `utils/cn.ts` (§5.7).
13. Fix the Dockerfile `COPY`, add `--immutable` and a `.dockerignore` (§6.4).
14. Add a `LICENSE` file (§6.7).

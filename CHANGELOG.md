# Changelog


## v0.0.6

[compare changes](https://github.com/zaosoula/dgraph-admin/compare/v0.0.5...v0.0.6)

### 🚀 Enhancements

- **activity:** Persist the activity feed ([a9a62f0](https://github.com/zaosoula/dgraph-admin/commit/a9a62f0))

### 🩹 Fixes

- **diagram:** Strip directives with nested parens ([d6eaf24](https://github.com/zaosoula/dgraph-admin/commit/d6eaf24))
- **diagram:** Tear down resize listener and simulation ([604b674](https://github.com/zaosoula/dgraph-admin/commit/604b674))
- **credentials:** Report an unreadable credential store ([3a44935](https://github.com/zaosoula/dgraph-admin/commit/3a44935))
- **client:** Stop sending unauthenticated requests ([31f3f67](https://github.com/zaosoula/dgraph-admin/commit/31f3f67))
- **connections:** Test the credentials typed in the form ([9278fb4](https://github.com/zaosoula/dgraph-admin/commit/9278fb4))
- **schema:** Give the editor one document ([801094e](https://github.com/zaosoula/dgraph-admin/commit/801094e))
- **promotion:** Refuse to promote without a backup ([63fc4f5](https://github.com/zaosoula/dgraph-admin/commit/63fc4f5))
- **import:** Report credentials that could not be stored ([6a9f035](https://github.com/zaosoula/dgraph-admin/commit/6a9f035))

### 💅 Refactors

- **sync:** Drop unused clear helpers ([15123bf](https://github.com/zaosoula/dgraph-admin/commit/15123bf))

### 📖 Documentation

- Note that Windows needs WSL ([058e6ed](https://github.com/zaosoula/dgraph-admin/commit/058e6ed))

### 🤖 CI

- Run lint ([bd0f624](https://github.com/zaosoula/dgraph-admin/commit/bd0f624))

### ❤️ Contributors

- Zao Soula ([@zaosoula](https://github.com/zaosoula))

## v0.0.5

[compare changes](https://github.com/zaosoula/dgraph-admin/compare/v0.0.4...v0.0.5)

### 🩹 Fixes

- **credentials:** Refuse rather than fall back when locked ([daa11e1](https://github.com/zaosoula/dgraph-admin/commit/daa11e1))
- **credentials:** Repair regressions from the previous fix ([692e3bc](https://github.com/zaosoula/dgraph-admin/commit/692e3bc))

### 🏡 Chore

- Fix audit findings and redesign UI ([e0699db](https://github.com/zaosoula/dgraph-admin/commit/e0699db))
- Pin supported architectures and clear all lint errors ([5d7759f](https://github.com/zaosoula/dgraph-admin/commit/5d7759f))

### ❤️ Contributors

- Zao Soula <contact@zaosoula.fr>

## v0.0.4

[compare changes](https://github.com/zaosoula/dgraph-admin/compare/v0.0.3...v0.0.4)

## v0.0.3

[compare changes](https://github.com/zaosoula/dgraph-admin/compare/v0.0.2...v0.0.3)

### 🚀 Enhancements

- Modernize design with new color scheme, sidebar navigation, and enhanced dashboard ([34c99ac](https://github.com/zaosoula/dgraph-admin/commit/34c99ac))
- Add environment tagging for connections ([2580760](https://github.com/zaosoula/dgraph-admin/commit/2580760))
- Add minimap to schema editor using @replit/codemirror-minimap ([18ccbb4](https://github.com/zaosoula/dgraph-admin/commit/18ccbb4))
- Implement dev-to-production schema promotion feature ([6b3327e](https://github.com/zaosoula/dgraph-admin/commit/6b3327e))
- Add minimap to schema editor using @replit/codemirror-minimap ([90c9d9f](https://github.com/zaosoula/dgraph-admin/commit/90c9d9f))
- Implement GraphQL schema reference linking ([3206015](https://github.com/zaosoula/dgraph-admin/commit/3206015))
- Replace dashboard mock data with real connection and schema information ([4e2a6c4](https://github.com/zaosoula/dgraph-admin/commit/4e2a6c4))

### 🩹 Fixes

- Invalidate cached DgraphClient when active connection changes ([aa3724d](https://github.com/zaosoula/dgraph-admin/commit/aa3724d))
- Prevent editor crash after CMD+click navigation ([dadf1c1](https://github.com/zaosoula/dgraph-admin/commit/dadf1c1))
- Optimize localStorage usage to prevent QuotaExceededError ([175bef6](https://github.com/zaosoula/dgraph-admin/commit/175bef6))
- Prevent infinite loop in localStorage cleanup ([de3b464](https://github.com/zaosoula/dgraph-admin/commit/de3b464))

### 🏡 Chore

- **deps-dev:** Bump shadcn-nuxt from 2.2.0 to 2.4.3 ([c4c2647](https://github.com/zaosoula/dgraph-admin/commit/c4c2647))

## v0.0.2


### 🚀 Enhancements

- Make ConnectionSwitcher clickable with Shadcn Vue Select ([6619c02](https://github.com/zaosoula/dgraph-admin/commit/6619c02))
- Enhance test connection with 3 detailed checks ([8ff21a6](https://github.com/zaosoula/dgraph-admin/commit/8ff21a6))

### 🩹 Fixes

- Correctly display persistence settings ([d77aa28](https://github.com/zaosoula/dgraph-admin/commit/d77aa28))

### 🏡 Chore

- Reinstall shadcn-vue ([07006eb](https://github.com/zaosoula/dgraph-admin/commit/07006eb))
- Remove proxy ([8748f2a](https://github.com/zaosoula/dgraph-admin/commit/8748f2a))
- Enable https in dev mode ([ff1f8e1](https://github.com/zaosoula/dgraph-admin/commit/ff1f8e1))
- Prepare docker image ([f540827](https://github.com/zaosoula/dgraph-admin/commit/f540827))
- Add release script ([f972278](https://github.com/zaosoula/dgraph-admin/commit/f972278))
- Define initial package version ([fa7c349](https://github.com/zaosoula/dgraph-admin/commit/fa7c349))

### ❤️ Contributors

- Zao Soula ([@zaosoula](https://github.com/zaosoula))


# @dexter.js/sdk

[![npm version](https://img.shields.io/npm/v/@dexter.js/sdk)](https://www.npmjs.com/package/@dexter.js/sdk)
[![License: LGPL v3](https://img.shields.io/badge/License-LGPL_v3-blue.svg)](https://www.gnu.org/licenses/lgpl-3.0)

Everything in one install — logger + monitor + dashboard for Node.js.

## Install

```bash
npm install @dexter.js/sdk
```

## What's included

- `createLogger` from `@dexter.js/logger`
- `monitor`, `expressMiddleware`, and instrumentors from `@dexter.js/monitor`
- Sidecar auto-managed via monitor

## Usage patterns

### 1) Full setup (recommended)

```ts
import express from 'express'
import { createLogger, monitor, expressMiddleware } from '@dexter.js/sdk'

const app = express()
app.use(expressMiddleware())

const logger = createLogger({ level: 'debug', format: 'pretty' })
monitor({ app, logger })

app.listen(3000)
```

### 2) Logger only

```ts
import { createLogger } from '@dexter.js/sdk'

const logger = createLogger({ level: 'info', format: 'pretty' })
logger.info('hello from sdk logger')
```

### 3) Monitor only

```ts
import express from 'express'
import { monitor, expressMiddleware } from '@dexter.js/sdk'

const app = express()
app.use(expressMiddleware())
monitor({ app })
```

Full docs: https://github.com/dexter-js/dexterjs

Part of the DexterJS ecosystem — github.com/dexter-js/dexterjs

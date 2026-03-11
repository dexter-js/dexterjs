# @dexter.js/monitor

Auto instrumentation and live dashboard for Node.js apps.

## Install

```bash
npm install @dexter.js/monitor
```

## Quick start

```ts
import express from 'express'
import { monitor, expressMiddleware } from '@dexter.js/monitor'

const app = express()
app.use(expressMiddleware())

monitor({ app })

app.listen(3000)
// dashboard: http://localhost:4000
```

## Instrumentors

```ts
import {
  instrumentPrisma,
  instrumentDrizzle,
  instrumentPg,
  instrumentMongoose,
  instrumentRedis,
  instrumentHttp
} from '@dexter.js/monitor'

// pg
instrumentPg(Pool)

// prisma
const prisma = instrumentPrisma(new PrismaClient())

// drizzle (wrap pool before creating drizzle db)
const wrappedPool = instrumentDrizzle(pool)
const db = drizzle(wrappedPool)

// mongoose
instrumentMongoose(mongoose)

// redis (instance-level)
const redis = new Redis()
instrumentRedis(redis)

// outbound HTTP
instrumentHttp({ axios })
```

## MonitorOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `app` | `any` (Express app) | required | App instance used by monitor setup |
| `logger` | `any` | `undefined` | Optional `@dexter.js/logger` instance |
| `port` | `number` | `4000` | Sidecar/dashboard HTTP port |
| `autoSpawn` | `boolean` | `true` | Auto-start sidecar process |
| `socketPath` | `string` | `/tmp/dexter.sock` | Unix socket path |
| `sidecarPath` | `string` | auto-resolved | Custom sidecar entrypoint |

For full docs and examples: https://github.com/dexter-js/dexterjs

Part of the DexterJS ecosystem — github.com/dexter-js/dexterjs

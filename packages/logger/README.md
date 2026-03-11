# @dexter.js/logger

Standalone production-grade logger for Node.js. Zero dependencies, TypeScript first.

## Install

```bash
npm install @dexter.js/logger
```

## Quick start

```ts
import { createLogger } from '@dexter.js/logger'

const logger = createLogger({
  level: 'debug',
  format: 'pretty',
  transport: 'auto',
  redact: ['password', 'token'],
  context: { service: 'api', env: 'development' },
  async: true,
  bufferSize: 100
})

logger.info('server started', { port: 3000 })
logger.error('request failed', { statusCode: 500 })
```

## LoggerOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `level` | `debug \| info \| warn \| error \| fatal` | `info` | Minimum log level |
| `format` | `json \| pretty \| minimal` | `pretty` in dev, `json` in prod | Output format |
| `transport` | `auto \| terminal \| file \| both` | `auto` | Where logs are written |
| `env` | `development \| production` | from `NODE_ENV` | Environment override |
| `redact` | `string[]` | `[]` | Recursively redact matching keys |
| `async` | `boolean` | `true` | Buffered non-blocking writes |
| `bufferSize` | `number` | `100` | Buffer size before flush |
| `context` | `Record<string, unknown>` | `{}` | Fields attached to every log |
| `file` | `FileOptions` | `undefined` | File transport configuration |

### FileOptions

| Option | Type | Description |
|---|---|---|
| `path` | `string` | Log directory path |
| `split` | `boolean` | Split output files by level |
| `filenames` | `object` | Optional custom filenames |
| `rotation.maxSize` | `string` | Max size before rotation (e.g. `10mb`) |
| `rotation.maxFiles` | `number` | Days of rotated files to keep |
| `rotation.compress` | `boolean` | Gzip rotated files |

## Logger methods

```ts
logger.info(message, metadata?)
logger.error(message, metadata?)
logger.warn(message, metadata?)
logger.debug(message, metadata?)
logger.child(context)
logger.flush()
logger.close()
```

For full observability (traces, metrics, dashboard) see DexterJS: https://github.com/dexter-js/dexterjs

Part of the DexterJS ecosystem — github.com/dexter-js/dexterjs

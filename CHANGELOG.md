# Changelog

## [0.1.1] — 2026-03-10

### Fixed
- traceId propagation across all instrumentors via shared AsyncLocalStorage
- Logger not attaching traceId to log entries
- SidecarTransport reading wrong traceId field
- Mongoose losing async context in post hook
- Redis spans now show command + key (e.g. `GET cached:users`)

### Changed
- Drizzle instrumentation now wraps pg pool directly for accurate timing
- Redis span type set to `"redis"` explicitly

### Added
- React dashboard with shadcn/ui, Recharts, React Query
- `/api/spans` endpoint for trace expansion
- CHANGELOG.md

## [0.1.0] — 2026-03-10

### Added
- Initial release — logger, monitor, sidecar, dashboard
- Auto instrumentation for Express, pg, Prisma, Drizzle, Mongoose, Redis, HTTP
- Unix socket IPC between SDK and sidecar
- SQLite storage with WAL mode
- Rule-based insights — N+1, slow queries, high error rate, hot routes
- Basic HTML dashboard

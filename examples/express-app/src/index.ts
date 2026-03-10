import express, { type Request, type Response } from "express";
import { Pool } from "pg";

// ─── Initialise DexterJS FIRST so all subsequent modules are instrumented ────
import {
  init,
  expressMiddleware,
  instrumentPg,
  LogCollector,
} from "@dexter.js/sdk";

const emitter = init({
  port: 4000,
  autoSpawn: true,
});

// Instrument pg before creating any pools/clients.
instrumentPg(Pool);

const log = new LogCollector(emitter);

// ─── Postgres pool (configure via env vars) ──────────────────────────────────
const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/dexterjs_demo",
  max: 10,
});

pool.on("error", (err) => {
  log.warn("PostgreSQL pool error — routes will return mock data.", {
    error: err.message,
  });
});

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Silently handle Chrome DevTools / well-known probes.
app.use("/.well-known", (_req, res) => res.status(204).end());

// Attach DexterJS middleware — captures traces for every request.
app.use(expressMiddleware());

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/users", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users LIMIT 50",
    );
    log.info("Fetched users list", { count: result.rows.length });
    res.json(result.rows);
  } catch {
    log.warn("Returning mock users (PG unavailable)");
    res.json([
      { id: 1, name: "Alice", email: "alice@example.com" },
      { id: 2, name: "Bob", email: "bob@example.com" },
    ]);
  }
});

app.get("/users/:id", async (req: Request, res: Response) => {
  const userId = req.params["id"];
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0) {
      log.info("User not found", { userId });
      res.status(404).json({ error: "User not found" });
      return;
    }
    log.info("Fetched user", { userId });
    res.json(result.rows[0]);
  } catch {
    log.warn("Returning mock user (PG unavailable)", { userId });
    res.json({
      id: Number(userId),
      name: "Mock User",
      email: "mock@example.com",
    });
  }
});

app.post("/users", async (req: Request, res: Response) => {
  const { name, email } = req.body ?? {};
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }

  try {
    const result = await pool.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [name, email],
    );
    log.info("Created user", { name, email });
    res.status(201).json(result.rows[0]);
  } catch {
    log.warn("Returning mock created user (PG unavailable)", { name, email });
    res.status(201).json({ id: 999, name, email });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env["PORT"]) || 3000;

app.listen(PORT, () => {
  console.log(`[example-express] listening on http://localhost:${PORT}`);
  console.log(`[dexter] dashboard at http://localhost:4000`);
});

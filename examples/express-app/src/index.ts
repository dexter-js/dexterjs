import express, { type Request, type Response } from "express";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { drizzle } from "drizzle-orm/node-postgres";
import mongoose from "mongoose";
import Redis from "ioredis";
import axios from "axios";

import * as drizzleSchema from "./db/drizzle-schema";

// ─── DexterJS Setup (must come before creating DB clients) ───────────────────

import {
  createLogger,
  monitor,
  expressMiddleware,
  instrumentPg,
  instrumentPrisma,
  instrumentMongoose,
  instrumentRedis,
  instrumentHttp,
  traceStore,
} from "@dexter.js/sdk";
import { instrumentDrizzle } from "../../../packages/monitor/src/instrumentors/drizzle";

const logger = createLogger({
  level: "debug",
  format: "pretty",
  transport: "terminal",
  redact: ["password", "token", "secret"],
  context: { service: "express-app", version: "0.1.0" },
});

const app = express();
app.use(expressMiddleware());
app.use(express.json());

// Initialize monitor — pass logger so logs flow through sidecar.
monitor({ app, logger, port: 4000, autoSpawn: true });


app.get('/test-trace', (req, res) => {
  console.log('traceStore value:', traceStore.getStore())
  res.json({ traceId: traceStore.getStore()?.traceId })
})

// Instrument libraries before creating instances.
instrumentPg(Pool);
instrumentMongoose(mongoose);
instrumentHttp({ axios });

// ─── Database Clients ────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://dexter:dexter@localhost:5432/dextertest";
const MONGO_URL =
  process.env["MONGO_URL"] ?? "mongodb://localhost:27017/dextertest";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

// Raw pg pool
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
pool.on("error", (err) => {
  logger.warn("PostgreSQL pool error", { error: err.message });
});

// Prisma
let prisma = instrumentPrisma(new PrismaClient({ datasources: { db: { url: DATABASE_URL } } }));

// Drizzle (shares the pg pool, with dexter logger)
const drizzleDb = drizzle(instrumentDrizzle(pool), { schema: drizzleSchema })

// Mongoose
const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});
const Item = mongoose.model("Item", ItemSchema);

// Redis
const redis = new Redis(REDIS_URL);
instrumentRedis(redis);
redis.on("error", (err) => {
  logger.warn("Redis connection error", { error: err.message });
});

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use("/.well-known", (_req, res) => res.status(204).end());

const reqLog = logger.child({ module: "routes" });

// ─── Prisma Routes ───────────────────────────────────────────────────────────

app.get("/prisma/users", async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    reqLog.info("Prisma: fetched users", { count: users.length });
    res.json(users);
  } catch (err: any) {
    reqLog.error("Prisma: failed to fetch users", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post("/prisma/users", async (req: Request, res: Response) => {
  const { name, email } = req.body ?? {};
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }
  try {
    const user = await prisma.user.create({ data: { name, email } });
    reqLog.info("Prisma: created user", { name, email });
    res.status(201).json(user);
  } catch (err: any) {
    reqLog.error("Prisma: failed to create user", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get("/prisma/users/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    reqLog.info("Prisma: fetched user", { id });
    res.json(user);
  } catch (err: any) {
    reqLog.error("Prisma: failed to fetch user", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// N+1 pattern — intentionally slow for insights testing
app.get("/prisma/slow", async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    const results: any[] = [];
    for (const user of users) {
      const posts = await prisma.post.findMany({ where: { userId: user.id } });
      results.push({ ...user, posts });
    }
    reqLog.warn("Prisma: N+1 query executed", { userCount: users.length });
    res.json(results);
  } catch (err: any) {
    reqLog.error("Prisma: N+1 query failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Drizzle Routes ──────────────────────────────────────────────────────────

app.get("/drizzle/users", async (_req: Request, res: Response) => {
  try {
    const users = await drizzleDb.select().from(drizzleSchema.users);
    reqLog.info("Drizzle: fetched users", { count: users.length });
    res.json(users);
  } catch (err: any) {
    reqLog.error("Drizzle: failed to fetch users", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post("/drizzle/users", async (req: Request, res: Response) => {
  const { name, email } = req.body ?? {};
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }
  try {
    const [user] = await drizzleDb
      .insert(drizzleSchema.users)
      .values({ name, email })
      .returning();
    reqLog.info("Drizzle: created user", { name, email });
    res.status(201).json(user);
  } catch (err: any) {
    reqLog.error("Drizzle: failed to create user", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Raw pg Routes ───────────────────────────────────────────────────────────

app.get("/pg/users", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT id, name, email, created_at FROM users ORDER BY id");
    reqLog.info("pg: fetched users", { count: result.rows.length });
    res.json(result.rows);
  } catch (err: any) {
    reqLog.error("pg: failed to fetch users", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post("/pg/users", async (req: Request, res: Response) => {
  const { name, email } = req.body ?? {};
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }
  try {
    const result = await pool.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at",
      [name, email],
    );
    reqLog.info("pg: created user", { name, email });
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    reqLog.error("pg: failed to create user", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Mongoose Routes ─────────────────────────────────────────────────────────

app.get("/mongo/items", async (_req: Request, res: Response) => {
  try {
    const items = await Item.find().lean();
    reqLog.info("Mongoose: fetched items", { count: items.length });
    res.json(items);
  } catch (err: any) {
    reqLog.error("Mongoose: failed to fetch items", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post("/mongo/items", async (req: Request, res: Response) => {
  const { name, value } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const item = await Item.create({ name, value });
    reqLog.info("Mongoose: created item", { name });
    res.status(201).json(item);
  } catch (err: any) {
    reqLog.error("Mongoose: failed to create item", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Redis Routes ────────────────────────────────────────────────────────────

app.get("/redis/get/:key", async (req: Request, res: Response) => {
  const key = req.params["key"] ?? "";
  try {
    const value = await redis.get(key);
    reqLog.info("Redis: GET", { key, found: value !== null });
    res.json({ key, value });
  } catch (err: any) {
    reqLog.error("Redis: GET failed", { key, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post("/redis/set", async (req: Request, res: Response) => {
  const { key, value } = req.body ?? {};
  if (!key || value === undefined) {
    res.status(400).json({ error: "key and value are required" });
    return;
  }
  try {
    await redis.set(key, String(value));
    reqLog.info("Redis: SET", { key });
    res.json({ key, value, status: "OK" });
  } catch (err: any) {
    reqLog.error("Redis: SET failed", { key, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get("/redis/cached-users", async (_req: Request, res: Response) => {
  const cacheKey = "cached:users";
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      reqLog.info("Redis: cache HIT for users");
      res.json({ source: "cache", data: JSON.parse(cached) });
      return;
    }
    const users = await prisma.user.findMany();
    await redis.set(cacheKey, JSON.stringify(users), "EX", 60);
    reqLog.info("Redis: cache MISS — fetched from Prisma & cached", { count: users.length });
    res.json({ source: "db", data: users });
  } catch (err: any) {
    reqLog.error("Redis: cached-users failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── HTTP Routes (outbound calls) ────────────────────────────────────────────

app.get("/http/external", async (_req: Request, res: Response) => {
  try {
    const [axiosRes, fetchRes] = await Promise.all([
      axios.get("https://jsonplaceholder.typicode.com/posts?_limit=3"),
      fetch("https://jsonplaceholder.typicode.com/posts?_limit=3").then((r) => r.json()),
    ]);
    reqLog.info("HTTP: fetched external data", {
      axiosCount: axiosRes.data.length,
      fetchCount: (fetchRes as any[]).length,
    });
    res.json({ axios: axiosRes.data, fetch: fetchRes });
  } catch (err: any) {
    reqLog.error("HTTP: external call failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Error Routes (for alert/insight testing) ────────────────────────────────

app.get("/error/random", (_req: Request, res: Response) => {
  if (Math.random() < 0.5) {
    reqLog.error("Random error triggered");
    res.status(500).json({ error: "Random failure" });
    return;
  }
  reqLog.info("Random route — success this time");
  res.json({ status: "ok" });
});

app.get("/error/slow", async (_req: Request, res: Response) => {
  reqLog.warn("Slow route — sleeping 3s");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  res.json({ status: "ok", delay: "3s" });
});

// ─── DB Connection & Server Startup ──────────────────────────────────────────

async function ensurePostgresTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info("PostgreSQL tables ensured");
  } catch (err: any) {
    logger.error("Failed to create PostgreSQL tables", { error: err.message });
  }
}

async function start(): Promise<void> {
  // Connect to databases in parallel.
  const [pgOk, mongoOk, redisOk] = await Promise.all([
    pool
      .query("SELECT 1")
      .then(() => {
        logger.info("PostgreSQL connected", { url: DATABASE_URL.replace(/\/\/.*@/, "//***@") });
        return true;
      })
      .catch((err) => {
        logger.error("PostgreSQL connection failed — pg/prisma/drizzle routes will error", {
          error: err.message,
        });
        return false;
      }),
    mongoose
      .connect(MONGO_URL)
      .then(() => {
        logger.info("MongoDB connected", { url: MONGO_URL });
        return true;
      })
      .catch((err) => {
        logger.error("MongoDB connection failed — /mongo routes will error", {
          error: err.message,
        });
        return false;
      }),
    redis
      .ping()
      .then(() => {
        logger.info("Redis connected", { url: REDIS_URL });
        return true;
      })
      .catch((err) => {
        logger.error("Redis connection failed — /redis routes will error", {
          error: err.message,
        });
        return false;
      }),
  ]);

  if (pgOk) {
    await ensurePostgresTables();
  }

  const PORT = Number(process.env["PORT"]) || 3000;
  app.listen(PORT, () => {
    logger.info("server started", {
      port: PORT,
      url: `http://localhost:${PORT}`,
      postgres: pgOk,
      mongo: mongoOk,
      redis: redisOk,
    });
    logger.info("dashboard available", { url: "http://localhost:4000" });
  });
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  logger.info("Shutting down...");
  await Promise.allSettled([
    pool.end().catch(() => {}),
    prisma.$disconnect().catch(() => {}),
    mongoose.disconnect().catch(() => {}),
    redis.quit().catch(() => {}),
  ]);
  logger.info("All connections closed");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  logger.error("Fatal startup error", { error: err.message });
  process.exit(1);
});

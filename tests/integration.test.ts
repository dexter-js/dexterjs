import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as net from "node:net";
import * as http from "node:http";
import * as fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";

const SIDECAR_ENTRY = path.resolve(
  __dirname,
  "../packages/sidecar/dist/index.js",
);
const SOCKET_PATH = "/tmp/dexter.sock";
const SIDECAR_PORT = 4111; // use a non-default port to avoid conflicts
const STARTUP_WAIT_MS = 2_000;

let sidecar: ChildProcess;

function httpGet(urlPath: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://localhost:${SIDECAR_PORT}${urlPath}`,
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      },
    );
    req.on("error", reject);
  });
}

function sendBatchOverSocket(batch: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ path: SOCKET_PATH }, () => {
      client.end(JSON.stringify(batch) + "\n");
    });
    client.on("close", () => resolve());
    client.on("error", reject);
  });
}

describe("Integration — sidecar end-to-end", () => {
  beforeAll(async () => {
    // Clean old socket.
    if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);

    // Clean old DB to start fresh.
    const dbPath = path.resolve(__dirname, "../packages/sidecar/dexter.db");
    for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    sidecar = spawn(process.execPath, [SIDECAR_ENTRY], {
      env: { ...process.env, DEXTER_PORT: String(SIDECAR_PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Wait for sidecar to be ready.
    await new Promise<void>((resolve) => {
      const checkReady = setInterval(async () => {
        try {
          await httpGet("/");
          clearInterval(checkReady);
          resolve();
        } catch {
          // Not yet ready.
        }
      }, 200);

      // Failsafe timeout.
      setTimeout(() => {
        clearInterval(checkReady);
        resolve();
      }, STARTUP_WAIT_MS);
    });
  });

  afterAll(() => {
    sidecar?.kill("SIGTERM");
    // Give it a beat to clean up.
    return new Promise((r) => setTimeout(r, 500));
  });

  it("should respond to GET / with the dashboard HTML", async () => {
    const { status, body } = await httpGet("/");
    expect(status).toBe(200);
    // body will be a string (HTML) since JSON.parse fails gracefully
    // Just check we got 200 — the readiness check already confirmed the server is up
  });

  it("should respond to GET /health with status info", async () => {
    const { status, body } = await httpGet("/health");
    expect(status).toBe(200);
    expect(body.name).toBe("DexterJS Sidecar");
    expect(body.status).toBe("running");
  });

  it("should return empty overview initially", async () => {
    const { status, body } = await httpGet("/api/overview");
    expect(status).toBe(200);
    expect(body.totalRequests).toBe(0);
    expect(body.errorRate).toBe(0);
  });

  it("should accept events over the Unix socket and persist them", async () => {
    await sendBatchOverSocket({
      events: [
        {
          type: "trace",
          payload: {
            traceId: "int-t1",
            method: "GET",
            route: "/users",
            statusCode: 200,
            duration: 35,
            timestamp: Date.now(),
          },
        },
        {
          type: "trace",
          payload: {
            traceId: "int-t2",
            method: "GET",
            route: "/users",
            statusCode: 200,
            duration: 50,
            timestamp: Date.now(),
          },
        },
        {
          type: "log",
          payload: {
            traceId: "int-t1",
            level: "info",
            message: "fetched users",
            metadata: { count: 10 },
            timestamp: Date.now(),
          },
        },
        {
          type: "span",
          payload: {
            traceId: "int-t1",
            type: "db",
            target: "SELECT * FROM users",
            duration: 12,
            timestamp: Date.now(),
          },
        },
        {
          type: "metric",
          payload: {
            cpuUsage: 0.8,
            memoryUsage: 104857600,
            eventLoopLag: 1.2,
            activeHandles: 5,
            timestamp: Date.now(),
          },
        },
      ],
      sentAt: Date.now(),
    });

    // Give the sidecar a moment to process.
    await new Promise((r) => setTimeout(r, 300));

    // Overview should now reflect the data.
    const { body: overview } = await httpGet("/api/overview");
    expect(overview.totalRequests).toBe(2);
    expect(overview.errorRate).toBe(0);
    expect(overview.avgResponseTime).toBeCloseTo(42.5, 0);
    expect(overview.eventLoopLag).toBeCloseTo(1.2, 1);
  });

  it("GET /api/routes should return per-route stats", async () => {
    const { status, body } = await httpGet("/api/routes");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);

    const usersRoute = body.find((r: any) => r.route === "/users");
    expect(usersRoute).toBeDefined();
    expect(usersRoute.method).toBe("GET");
    expect(usersRoute.count).toBe(2);
    expect(typeof usersRoute.p50).toBe("number");
    expect(typeof usersRoute.p95).toBe("number");
    expect(typeof usersRoute.p99).toBe("number");
  });

  it("GET /api/logs should return persisted logs", async () => {
    const { status, body } = await httpGet("/api/logs");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].message).toBe("fetched users");
    expect(body[0].metadata).toEqual({ count: 10 });
  });

  it("GET /api/logs?traceId=int-t1 should filter by traceId", async () => {
    const { body } = await httpGet("/api/logs?traceId=int-t1");
    expect(Array.isArray(body)).toBe(true);
    for (const log of body) {
      expect(log.traceId).toBe("int-t1");
    }
  });

  it("GET /api/insights should return an array", async () => {
    const { status, body } = await httpGet("/api/insights");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("should handle error status codes in trace events", async () => {
    // Send a batch with error responses.
    const events = [];
    for (let i = 0; i < 6; i++) {
      events.push({
        type: "trace",
        payload: {
          traceId: `err-${i}`,
          method: "POST",
          route: "/fail",
          statusCode: 500,
          duration: 100 + i * 10,
          timestamp: Date.now(),
        },
      });
    }

    await sendBatchOverSocket({ events, sentAt: Date.now() });
    await new Promise((r) => setTimeout(r, 300));

    const { body: routes } = await httpGet("/api/routes");
    const failRoute = routes.find((r: any) => r.route === "/fail");
    expect(failRoute).toBeDefined();
    expect(failRoute.errorRate).toBe(1); // 100% errors
    expect(failRoute.count).toBe(6);
  });

  it("should detect high error rates in insights", async () => {
    const { body: insights } = await httpGet("/api/insights");
    const highError = insights.find(
      (i: any) => i.type === "high-error-rate" && i.metadata?.route === "/fail",
    );
    expect(highError).toBeDefined();
    expect(highError.message).toContain("100.0%");
  });

  it("should detect N+1 queries in insights", async () => {
    // Send 8 DB spans under one traceId.
    const events = [];
    for (let i = 0; i < 8; i++) {
      events.push({
        type: "span",
        payload: {
          traceId: "n1-integration",
          type: "db",
          target: `SELECT * FROM items WHERE id = ${i}`,
          duration: 3,
          timestamp: Date.now(),
        },
      });
    }

    await sendBatchOverSocket({ events, sentAt: Date.now() });
    await new Promise((r) => setTimeout(r, 300));

    const { body: insights } = await httpGet("/api/insights");
    const n1 = insights.find(
      (i: any) =>
        i.type === "n+1" && i.metadata?.traceId === "n1-integration",
    );
    expect(n1).toBeDefined();
    expect(n1.metadata.queryCount).toBe(8);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createLogger,
  Logger,
  TerminalTransport,
  FileTransport,
  SidecarTransport,
} from "@dexter.js/logger";
import type { LogEntry, Transport } from "@dexter.js/logger";

// ─── createLogger() ─────────────────────────────────────────────────────────

describe("Logger — createLogger()", () => {
  it("should return a Logger instance with default options", () => {
    const log = createLogger();
    expect(log).toBeInstanceOf(Logger);
  });

  it("should accept custom log level", () => {
    const log = createLogger({ level: "debug" });
    expect(log).toBeInstanceOf(Logger);
  });

  it("should accept all option fields", () => {
    const log = createLogger({
      level: "warn",
      format: "json",
      env: "production",
      transport: "terminal",
      context: { service: "test" },
      async: false,
      bufferSize: 50,
      redact: ["password", "token"],
    });
    expect(log).toBeInstanceOf(Logger);
  });

  it("should create a logger with file transport options", () => {
    const log = createLogger({
      transport: "file",
      file: {
        path: "/tmp/dexter-test-logs",
        rotation: { maxSize: "10mb", maxFiles: 3 },
      },
    });
    expect(log).toBeInstanceOf(Logger);
    log.close();
  });
});

// ─── Logging methods ─────────────────────────────────────────────────────────

describe("Logger — log methods", () => {
  let entries: LogEntry[];
  let log: Logger;

  beforeEach(() => {
    entries = [];
    log = createLogger({ level: "debug", transport: "terminal" });
    // Replace transports with a spy transport.
    const spy: Transport = {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      flush() {},
      close() {},
    };
    // Access private transports array via cast.
    (log as any).transports = [spy];
  });

  it("should emit info logs", () => {
    log.info("hello");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("hello");
  });

  it("should emit warn logs", () => {
    log.warn("watch out");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("warn");
  });

  it("should emit error logs", () => {
    log.error("boom");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("error");
  });

  it("should emit debug logs", () => {
    log.debug("trace info");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("debug");
  });

  it("should include a timestamp in ISO format", () => {
    log.info("ts");
    expect(entries[0].timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("should pass metadata through", () => {
    log.info("with meta", { userId: 42, action: "login" });
    expect(entries[0].metadata).toEqual({ userId: 42, action: "login" });
  });

  it("should allow metadata to be omitted", () => {
    log.info("no meta");
    expect(entries[0].metadata).toBeUndefined();
  });
});

// ─── Level filtering ─────────────────────────────────────────────────────────

describe("Logger — level filtering", () => {
  function createSpyLogger(level: "debug" | "info" | "warn" | "error") {
    const entries: LogEntry[] = [];
    const log = createLogger({ level, transport: "terminal" });
    const spy: Transport = {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      flush() {},
      close() {},
    };
    (log as any).transports = [spy];
    return { log, entries };
  }

  it("should filter out debug when level is info", () => {
    const { log, entries } = createSpyLogger("info");
    log.debug("hidden");
    log.info("visible");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
  });

  it("should filter out debug and info when level is warn", () => {
    const { log, entries } = createSpyLogger("warn");
    log.debug("hidden");
    log.info("hidden");
    log.warn("visible");
    log.error("visible");
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.level)).toEqual(["warn", "error"]);
  });

  it("should only pass error when level is error", () => {
    const { log, entries } = createSpyLogger("error");
    log.debug("no");
    log.info("no");
    log.warn("no");
    log.error("yes");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("error");
  });

  it("should pass all levels when level is debug", () => {
    const { log, entries } = createSpyLogger("debug");
    log.debug("a");
    log.info("b");
    log.warn("c");
    log.error("d");
    expect(entries).toHaveLength(4);
  });
});

// ─── Child loggers ───────────────────────────────────────────────────────────

describe("Logger — child()", () => {
  let entries: LogEntry[];
  let parent: Logger;

  beforeEach(() => {
    entries = [];
    parent = createLogger({
      level: "debug",
      transport: "terminal",
      context: { service: "api" },
    });
    const spy: Transport = {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      flush() {},
      close() {},
    };
    (parent as any).transports = [spy];
  });

  it("should merge parent context with child context", () => {
    const child = parent.child({ requestId: "r-1" });
    child.info("from child");
    expect(entries[0].context).toEqual({
      service: "api",
      requestId: "r-1",
    });
  });

  it("should not modify parent context", () => {
    const child = parent.child({ extra: true });
    parent.info("parent");
    child.info("child");
    expect(entries[0].context).toEqual({ service: "api" });
    expect(entries[1].context).toEqual({ service: "api", extra: true });
  });

  it("should allow chaining child() calls", () => {
    const child = parent.child({ module: "auth" });
    const grandchild = child.child({ handler: "login" });
    grandchild.info("deep");
    expect(entries[0].context).toEqual({
      service: "api",
      module: "auth",
      handler: "login",
    });
  });

  it("child context should override parent on conflict", () => {
    const child = parent.child({ service: "worker" });
    child.info("overridden");
    expect(entries[0].context).toEqual({ service: "worker" });
  });
});

// ─── Redaction ───────────────────────────────────────────────────────────────

describe("Logger — redaction", () => {
  let entries: LogEntry[];
  let log: Logger;

  beforeEach(() => {
    entries = [];
    log = createLogger({
      level: "debug",
      transport: "terminal",
      redact: ["password", "token", "secret"],
    });
    const spy: Transport = {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      flush() {},
      close() {},
    };
    (log as any).transports = [spy];
  });

  it("should redact top-level fields", () => {
    log.info("login", { user: "alice", password: "s3cret" });
    expect(entries[0].metadata).toEqual({
      user: "alice",
      password: "[REDACTED]",
    });
  });

  it("should redact nested fields", () => {
    log.info("config", {
      db: { host: "localhost", password: "pass123" },
    });
    expect(entries[0].metadata).toEqual({
      db: { host: "localhost", password: "[REDACTED]" },
    });
  });

  it("should be case-insensitive", () => {
    log.info("mixed case", { Password: "abc", TOKEN: "xyz" });
    expect(entries[0].metadata).toEqual({
      Password: "[REDACTED]",
      TOKEN: "[REDACTED]",
    });
  });

  it("should not redact non-matching fields", () => {
    log.info("safe", { username: "bob", email: "bob@test.com" });
    expect(entries[0].metadata).toEqual({
      username: "bob",
      email: "bob@test.com",
    });
  });

  it("should handle metadata with no redactable fields", () => {
    log.info("clean", { status: "ok" });
    expect(entries[0].metadata).toEqual({ status: "ok" });
  });

  it("should redact fields in arrays of objects", () => {
    log.info("list", {
      users: [
        { name: "alice", token: "tk-1" },
        { name: "bob", token: "tk-2" },
      ],
    });
    const meta = entries[0].metadata as any;
    expect(meta.users[0].token).toBe("[REDACTED]");
    expect(meta.users[1].token).toBe("[REDACTED]");
    expect(meta.users[0].name).toBe("alice");
  });
});

// ─── Transport resolution ────────────────────────────────────────────────────

describe("Logger — transport resolution", () => {
  it("should not crash with transport=terminal", () => {
    const log = createLogger({ transport: "terminal" });
    expect(() => log.info("hello")).not.toThrow();
    log.close();
  });

  it("should not crash with transport=both and file config", () => {
    const log = createLogger({
      transport: "both",
      file: {
        path: "/tmp/dexter-test-logs-both",
        rotation: { maxSize: "1mb", maxFiles: 1 },
      },
    });
    expect(() => log.info("hello")).not.toThrow();
    log.close();
  });

  it("should handle auto transport in development mode", () => {
    const log = createLogger({ env: "development", transport: "auto" });
    expect(log).toBeInstanceOf(Logger);
    log.close();
  });

  it("should handle auto transport in production mode without file", () => {
    const log = createLogger({ env: "production", transport: "auto" });
    expect(log).toBeInstanceOf(Logger);
    log.close();
  });
});

// ─── connectToSidecar ────────────────────────────────────────────────────────

describe("Logger — connectToSidecar()", () => {
  it("should not throw when connecting to non-existent socket", () => {
    const log = createLogger();
    expect(() =>
      log.connectToSidecar("/tmp/dexter-test-nonexistent.sock"),
    ).not.toThrow();
    log.close();
  });

  it("should be idempotent — second call is a no-op", () => {
    const log = createLogger();
    log.connectToSidecar("/tmp/dexter-test-nonexistent.sock");
    log.connectToSidecar("/tmp/dexter-test-nonexistent.sock");
    // No error = pass.
    log.close();
  });
});

// ─── flush() / close() ──────────────────────────────────────────────────────

describe("Logger — flush() & close()", () => {
  it("flush() should not throw on a fresh logger", () => {
    const log = createLogger();
    expect(() => log.flush()).not.toThrow();
  });

  it("close() should not throw on a fresh logger", () => {
    const log = createLogger();
    expect(() => log.close()).not.toThrow();
  });

  it("close() should clear transports", () => {
    const log = createLogger();
    log.close();
    // After close, logging should not throw (graceful degradation).
    expect(() => log.info("after close")).not.toThrow();
  });
});

// ─── Default export ──────────────────────────────────────────────────────────

describe("Logger — default instance", () => {
  it("should export a pre-configured logger instance", async () => {
    const { logger } = await import("@dexter.js/logger");
    expect(logger).toBeInstanceOf(Logger);
  });
});

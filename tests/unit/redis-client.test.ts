import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import {
  attachRedisErrorListener,
  buildRedisOptions,
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_CONNECT_TIMEOUT_MS,
  REDIS_ERROR_LOG_INTERVAL_MS,
  REDIS_MAX_RETRIES_PER_REQUEST,
} from "@/infrastructure/security/redis-client";

// These tests never construct an ioredis client, so no connection is opened.

describe("buildRedisOptions", () => {
  it("sets connect and command timeouts and a bounded retry count", () => {
    const options = buildRedisOptions();

    expect(options.connectTimeout).toBe(REDIS_CONNECT_TIMEOUT_MS);
    expect(options.commandTimeout).toBe(REDIS_COMMAND_TIMEOUT_MS);
    expect(options.maxRetriesPerRequest).toBe(REDIS_MAX_RETRIES_PER_REQUEST);
    expect(Number.isInteger(options.maxRetriesPerRequest)).toBe(true);
    expect(options.maxRetriesPerRequest).toBeLessThanOrEqual(3);
    expect(options.connectTimeout).toBeGreaterThan(0);
    expect(options.commandTimeout).toBeGreaterThan(0);
  });

  it("uses the intended timeout values, with the command timeout above the connect timeout", () => {
    const options = buildRedisOptions();

    expect(REDIS_CONNECT_TIMEOUT_MS).toBe(2_000);
    expect(REDIS_COMMAND_TIMEOUT_MS).toBe(5_000);
    expect(options.connectTimeout).toBe(2_000);
    expect(options.commandTimeout).toBe(5_000);
    // The command timer also runs while a command waits for the first
    // connection, so it must not be shorter than the connect timeout.
    expect(options.commandTimeout!).toBeGreaterThan(options.connectTimeout!);
  });

  it("keeps the previous connection behavior", () => {
    const options = buildRedisOptions();
    expect(options.enableReadyCheck).toBe(true);
    expect(options.lazyConnect).toBe(false);
  });
});

describe("attachRedisErrorListener", () => {
  it("registers a listener so an emitted error is not unhandled", () => {
    const emitter = new EventEmitter();
    attachRedisErrorListener(emitter, () => undefined);

    expect(emitter.listenerCount("error")).toBe(1);
    expect(() => emitter.emit("error", new Error("boom"))).not.toThrow();
  });

  it("logs only the error code, never the message or URL", () => {
    const emitter = new EventEmitter();
    const logs: string[] = [];
    attachRedisErrorListener(emitter, (message) => logs.push(message));

    const error = Object.assign(
      new Error("connect ECONNREFUSED redis://user:secret@host:6379"),
      { code: "ECONNREFUSED" },
    );
    emitter.emit("error", error);

    expect(logs).toEqual(["Redis client error (ECONNREFUSED)."]);
    expect(logs.join(" ")).not.toContain("secret");
  });

  it("falls back to the error name, then to 'unknown'", () => {
    const emitter = new EventEmitter();
    const logs: string[] = [];
    let clock = 0;
    attachRedisErrorListener(
      emitter,
      (message) => logs.push(message),
      () => clock,
    );

    emitter.emit("error", new TypeError("x"));
    clock += REDIS_ERROR_LOG_INTERVAL_MS;
    emitter.emit("error", "not an error object");

    expect(logs).toEqual([
      "Redis client error (TypeError).",
      "Redis client error (unknown).",
    ]);
  });

  it("throttles repeated errors to one log per interval", () => {
    const emitter = new EventEmitter();
    const logs: string[] = [];
    let clock = 1_000;
    attachRedisErrorListener(
      emitter,
      (message) => logs.push(message),
      () => clock,
    );

    emitter.emit("error", new Error("a"));
    clock += 1_000;
    emitter.emit("error", new Error("b"));
    emitter.emit("error", new Error("c"));
    expect(logs).toHaveLength(1);

    clock += REDIS_ERROR_LOG_INTERVAL_MS;
    emitter.emit("error", new Error("d"));
    expect(logs).toHaveLength(2);
  });
});

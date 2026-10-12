import { describe, expect, it } from "vitest";
import { MIN_WORKED_MS, sessionSignalFor } from "./session-signals";

describe("sessionSignalFor", () => {
  it("marks a real turn that ends idle or waiting for input as completed", () => {
    expect(sessionSignalFor("working", "idle", MIN_WORKED_MS)).toBe("completed");
    expect(sessionSignalFor("working", "awaiting-input", MIN_WORKED_MS + 1)).toBe("completed");
  });

  it("ignores a turn too short to be news", () => {
    expect(sessionSignalFor("working", "idle", MIN_WORKED_MS - 1)).toBeNull();
  });

  it("does not treat a wait for approval as the end of a turn", () => {
    expect(sessionSignalFor("working", "awaiting-approval", MIN_WORKED_MS)).toBeNull();
  });

  it("marks any fall into error as failed, once", () => {
    expect(sessionSignalFor("working", "error", 0)).toBe("failed");
    expect(sessionSignalFor("starting", "error", 0)).toBe("failed");
    expect(sessionSignalFor("error", "error", 0)).toBeNull();
  });

  it("leaves resting transitions alone", () => {
    expect(sessionSignalFor("idle", "working", MIN_WORKED_MS)).toBeNull();
    expect(sessionSignalFor("awaiting-input", "idle", MIN_WORKED_MS)).toBeNull();
    expect(sessionSignalFor("idle", "exited", MIN_WORKED_MS)).toBeNull();
  });
});

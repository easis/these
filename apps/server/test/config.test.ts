import { beforeEach, describe, expect, it, vi } from "vitest";

const dotenvFlowMocks = vi.hoisted(() => ({
  listFiles: vi.fn((): string[] => []),
  load: vi.fn((): { parsed?: Record<string, string>; error?: Error } => ({ parsed: {} })),
}));

vi.mock("dotenv-flow", () => ({
  default: dotenvFlowMocks,
}));

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dotenvFlowMocks.listFiles.mockReturnValue([]);
    dotenvFlowMocks.load.mockReturnValue({ parsed: {} });
  });

  it("uses process configuration when no environment files exist", async () => {
    const config = await loadConfig({ dataDir: "/tmp/these-config-test" });

    expect(config.dataDir).toBe("/tmp/these-config-test");
    expect(dotenvFlowMocks.listFiles).toHaveBeenCalledWith({
      path: expect.any(String),
      node_env: process.env.NODE_ENV ?? "development",
    });
    expect(dotenvFlowMocks.load).not.toHaveBeenCalled();
  });

  it("propagates errors from environment files that do exist", async () => {
    const error = new Error("invalid environment file");
    dotenvFlowMocks.listFiles.mockReturnValue(["/app/.env.production"]);
    dotenvFlowMocks.load.mockReturnValue({ error });

    await expect(loadConfig({ dataDir: "/tmp/these-config-test" })).rejects.toBe(error);
  });
});

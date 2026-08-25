import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { statMediaPage } from "../src/services/directory-media.js";

describe("statMediaPage", () => {
  let temporary: string | undefined;

  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  it("omits a directory entry that disappeared without dropping the rest", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-stat-page-test-"));
    await writeFile(path.join(temporary, "present.jpg"), "present");

    const files = await statMediaPage(temporary, temporary, ["missing.jpg", "present.jpg"]);

    expect(files.map((file) => file.name)).toEqual(["present.jpg"]);
  });
});

import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertPathInsideRoot, resolveUserPath } from "../../packages/shared/src/index.js";

describe("filesystem helpers", () => {
  test("resolveUserPath resolves relative paths from cwd", () => {
    const cwd = path.join("C:", "workspace", "repo");
    expect(resolveUserPath("files/demo.txt", cwd)).toBe(path.join(cwd, "files", "demo.txt"));
  });

  test("assertPathInsideRoot allows paths inside the root", () => {
    const root = path.join("C:", "workspace", "repo");
    const target = path.join(root, "nested", "file.txt");
    expect(assertPathInsideRoot(root, target)).toBe(target);
  });

  test("assertPathInsideRoot rejects traversal outside the root", () => {
    const root = path.join("C:", "workspace", "repo");
    const outside = path.join(root, "..", "secrets.txt");
    expect(() => assertPathInsideRoot(root, outside)).toThrow(/must stay within/i);
  });
});

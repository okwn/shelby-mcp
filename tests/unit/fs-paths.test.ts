import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertPathInsideRoot,
  isAbsoluteUserPath,
  isWindowsAbsolutePath,
  resolveUserPath
} from "../../packages/shared/src/index.js";

describe("filesystem helpers", () => {
  test("detects POSIX, Windows, and relative user paths", () => {
    expect(isWindowsAbsolutePath(path.win32.normalize("C:/workspace/repo/file.txt"))).toBe(true);
    expect(isAbsoluteUserPath(path.win32.normalize("C:/workspace/repo/file.txt"))).toBe(true);
    expect(isAbsoluteUserPath(path.posix.join("/workspace", "repo", "file.txt"))).toBe(true);
    expect(isAbsoluteUserPath("files/demo.txt")).toBe(false);
  });

  test("resolveUserPath resolves relative POSIX paths from a POSIX cwd", () => {
    const cwd = path.posix.join("/workspace", "repo");
    expect(resolveUserPath("files/demo.txt", cwd)).toBe(
      path.posix.join("/workspace", "repo", "files", "demo.txt")
    );
  });

  test("resolveUserPath preserves POSIX absolute paths", () => {
    const absolutePath = path.posix.join("/workspace", "repo", "files", "demo.txt");
    expect(resolveUserPath(absolutePath, path.posix.join("/tmp", "sandbox"))).toBe(absolutePath);
  });

  test("resolveUserPath preserves Windows absolute paths on non-Windows hosts", () => {
    const windowsPath = path.win32.normalize("C:/workspace/repo/files/demo.txt");
    expect(resolveUserPath(windowsPath, path.posix.join("/home", "runner", "work"))).toBe(
      windowsPath
    );
  });

  test("resolveUserPath resolves relative paths from a Windows cwd", () => {
    const cwd = path.win32.normalize("C:/workspace/repo");
    expect(resolveUserPath("files/demo.txt", cwd)).toBe(
      path.win32.normalize("C:/workspace/repo/files/demo.txt")
    );
  });

  test("assertPathInsideRoot allows POSIX paths inside the root", () => {
    const root = path.posix.join("/workspace", "repo");
    const target = path.posix.join(root, "nested", "file.txt");
    expect(assertPathInsideRoot(root, target)).toBe(target);
  });

  test("assertPathInsideRoot allows Windows-style paths inside the root", () => {
    const root = path.win32.normalize("C:/workspace/repo");
    const target = path.win32.normalize("C:/workspace/repo/nested/file.txt");
    expect(assertPathInsideRoot(root, target)).toBe(target);
  });

  test("assertPathInsideRoot rejects traversal outside a POSIX root", () => {
    const root = path.posix.join("/workspace", "repo");
    const outside = path.posix.join("/workspace", "secrets.txt");
    expect(() => assertPathInsideRoot(root, outside)).toThrow(/must stay within/i);
  });

  test("assertPathInsideRoot rejects traversal outside a Windows root", () => {
    const root = path.win32.normalize("C:/workspace/repo");
    const outside = path.win32.normalize("C:/workspace/secrets.txt");
    expect(() => assertPathInsideRoot(root, outside)).toThrow(/must stay within/i);
  });

  test("assertPathInsideRoot rejects mixed absolute path styles", () => {
    const root = path.posix.join("/workspace", "repo");
    const target = path.win32.normalize("C:/workspace/repo/file.txt");
    expect(() => assertPathInsideRoot(root, target)).toThrow(/must stay within/i);
  });
});

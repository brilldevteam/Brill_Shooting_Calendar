import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  hashPassword,
  verifyPassword,
  tokenHash,
} from "../src/server/passwords";
import { privateFilePath } from "../src/server/storage";
describe("Local authentication and private storage", () => {
  it("hashes passwords with unique salts and verifies without storing plaintext", async () => {
    const p = "Correct horse battery staple";
    const a = await hashPassword(p),
      b = await hashPassword(p);
    expect(a).not.toContain(p);
    expect(a).not.toBe(b);
    expect(await verifyPassword(p, a)).toBe(true);
    expect(await verifyPassword("incorrect-password", a)).toBe(false);
  });
  it("enforces password bounds and rejects malformed hashes", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
    expect(await verifyPassword("password", "bad")).toBe(false);
    expect(await verifyPassword("x".repeat(257), "bad")).toBe(false);
  });
  it("stores only a digest of opaque session tokens", () => {
    expect(tokenHash("secret-token")).toHaveLength(64);
    expect(tokenHash("secret-token")).not.toContain("secret-token");
  });
  it("rejects path traversal and absolute upload paths", () => {
    expect(() => privateFilePath("../outside.txt")).toThrow();
    expect(() => privateFilePath("D:\\outside.txt")).toThrow();
    expect(() => privateFilePath("/outside.txt")).toThrow();
    expect(privateFilePath("org/booking/script.pdf")).toContain("uploads");
  });
});

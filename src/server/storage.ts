import "server-only";
import { resolve, sep } from "node:path";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
export function privateFilePath(relativePath: string) {
  const root = resolve(process.env.APP_DATA_DIR || ".data", "uploads");
  const path = resolve(root, relativePath);
  if (
    !path.startsWith(root + sep) ||
    relativePath.includes("..") ||
    relativePath.includes("\\")
  )
    throw new Error("Invalid file path");
  return path;
}
export async function storeFile(path: string, bytes: Uint8Array) {
  const full = privateFilePath(path);
  await mkdir(resolve(full, ".."), { recursive: true });
  await writeFile(full, bytes, { flag: "wx", mode: 0o600 });
}
export async function readPrivateFile(path: string) {
  return readFile(privateFilePath(path));
}
export async function removePrivateFile(path: string) {
  await unlink(privateFilePath(path));
}

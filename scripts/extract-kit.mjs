import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const [instructionPath, outputPath] = process.argv.slice(2);
if (!instructionPath || !outputPath) throw new Error("Usage: node extract-kit.mjs instruction.md output.zip");
const text = readFileSync(instructionPath, "utf8");
const expected = text.match(/^KIT_SHA256: ([a-f0-9]{64})\r?$/m)?.[1];
const encoded = text.match(/^<!-- BB_KIT_BASE64_BEGIN -->\r?\n([A-Za-z0-9+/=\s]+?)\r?\n<!-- BB_KIT_BASE64_END -->\r?$/m)?.[1];
if (!expected || !encoded) throw new Error("Missing bundle metadata");
const base64 = encoded.replace(/\s/g, "");
if (base64.length % 4 !== 0) throw new Error("Invalid base64 length");
const data = Buffer.from(base64, "base64");
if (data.toString("base64") !== base64) throw new Error("Invalid base64");
const digest = createHash("sha256").update(data).digest("hex");
if (digest !== expected) throw new Error("Bundle SHA-256 mismatch; nothing written");
const output = resolve(outputPath);
if (existsSync(output)) {
  const old = createHash("sha256").update(readFileSync(output)).digest("hex");
  if (old !== expected) throw new Error("Different file already exists; refusing overwrite");
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, data, { flag: "wx" });
}
console.log(JSON.stringify({ output, bytes: data.length, sha256: digest, verified: true }));

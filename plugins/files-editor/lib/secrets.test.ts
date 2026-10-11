import { describe, expect, it } from "vitest";
import { isSensitivePath } from "./secrets.js";

describe("isSensitivePath", () => {
  it("flags the listed secret folders and files, and what is inside them", () => {
    for (const path of [
      ".ssh",
      ".ssh/id_ed25519",
      ".gnupg/private-keys-v1.d/key.key",
      ".secrets/telegram.txt",
      ".aws/credentials",
      ".git-credentials",
      ".netrc",
      ".claude.json",
    ]) {
      expect(isSensitivePath(path)).toBe(true);
    }
  });

  it("flags a credentials folder anywhere in a repository, in any case", () => {
    expect(isSensitivePath("_CREDENTIALS/yandex.json")).toBe(true);
    expect(isSensitivePath("projects/app/_credentials/token")).toBe(true);
  });

  it("flags .env files but not their committed templates", () => {
    expect(isSensitivePath(".env")).toBe(true);
    expect(isSensitivePath("deploy/.env.production")).toBe(true);
    expect(isSensitivePath(".env.example")).toBe(false);
    expect(isSensitivePath("app/.env.sample")).toBe(false);
  });

  it("leaves ordinary files alone, including look-alikes", () => {
    for (const path of ["README.md", "docs/ssh-setup.md", ".sshrc-notes/x", "env.md", ".environment", "src/.envy"]) {
      expect(isSensitivePath(path)).toBe(false);
    }
  });
});

// src/ is also published to npm as a package of its own (Explorer_vibecom takes
// the viewers from there). Its package.json has to declare every package the
// code imports, at the same version the plugin itself runs with.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const SRC = new URL("../src/", import.meta.url);
const readJson = (url: URL) => JSON.parse(readFileSync(url, "utf8"));
const plugin = readJson(new URL("../package.json", import.meta.url));
const library = readJson(new URL("package.json", SRC));
// BB's bundler supplies these at runtime; the package lists them as optional peers.
const PEERS = ["react", "@get-bb/plugin-sdk"];

const packageOf = (specifier: string) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");

function importedPackages(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(SRC).filter((name) => /\.tsx?$/.test(name))) {
    const code = readFileSync(new URL(file, SRC), "utf8");
    const statements = /^\s*(?:import|export)\b[^;]*?(?:\sfrom\s*|import\s*)"([^".][^"]*)"/gm;
    const dynamic = /\bimport\(\s*"([^".][^"]*)"\s*\)/g;
    for (const [, specifier] of [...code.matchAll(statements), ...code.matchAll(dynamic)]) {
      names.add(packageOf(specifier));
    }
  }
  return names;
}

test("every package src/ imports is declared in src/package.json", () => {
  for (const name of importedPackages()) {
    if (PEERS.includes(name)) {
      assert.ok(library.peerDependencies?.[name], `${name}: missing from peerDependencies`);
      assert.equal(library.peerDependenciesMeta?.[name]?.optional, true, `${name}: peer should be optional`);
    } else {
      assert.ok(library.dependencies?.[name], `${name}: missing from dependencies`);
    }
  }
});

test("src/package.json pins the same versions as the plugin", () => {
  for (const [name, version] of Object.entries(library.dependencies ?? {})) {
    assert.equal(plugin.dependencies?.[name], version, name);
  }
});

test("the package ships sources only, publicly, under @vibecommerce", () => {
  assert.deepEqual(library.files, ["*.ts", "*.tsx"]);
  assert.equal(library.license, "MIT");
  assert.match(library.name, /^@vibecommerce\//);
  assert.equal(library.publishConfig?.access, "public");
});

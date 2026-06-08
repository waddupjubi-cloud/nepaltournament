import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const htmlFiles = readdirSync(root).filter((file) => extname(file) === ".html");
const jsFiles = readdirSync(resolve(root, "js")).filter((file) => extname(file) === ".js");
const errors = [];

function localReferences(html) {
  return [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|#|mailto:|tel:|data:)/i.test(value))
    .map((value) => value.split(/[?#]/)[0])
    .filter(Boolean);
}

for (const file of htmlFiles) {
  const html = readFileSync(resolve(root, file), "utf8");
  const required = [
    ["title", /<title>[^<]+<\/title>/],
    ["description", /<meta name="description" content="[^"]+">/],
    ["robots", /<meta name="robots" content="[^"]+">/],
    ["favicon", /<link rel="icon" href="[^"]+"[^>]*>/],
    ["manifest", /<link rel="manifest" href="[^"]+"[^>]*>/]
  ];
  required.forEach(([label, pattern]) => {
    if (!pattern.test(html)) errors.push(`${file}: missing ${label}`);
  });
  localReferences(html).forEach((reference) => {
    if (!existsSync(resolve(root, reference))) errors.push(`${file}: missing local reference ${reference}`);
  });
}

JSON.parse(readFileSync(resolve(root, "site.webmanifest"), "utf8"));

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", resolve(root, "js", file)], { encoding: "utf8" });
  if (result.status !== 0) errors.push(`${file}: ${result.stderr.trim()}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${htmlFiles.length} HTML pages, ${jsFiles.length} JavaScript files, metadata, and local references.`);

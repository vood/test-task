#!/usr/bin/env node
/* Inlines tests.js into index.html to produce bench.html — one standalone file
 * that runs from a double-click or a hosted page, with no fetches at all.
 *
 *   node interview/gpu-credits/build-artifact.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = await readFile(resolve(here, "index.html"), "utf8");
const tests = await readFile(resolve(here, "tests.js"), "utf8");

const region = page.match(/<!-- ARTIFACT:BEGIN -->([\s\S]*?)<!-- ARTIFACT:END -->/);
if (!region) throw new Error("index.html is missing the ARTIFACT markers");

const body = region[1].replace(
  '<script src="tests.js"></script>',
  `<script>\n${tests}\n</script>`
);

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GPU Credit Bench</title>
</head>
<body>
${body.trim()}
</body>
</html>
`;

await writeFile(resolve(here, "bench.html"), standalone);
console.log("wrote bench.html");

// --fragment <path> also emits a head-less copy for hosts that supply their own shell
const flag = process.argv.indexOf("--fragment");
if (flag !== -1 && process.argv[flag + 1]) {
  const out = resolve(process.cwd(), process.argv[flag + 1]);
  await writeFile(out, `<title>GPU Credit Bench</title>\n${body.trim()}\n`);
  console.log("wrote " + out);
}

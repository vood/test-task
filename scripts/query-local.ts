import path from "node:path";
import { runCodexLocal } from "../lib/codex-local";
import { buildCodexPrompt } from "../lib/prompt";

const question = process.argv.slice(2).join(" ");

if (!question) {
  console.error('Usage: npm run query:local -- "What is the status of Confluence?"');
  process.exit(1);
}

const prompt = buildCodexPrompt(question, "json");
const result = await runCodexLocal(prompt, path.join(process.cwd()));

console.log(result.lastMessage || result.stdout);
if (result.stderr) {
  console.error(result.stderr);
}
process.exit(result.code);


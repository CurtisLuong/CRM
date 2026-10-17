import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './grader.mjs';

const base = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const allowed = new Set(['--fixtures', '--responses', '--report']);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  if (!allowed.has(key) || !args[index + 1] || args[index + 1].startsWith('--') || options[key]) {
    console.error('Usage: node tests/ai-eval/run.mjs --responses <JSONL> [--fixtures <JSONL>] [--report <JSON>]');
    process.exit(2);
  }
  options[key] = args[index + 1];
}
if (!options['--responses']) {
  console.error('--responses is required. This runner never calls an AI model.');
  process.exit(2);
}
async function jsonl(path) {
  const content = await readFile(path, 'utf8');
  return content.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; }
    catch { throw new Error(`${path}:${index + 1}: invalid JSON.`); }
  });
}
try {
  const fixtures = await jsonl(options['--fixtures'] ? resolve(options['--fixtures']) : resolve(base, 'synthetic-notes.jsonl'));
  const responses = await jsonl(resolve(options['--responses']));
  const report = evaluate(fixtures, responses);
  if (options['--report']) await writeFile(resolve(options['--report']), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.automatedConstraintsPassed ? 0 : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}

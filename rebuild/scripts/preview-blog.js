#!/usr/bin/env node
/**
 * Build rebuild/dist with the journal public and every draft shown, so a post
 * can be read in the browser before it is published. Content is copied to a
 * temp folder; drafts become published there, with stand-in facts and sources
 * when they have none. Nothing in content/blog changes.
 * Usage: npm run blog:preview, then npm run serve:rebuild → /blog
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const YAML = require("yaml");

const REPO = path.join(__dirname, "..", "..");
const SOURCE = path.join(REPO, "content/blog");
const today = new Date().toISOString().slice(0, 10);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-journal-"));
fs.cpSync(SOURCE, temp, { recursive: true });

let shown = 0;
for (const entry of fs.readdirSync(temp, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
  for (const lang of ["en", "sl"]) {
    const file = path.join(temp, entry.name, `${lang}.md`);
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) continue;
    const data = YAML.parse(match[1]);
    if (data.status !== "draft") continue;
    data.status = "published";
    if (data.datePublished > today) data.datePublished = today;
    if (data.dateUpdated > today) data.dateUpdated = today;
    if (!data.facts) data.facts = { bestSeason: "Preview" };
    if (!data.sources || !data.sources.length) data.sources = [{ kind: "notes", note: "Preview" }];
    fs.writeFileSync(file, `---\n${YAML.stringify(data)}---\n${match[2]}`);
    shown += 1;
  }
}

console.log(`Previewing ${shown} draft(s) from ${temp}`);
const result = spawnSync(process.execPath, [path.join(__dirname, "build.js")], {
  cwd: REPO,
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, BLOG_CONTENT: temp, JOURNAL_PUBLIC: "true" },
});
fs.rmSync(temp, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log("Built rebuild/dist. Run npm run serve:rebuild and open /blog.");

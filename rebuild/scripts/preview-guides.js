#!/usr/bin/env node
/**
 * Build rebuild/dist with guides public, for looking at guide pages before
 * launch. Content is copied to a temp folder: every guide in content/guides
 * (drafts shown as published) plus the preview fixture from
 * rebuild/scripts/fixtures/guides. Nothing in content/guides changes.
 *
 * Usage: npm run guides:preview [-- --no-fixture]
 *        then npm run serve:rebuild → /guides, /de/ratgeber, /sl/vodniki
 *
 * Never deploy this output: it carries the fixture, and a production build
 * (SITE_INDEX=true) refuses fixture guides.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const YAML = require("yaml");

const REPO = path.join(__dirname, "..", "..");
const SOURCE = path.join(REPO, "content/guides");
const FIXTURES = path.join(__dirname, "fixtures", "guides");
const withFixture = !process.argv.includes("--no-fixture");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zyflow-guides-"));
if (fs.existsSync(SOURCE)) fs.cpSync(SOURCE, temp, { recursive: true });
if (withFixture) {
  for (const entry of fs.readdirSync(FIXTURES, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      fs.cpSync(path.join(FIXTURES, entry.name), path.join(temp, entry.name), { recursive: true });
    }
  }
}

let drafts = 0;
for (const entry of fs.readdirSync(temp, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
  for (const lang of ["en", "de", "sl"]) {
    const file = path.join(temp, entry.name, `${lang}.md`);
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) continue;
    const data = YAML.parse(match[1]);
    if (data.status !== "draft") continue;
    data.status = "published";
    fs.writeFileSync(file, `---\n${YAML.stringify(data)}---\n${match[2]}`);
    drafts += 1;
  }
}

console.log(
  `Previewing guides from ${temp} (${drafts} draft(s) shown${withFixture ? ", fixture included" : ""})`
);
const result = spawnSync(process.execPath, [path.join(__dirname, "build.js")], {
  cwd: REPO,
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, GUIDES_CONTENT: temp, GUIDES_PUBLIC: "true", SITE_INDEX: "" },
});
fs.rmSync(temp, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log("Built rebuild/dist. Run npm run serve:rebuild and open /guides, /de/ratgeber or /sl/vodniki.");

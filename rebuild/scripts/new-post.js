#!/usr/bin/env node
/**
 * Scaffold a journal post from content/blog/_template/en.md.
 * Usage: npm run blog:new -- <slug> [--type practical] [--region gorenjska|none] [--area bled] [--tags charging,cafes] [--title "…"]
 * --region none makes a tip with no place; a practical tip then sits under the Ride smarter hub.
 * Region, area and tags are checked against _taxonomy.yml, so a typo fails here, not at build time.
 * The post starts as a draft; it still needs images/hero.jpg before the build passes.
 */
const fs = require("fs");
const path = require("path");
const { TYPES, blogContentDir, loadBlog } = require("./blog");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) args[arg.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    else args._.push(arg);
  }
  return args;
}

function titleFromSlug(slug) {
  const words = slug.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args._[0];
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error("Usage: npm run blog:new -- <kebab-slug> [--type practical] [--region gorenjska|none] [--area bled] [--tags a,b] [--title \"…\"]");
    process.exit(1);
  }
  const type = args.type || "practical";
  if (!TYPES.includes(type)) {
    console.error(`--type must be one of ${TYPES.join(", ")}`);
    process.exit(1);
  }
  const dir = blogContentDir();
  const target = path.join(dir, slug);
  if (fs.existsSync(target)) {
    console.error(`${path.relative(process.cwd(), target)} already exists`);
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const template = fs.readFileSync(path.join(dir, "_template", "en.md"), "utf8");
  const title = args.title || titleFromSlug(slug);
  const region = args.region || "gorenjska";
  const tags = (args.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const area = args.area || "";
  const { taxonomy } = loadBlog(dir);
  const found = taxonomy.regions.find((item) => item.id === region);
  const problems = [];
  if (region !== "none" && !found) problems.push(`--region ${region} is not in _taxonomy.yml`);
  if (area && region === "none") problems.push("--area needs a --region");
  if (area && found && !(found.areas || []).some((item) => item.id === area)) {
    problems.push(`--area ${area} is not in ${region}; it has ${(found.areas || []).map((item) => item.id).join(", ") || "no areas"}`);
  }
  for (const tag of tags) {
    if (!taxonomy.tags.some((item) => item.id === tag)) problems.push(`--tags ${tag} is not a tag; see README §2`);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const body = template
    .replace(/^# Template.*\n# Copy with.*\n/m, "")
    .replace(/__SLUG__/g, slug)
    .replace(/__TITLE__/g, title)
    .replace(/__DESCRIPTION__/g, "Say what the reader will know after this post, in one sentence.")
    .replace(/__TODAY__/g, today)
    .replace(/__TYPE__/g, type)
    .replace(/^region: __REGION__\n/m, region === "none" ? "" : `region: ${region}\n`)
    .replace(/^# area: bled$/m, area ? `area: ${area}` : "# area: bled")
    .replace(/^parentHub: blog$/m, region === "none" && type === "practical" ? "parentHub: ride-smarter" : "parentHub: blog")
    .replace(/^tags: \[\]$/m, tags.length ? `tags:\n${tags.map((tag) => `  - ${tag}`).join("\n")}` : "tags: []")
    .replace(/__HERO_ALT__/g, "Describe the hero photo")
    .replace(/__SOURCE_NOTE__/g, "Who rode or checked this, and when.")
    .replace(/__INTRO__ /g, "");
  fs.mkdirSync(path.join(target, "images"), { recursive: true });
  fs.writeFileSync(path.join(target, "en.md"), body);
  const rel = path.relative(process.cwd(), target);
  console.log(`Created ${rel}/en.md (draft, type ${type}).`);
  console.log(`Next: add ${rel}/images/hero.jpg, write the post, then npm run blog:check.`);
}

main();

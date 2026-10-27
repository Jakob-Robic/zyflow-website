#!/usr/bin/env node
/**
 * Validate every journal post (the same rules as the build) and lint them
 * against the journal playbook (content/blog/README.md). Lint findings are
 * warnings; only validation errors fail.
 * Usage: npm run blog:check [-- <translationKey>]
 */
const { loadBlog } = require("./blog");

const BANNED = [
  "amazing",
  "stunning",
  "breathtaking",
  "hidden gem",
  "must-see",
  "ultimate",
  "unlock",
  "journey",
  "paradise",
];
const LENGTH = {
  practical: [600, 1000],
  story: [600, 1000],
  "spot-list": [900, 1500],
  "route-guide": [900, 1500],
  itinerary: [900, 1500],
};
const NEEDS_FAQ = new Set(["spot-list", "route-guide", "itinerary"]);
const EMOJI = /\p{Extended_Pictographic}/u;

function words(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function lint(post) {
  const notes = [];
  const body = post.body || "";
  const prose = body.replace(/^:::.*$/gm, "");
  if (words(post.title) > 7) notes.push(`title has ${words(post.title)} words (7 or fewer)`);
  if (/__[A-Z_]+__/.test(post.raw)) notes.push("template placeholders (__…__) are still in the file");
  const lower = `${post.title}\n${post.description}\n${prose}`.toLowerCase();
  for (const word of BANNED) if (lower.includes(word)) notes.push(`uses "${word}"`);
  if (/^\s*discover\b/i.test(post.title)) notes.push('title starts with "Discover"');
  if (EMOJI.test(`${post.title}${post.description}${prose}`)) notes.push("contains emoji");
  if (prose.replace(/!\[/g, "").includes("!")) notes.push("contains an exclamation mark");
  const range = post.hubLevel === "region" ? [1200, 2000] : LENGTH[post.type];
  const count = words(prose);
  if (range && (count < range[0] || count > range[1])) {
    notes.push(`${count} words (aim for ${range[0]}–${range[1]} for ${post.hubLevel === "region" ? "a region hub" : post.type})`);
  }
  const headings = (body.match(/^## /gm) || []).length;
  if (headings < 3) notes.push(`${headings} ## headings (3 or more)`);
  for (const line of body.match(/^## .*/gm) || []) {
    if (words(line.slice(3)) > 7) notes.push(`heading "${line.slice(3)}" is longer than 7 words`);
  }
  if (NEEDS_FAQ.has(post.type) && !/^:::faq\b/m.test(body)) notes.push("no :::faq block");
  const internal = (body.match(/\]\((?!https?:|mailto:)[^)]+\)/g) || []).length + (post.relatedTours || []).length;
  if (internal < 2) notes.push(`${internal} internal links or related routes (2 or more)`);
  if (!new RegExp(post.slug.split("-")[0], "i").test(body.split("\n\n").slice(0, 2).join(" "))) {
    notes.push("the first paragraph may not carry the post's search terms");
  }
  return notes;
}

function main() {
  const only = process.argv[2];
  const catalog = loadBlog();
  const posts = catalog.posts.filter((post) => !only || post.translationKey === only);
  let warnings = 0;
  for (const post of posts) {
    const notes = lint(post);
    console.log(`${notes.length ? "~" : "✓"} [${post.status}] ${post.file}`);
    for (const note of notes) console.log(`    · ${note}`);
    warnings += notes.length;
  }
  if (catalog.warnings.length) {
    console.log("\nEngine warnings:");
    for (const warning of catalog.warnings) console.log(`  · ${warning}`);
  }
  if (catalog.errors.length) {
    console.error(`\n${catalog.errors.length} error(s) — the build will fail:`);
    for (const error of catalog.errors) console.error(`  ✗ ${error}`);
    process.exit(1);
  }
  console.log(`\n${posts.length} post(s) valid · ${warnings} playbook note(s) · ${catalog.warnings.length} engine warning(s)`);
}

main();

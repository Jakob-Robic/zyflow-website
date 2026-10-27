#!/usr/bin/env node
/**
 * Copy a post's photos from the "Zyflow Journal" Drive folder (synced by
 * Google Drive for desktop) into content/blog/<slug>/images, resized to 2000 px
 * wide JPEG. Notes (Google Docs) and GPX files are listed, not copied: the
 * agent reads notes through the Drive connector.
 * Usage: npm run blog:pull -- <slug> [--library Slovenia/Gorenjska]
 * Set JOURNAL_DRIVE to the folder if it is not found automatically.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { blogContentDir } = require("./blog");

const PHOTO = /\.(jpe?g|png|heic|webp|tiff?)$/i;
const MAX_WIDTH = 2000;

function driveRoot() {
  if (process.env.JOURNAL_DRIVE) return process.env.JOURNAL_DRIVE;
  const storage = path.join(os.homedir(), "Library/CloudStorage");
  if (!fs.existsSync(storage)) return "";
  for (const account of fs.readdirSync(storage)) {
    const candidate = path.join(storage, account, "My Drive/Zyflow/Zyflow Journal");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function outName(file) {
  const base = path.basename(file, path.extname(file)).toLowerCase();
  return `${base.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}.jpg`;
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  const libraryAt = args.indexOf("--library");
  const library = libraryAt === -1 ? "" : args[libraryAt + 1];
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error("Usage: npm run blog:pull -- <slug> [--library <Country>/<Region>]");
    process.exit(1);
  }
  const root = driveRoot();
  if (!root) {
    console.error("Zyflow Journal Drive folder not found. Set JOURNAL_DRIVE to its local path.");
    process.exit(1);
  }
  const source = library ? path.join(root, "03 Photo library", library) : path.join(root, "02 Posts", slug);
  if (!fs.existsSync(source)) {
    console.error(`No Drive folder at ${source}`);
    process.exit(1);
  }
  const target = path.join(blogContentDir(), slug, "images");
  fs.mkdirSync(target, { recursive: true });

  const files = fs.readdirSync(source).filter((name) => !name.startsWith("."));
  const copied = [];
  for (const name of files.filter((file) => PHOTO.test(file))) {
    const dest = path.join(target, outName(name));
    const image = sharp(path.join(source, name)).rotate();
    const { width } = await image.metadata();
    await image
      .resize({ width: Math.min(width || MAX_WIDTH, MAX_WIDTH), withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(dest);
    const small = width && width < 1600 ? ` (only ${width} px wide; heroes need 1600+)` : "";
    copied.push(`${path.basename(dest)}${small}`);
  }
  const notes = files.filter((file) => /\.gdoc$|\.docx?$|\.txt$|\.md$/i.test(file));
  const gpx = files.filter((file) => /\.gpx$/i.test(file));

  console.log(`From ${source}`);
  console.log(copied.length ? `Copied to ${path.relative(process.cwd(), target)}:\n  ${copied.join("\n  ")}` : "No photos found.");
  if (!library && !copied.some((name) => name.startsWith("hero.jpg"))) console.log("No hero.jpg in the Drive folder.");
  if (notes.length) console.log(`Notes to read through the Drive connector:\n  ${notes.join("\n  ")}`);
  if (gpx.length) console.log(`GPX files:\n  ${gpx.map((file) => path.join(source, file)).join("\n  ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

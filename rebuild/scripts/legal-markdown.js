/**
 * Render legal markdown → HTML for rebuild pages.
 * Strips HTML comments and drops the unpublished account-deletion section.
 */

const { Marked } = require("marked");

/**
 * Tables: every body cell carries its column heading as data-label, and the
 * table parts state their roles. Below 600 px the stylesheet stacks each row
 * as label/value blocks (css/phone.css); the roles keep it a table for screen
 * readers when the cells stop being laid out as one.
 */
function plainText(html) {
  return String(html)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const legalMarked = new Marked({ gfm: true, breaks: false });
legalMarked.use({
  renderer: {
    table(token) {
      const cell = (tag, role, item, label) => {
        const align = item.align ? ` align="${item.align}"` : "";
        const data = label ? ` data-label="${label.replace(/"/g, "&quot;")}"` : "";
        return `<${tag} role="${role}"${align}${data}>${this.parser.parseInline(item.tokens)}</${tag}>\n`;
      };
      const labels = token.header.map((item) => plainText(this.parser.parseInline(item.tokens)));
      const head = token.header.map((item) => cell("th", "columnheader", item)).join("");
      const rows = token.rows
        .map(
          (row) =>
            `<tr role="row">\n${row.map((item, i) => cell("td", "cell", item, labels[i])).join("")}</tr>\n`
        )
        .join("");
      const body = rows ? `<tbody role="rowgroup">${rows}</tbody>` : "";
      return `<table role="table">\n<thead role="rowgroup">\n<tr role="row">\n${head}</tr>\n</thead>\n${body}</table>\n`;
    },
  },
});

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const UNPUBLISHED_DELETION_RE =
  /^#{1,3}[ \t]+Use after code fix ships\b[\s\S]*$/im;

function parseFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: text };
  }
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: match[2] };
}

function stripHtmlComments(markdown) {
  return markdown.replace(HTML_COMMENT_RE, "");
}

function stripUnpublishedDeletionDraft(markdown) {
  return markdown
    .replace(UNPUBLISHED_DELETION_RE, "")
    .replace(/\n+---\s*$/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function extractLeadingTitle(markdown, meta) {
  if (meta.title) return { meta, markdown };
  const match = markdown.match(/^#\s+(.+?)\s*(?:\r?\n)+/);
  if (!match) return { meta, markdown };
  return {
    meta: { ...meta, title: match[1].trim() },
    markdown: markdown.slice(match[0].length),
  };
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function collectHeadings(html) {
  const headings = [];
  const re = /<h2([^>]*)>([\s\S]*?)<\/h2>/gi;
  let match;
  while ((match = re.exec(html))) {
    const raw = match[2].replace(/<[^>]+>/g, "").trim();
    if (!raw) continue;
    const existingId = /id="([^"]+)"/.exec(match[1] || "");
    headings.push({
      id: existingId ? existingId[1] : slugify(raw),
      text: raw,
    });
  }
  return headings;
}

function ensureHeadingIds(html) {
  return html.replace(/<h([2-3])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, level, attrs, inner) => {
    if (/\sid=/.test(attrs)) return full;
    const id = slugify(inner.replace(/<[^>]+>/g, ""));
    if (!id) return full;
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });
}

function renderToc(headings, locale) {
  if (headings.length < 3) return "";
  const label = locale === "sl" ? "Vsebina" : "Contents";
  const items = headings
    .map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`)
    .join("");
  return `<nav class="legal-doc__toc" aria-label="${label}">
  <p class="legal-doc__toc-title">${label}</p>
  <ol>${items}</ol>
</nav>`;
}

function prepareMarkdown(raw, { dropUnpublishedDeletion = false } = {}) {
  const parsed = parseFrontmatter(raw);
  let { meta, markdown } = extractLeadingTitle(parsed.body, parsed.meta);
  markdown = stripHtmlComments(markdown);
  if (dropUnpublishedDeletion) {
    markdown = stripUnpublishedDeletionDraft(markdown);
  }
  return { meta, markdown: markdown.trim() };
}

function renderLegalMarkdown(raw, { locale = "en", dropUnpublishedDeletion = false } = {}) {
  const { meta, markdown } = prepareMarkdown(raw, { dropUnpublishedDeletion });
  let html = legalMarked.parse(markdown);
  html = ensureHeadingIds(html);
  const headings = collectHeadings(html);
  const toc = renderToc(headings, locale);
  return {
    meta,
    html,
    toc,
  };
}

module.exports = {
  parseFrontmatter,
  prepareMarkdown,
  renderLegalMarkdown,
};

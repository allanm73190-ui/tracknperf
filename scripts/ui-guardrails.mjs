import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, "src", "ui");
const PAGES_DIR = path.join(UI_DIR, "pages");
const BUDGET = Number(process.env.UI_INLINE_STYLE_BUDGET ?? "500");
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

async function walk(dir) {
  const entries = await readdir(dir);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

function findEmojiPositions(content) {
  const out = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    EMOJI_RE.lastIndex = 0;
    const match = EMOJI_RE.exec(line);
    if (!match) continue;
    out.push({ line: i + 1, column: match.index + 1, glyph: match[0] });
  }
  return out;
}

function countInlineStyles(content) {
  const matches = content.match(/style=\{\{/g);
  return matches ? matches.length : 0;
}

async function main() {
  const uiFiles = (await walk(UI_DIR)).filter((f) => /\.(tsx?|css)$/.test(f));
  const pageFiles = (await walk(PAGES_DIR)).filter((f) => /\.tsx$/.test(f));

  const emojiViolations = [];
  for (const file of uiFiles) {
    const content = await readFile(file, "utf8");
    const positions = findEmojiPositions(content);
    for (const pos of positions) {
      emojiViolations.push({
        file: path.relative(ROOT, file),
        ...pos,
      });
    }
  }

  let inlineStyles = 0;
  for (const file of pageFiles) {
    const content = await readFile(file, "utf8");
    inlineStyles += countInlineStyles(content);
  }

  const errors = [];
  if (emojiViolations.length > 0) {
    errors.push("Emoji détectés dans src/ui (interdits par le design system).");
    for (const v of emojiViolations.slice(0, 20)) {
      errors.push(`- ${v.file}:${v.line}:${v.column} -> ${v.glyph}`);
    }
    if (emojiViolations.length > 20) {
      errors.push(`- ... ${emojiViolations.length - 20} violation(s) supplémentaire(s)`);
    }
  }

  if (inlineStyles > BUDGET) {
    errors.push(
      `Budget inline styles dépassé: ${inlineStyles} > ${BUDGET} (src/ui/pages, occurrences de style={{...}}).`,
    );
  }

  if (errors.length > 0) {
    console.error("\n[ui-guardrails] ECHEC\n");
    for (const line of errors) console.error(line);
    process.exit(1);
  }

  console.log("[ui-guardrails] OK");
  console.log(`- inline styles: ${inlineStyles}/${BUDGET}`);
  console.log("- emoji: 0");
}

main().catch((err) => {
  console.error("[ui-guardrails] ERREUR", err);
  process.exit(1);
});


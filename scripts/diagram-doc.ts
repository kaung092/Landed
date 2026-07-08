/**
 * Shared helper for the auto-generated diagram docs (architecture + pipeline).
 * Wraps a Mermaid block in a markdown file with a consistent "do not edit"
 * banner and writes it under docs/. Keeps the two generators DRY.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

/** Resolve a path relative to the Landed repo root (one level above scripts/). */
export const fromRoot = (...parts: string[]) => resolve(scriptsDir, "..", ...parts);

type DiagramDoc = {
  /** Output path, e.g. "docs/pipeline.md". */
  out: string;
  /** Markdown H1 title. */
  title: string;
  /** How this file is regenerated — shown in the banner after the boilerplate. */
  source: string;
  /** One short paragraph explaining what the diagram shows. */
  intro: string;
  /** The Mermaid diagram body (without the fences). */
  mermaid: string;
};

export function writeDiagramDoc({ out, title, source, intro, mermaid }: DiagramDoc): void {
  const doc = `# ${title}

<!-- AUTO-GENERATED — do not edit by hand. Regenerated on every push by
     .github/workflows/architecture-diagram.yml. ${source} -->

${intro}

\`\`\`mermaid
${mermaid.trim()}
\`\`\`
`;
  const outFile = fromRoot(out);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, doc);
  console.log(`Wrote ${outFile}`);
}

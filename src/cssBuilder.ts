import { CSSLink } from "./cssLink";
import ResuperchargedLinks from "./main";

/**
 * Logical match modes used by plugin settings/UI.
 * These are later translated to CSS attribute operators.
 */
type MatchTypes = "exact" | "contains" | "startswith" | "endswith" | "whiteSpace";

/**
 * CSS attribute operators used in generated selectors.
 */
type OpKey = "=" | "*=" | "^=" | "$=" | "~=";

// #region HELPERS

/**
 * Maps raw CSS operators to internal match modes.
 * Used when sanitizing malformed user input such as "=foo" or "*=foo".
 */
const opToMatch: Record<OpKey, MatchTypes> = {
  "=": "exact",
  "*=": "contains",
  "^=": "startswith",
  "$=": "endswith",
  "~=": "whiteSpace",
};

/**
 * Type guard for valid CSS attribute operators.
 */
function isOp(x: string): x is OpKey {
  return x === "=" || x === "*=" || x === "^=" || x === "$=" || x === "~=";
}

/**
 * Normalizes and sanitizes a rule before CSS generation.
 *
 * Why:
 * - Users may accidentally type operators into value fields (e.g. "*=tag").
 * - Path exact matches should consistently target Obsidian paths (".md").
 *
 * Behavior:
 * - If value is only an operator, it updates match mode and clears value.
 * - If value starts with one or more operators, it derives the final operator
 *   from the trailing operator and strips operators from value.
 */
function sanitizeRule(r: CSSLink): CSSLink {
  const out = { ...r };
  let v = (out.value || "").trim();

  if (isOp(v)) {
    out.match = opToMatch[v];
    out.value = "";
    return out;
  }

  const m = v.match(/^((?:=|\*=|\^=|\$=|~=)+)\s*(.*)$/);
  if (m) {
    const [, rawOps = "", restRaw = ""] = m;
    const rest = restRaw.trim();

    const lastOp: OpKey =
      rawOps.endsWith("*=") ? "*=" :
      rawOps.endsWith("^=") ? "^=" :
      rawOps.endsWith("$=") ? "$=" :
      rawOps.endsWith("~=") ? "~=" : "=";

    out.match = opToMatch[lastOp];
    out.value = rest;
    v = rest;
  }

  return out;
}

/**
 * Converts internal match mode to CSS attribute operator.
 */
function getMatchOp(match: MatchTypes): OpKey {
  switch (match) {
    case "exact": return "=";
    case "contains": return "*=";
    case "startswith": return "^=";
    case "endswith": return "$=";
    case "whiteSpace": return "~=";
    default: return "*=";
  }
}

/**
 * Normalizes custom data-link attribute keys:
 * - trims whitespace
 * - converts spaces to hyphens
 * - lowercases
 *
 * Example: "Project Name" -> "project-name"
 */
function normalizeAttrKey(name: string | undefined): string {
  return (name || "").trim().replace(/ /g, "-").toLowerCase();
}

/**
 * Escapes values for safe inclusion in CSS string literals.
 * Escapes backslashes and double quotes.
 */
function escCssString(v: string): string {
  return (v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Compiles a rule into a concrete CSS attribute selector fragment.
 *
 * Output examples:
 * - [data-link-tags*="foo" i]
 * - [data-link-path="Note.md"]
 * - [data-link-project-name^="abc" i]
 *
 * Notes:
 * - Uses case-insensitive matching unless explicitly case-sensitive.
 * - Returns a guaranteed non-match selector for invalid/empty input.
 */
function compileCssSelector(selector: CSSLink): string {
  const isSensitive = selector.matchCaseSensitive ? "" : " i";
  const op = getMatchOp(selector.match);

  if (selector.type === "attribute") {
    const normalizedName = normalizeAttrKey(selector.name);
    if (!normalizedName) return `[data-link-path*="__never__"]`;
    const value = escCssString((selector.value || "").trim());
    return `[data-link-${normalizedName}${op}"${value}"${isSensitive}]`;
  }

  if (selector.type === "tag") {
    const value = escCssString((selector.value || "").trim());
    return `[data-link-tags*="${value}" i]`;
  }

  // PATH: always treat as internal substring match
  const raw = (selector.value || "").trim();
  if (!raw) return `[data-link-path*="__never__"]`;

  return `[data-link-path*="${escCssString(raw)}"${isSensitive}]`;
}

function buildStyleBlock(selector: CSSLink, cssSelector: string): string[] {
  // Text-only target strategy:
  // - Style only the text carrier
  // - Do not style custom icon carrier classes at all
  const textTargets = [
    `.data-link-text${cssSelector}`,
    `.data-link-text${cssSelector} .cm-underline`,
  ].join(",\n");

  const lines: string[] = [`${textTargets} {`];

  const lightColor = (selector.lightColor || "").trim();
  const darkColor = (selector.darkColor || "").trim();
  const hasAnyColor = !!lightColor || !!darkColor;

  if (hasAnyColor) {
    lines.push(`    color: var(--scl-color-${selector.uid}) !important;`);
  }

  const lightBg = (selector.lightBgColor || "").trim().toLowerCase();
  const darkBg  = (selector.darkBgColor || "").trim().toLowerCase();

  const hasLightBg = lightBg !== "" && lightBg !== "transparent";
  const hasDarkBg  = darkBg !== "" && darkBg !== "transparent";
  const hasAnyBg = hasLightBg || hasDarkBg;

  if (hasAnyBg) {
    lines.push(`    background-color: var(--scl-bg-${selector.uid}) !important;`);
  }

  if (selector.fontWeight && selector.fontWeight !== "normal") {
    lines.push(`    font-weight: ${selector.fontWeight} !important;`);
  }
  if (selector.fontStyle === "italic") {
    lines.push(`    font-style: italic !important;`);
  }
  if (selector.fontStyle === "underline") {
    lines.push(`    text-decoration: underline !important;`);
  }
  if (selector.fontStyle === "line-through") {
    lines.push(`    text-decoration: line-through !important;`);
  }

  lines.push(`}`);
  // only selector + "}" means empty rule, skip it
  if (lines.length === 2) return [];
  return lines;
}

function buildIconBlocks(selector: CSSLink, cssSelector: string): string[] {
  const lines: string[] = [];
  const before = escCssString(selector.iconBefore || "");
  const after = escCssString(selector.iconAfter || "");

  // BEFORE icon on text element
  if (before) {
    lines.push(
      `.data-link-text${cssSelector}::before { content: "${before}"; }`
    );
  }

  // AFTER icon on text element
  if (after) {
    lines.push(
      `.data-link-text${cssSelector}::after { content: "${after}"; }`
    );
  }

  return lines;
}

/**
 * Main CSS generation routine.
 *
 * Pipeline:
 * 1) Start with a generated-file warning header.
 * 2) Build theme-scoped CSS custom properties (light/dark) per rule UID.
 * 3) Build runtime CSS rules (style + icon blocks) for each sanitized rule.
 * 4) Write snippet to .obsidian/snippets/re-supercharged-links-gen.css.
 * 5) Optionally enable/reload snippet through Obsidian customCss manager.
 *
 * This function is intentionally deterministic for stable output and easier diffing.
 */
export async function buildCSS(selectors: CSSLink[], plugin: ResuperchargedLinks): Promise<void> {
  const instructions: string[] = [
    "/* WARNING: Dynamically generated by re-supercharged-links. Do not edit directly. */",
    ""
  ];

  const lightVars: string[] = [".theme-light {"];
  const darkVars: string[] = [".theme-dark {"];
  const rules: string[] = [""];

  for (const rawSelector of selectors) {
    const selector = sanitizeRule(rawSelector);
    const cssSelector = compileCssSelector(selector);

    lightVars.push(
      `    --scl-color-${selector.uid}: ${selector.lightColor || "var(--text-normal)"};`,
      `    --scl-bg-${selector.uid}: ${selector.lightBgColor || "transparent"};`
    );

    darkVars.push(
      `    --scl-color-${selector.uid}: ${selector.darkColor || "var(--text-normal)"};`,
      `    --scl-bg-${selector.uid}: ${selector.darkBgColor || "transparent"};`
    );

    rules.push(...buildStyleBlock(selector, cssSelector));
    rules.push(...buildIconBlocks(selector, cssSelector));
  }

  lightVars.push("}");
  darkVars.push("}");

  const finalCSS = [...instructions, ...lightVars, "", ...darkVars, ...rules].join("\n");

  const vault = plugin.app.vault;
  const configDir = vault.configDir ?? ".obsidian";
  const snippetsDir = `${configDir}/snippets`;
  const snippetPath = `${snippetsDir}/re-supercharged-links-gen.css`;

  await vault.adapter.mkdir(snippetsDir);
  await vault.adapter.write(snippetPath, finalCSS);

  if (plugin.settings.activateSnippet) {
    // @ts-ignore
    const customCss = plugin.app.customCss;
    if (customCss) {
      customCss.enabledSnippets.add("re-supercharged-links-gen");
      customCss.requestLoadSnippets();
    }
  }
}
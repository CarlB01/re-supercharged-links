// utils/shared-utils

/**
 * Performs a typesafe structural clone of settings blocks without using any-casts.
 */
export function cloneSettingsObject<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Standardizes formatting and strips invisible emoji variation selectors (U+FE0F).
 * Enforces unified NFC normalization boundaries across layout nodes.
 */
export const norm = (s: string | null | undefined): string =>
	(s ?? "")
		.normalize("NFC")
		.replace(/[\uFE00-\uFE0F]/g, "")
		.replace(/\s+/g, " ")
		.trim();

/**
 * Evaluates whether a normalized layout text string begins with a specific token literal.
 */
export const startsWithToken = (text: string | null | undefined, token: string | null | undefined): boolean => {
	const t: string = norm(text);
	const k: string = norm(token);
	return t.length > 0 && k.length > 0 && t.startsWith(k);
};

/**
 * Multi-window safe bounds verification check ensuring a string ends with a token literal.
 * Employs trailing slice validation to eliminate whitespace drops or layout drift.
 */
export const endsWithToken = (text: string | null | undefined, token: string | null | undefined): boolean => {
	const t: string = norm(text);
	const k: string = norm(token);
	if (t.length === 0 || k.length === 0 || t.length < k.length) return false;

	const standardMatch: boolean = t.endsWith(k);
	if (standardMatch) return true;

	const trailingSlice: string = t.slice(-k.length - 2);
	return trailingSlice.includes(k);
};

/**
 * Normalizes metadata keys by swapping internal whitespaces with unified hyphen delimiters.
 */
export function processKey(key: string): string {
	return key.trim().replace(/\s+/g, "-");
}

/**
 * Sanitizes frontmatter strings and slices open internal wikilink brackets for targeted matrices.
 */
export function processValue(key: string, value: string): string {
	if (!value) return value;
	if (key.includes("publishedIn") && value.startsWith("[[") && value.endsWith("]]")) {
		return value.slice(2, -2);
	}
	return value;
}

/**
 * Sanitizes and transforms loose structural strings into standard hashtag tokens.
 */
export function normalizeTagToken(input: string): string {
	let s: string = norm(input);
	if (s.length === 0) return "";
	s = s.replace(/^[\s,;|]+|[\s,;|]+\$/g, "");
	if (!s.startsWith("#")) {
		s = `#${s}`;
	}
	return s;
}

/**
 * Escapes structural backslashes and quotes within inline runtime nodes to protect CSS generation.
 */
export function escCssString(v: string | null | undefined): string {
	return (v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Runtime guard verifying if an abstract unknown node maps to a solid HTMLElement layout layer.
 */
export function isHtmlElement(node: unknown): node is HTMLElement {
	return typeof node === "object" && node !== null && (node as Node).nodeType === 1;
}

/**
 * Isolates core target path layouts by stripping outer wikilink notation, fragments, and alias pipes.
 */
export function extractCleanLinkPath(rawText: string | null | undefined): string {
	const text: string = rawText ?? "";
	if (text.length === 0) return "";
	
	let cleanText: string = text.replace(/^\[\[/, "").replace(/\]\]\$/, "");

	if (cleanText.includes("|")) {
		const pipeParts: string[] = cleanText.split("|");
		const pathPart: string | null = pipeParts[0] ?? null;
		cleanText = pathPart !== null ? pathPart : cleanText;
	}

	const hashParts: string[] = cleanText.split("#");
	const firstPart: string | null = hashParts[0] ?? null;
	
	return firstPart !== null ? firstPart.trim() : "";
}

/**
 * Standardizes configuration selector match keywords into clean, lowercase strings.
 */
export function cleanRuleValue(value: string | null | undefined): string {
	return (value ?? "").toLowerCase().trim().replace(/^#/, "");
}

/**
 * Formats user frontmatter metadata names into lower-hyphen delimitations.
 */
export function cleanAttributeKey(name: string | null | undefined): string {
	return (name ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Fast-track path string normalization routine specifically tailored for queue ingestion.
 * Converts characters to lowercase and strips leading forward slashes without regex overhead.
 */
export function normalizePathForQueue(input: string | null | undefined): string {
	const text: string = input ?? "";
	if (text.length === 0) return "";
	
	let trimmed: string = text.trim();
	while (trimmed.startsWith("/")) {
		trimmed = trimmed.substring(1);
	}
	
	return trimmed.toLowerCase();
}

/**
 * Granular linear scan processing space-separated strings via inline padding maps.
 * ⚡ ZERO-ARRAY TRICK: Drop-in replacement for array splits to minimize GC thread sweeps.
 */
export function hasTagToken(rawTags: string | null | undefined, targetCleanTag: string): boolean {
	const tags: string = (rawTags ?? "").toLowerCase();
	if (tags.length === 0 || targetCleanTag.length === 0) return false;

	const paddedTags: string = " " + tags.replace(/#/g, "") + " ";
	return paddedTags.includes(" " + targetCleanTag + " ");
}

/**
 * Historical fallback array wrapper preserved for internal configuration parsing.
 */
export function parseSpaceSeparatedTokens(rawInput: string | null | undefined): string[] {
	const text: string = rawInput ?? "";
	if (text.length === 0) return [];
	
	return text
		.toLowerCase()
		.replace(/#/g, "")
		.trim()
		.split(/\s+/)
		.filter((token: string): boolean => token.length > 0);
}

/**
 * Filters and compacts a list of folder prefixes to purge redundant children from memory trees.
 * Runs on sorted array indexes allowing linear positional lookups in O(N log N) speed.
 */
export function compactPrefixes(prefixes: string[]): string[] {
	if (prefixes.length === 0) return [];

	const cleaned: string[] = [];
	prefixes.forEach((p) => {
		if (p.length === 0) return;
		cleaned.push(p.endsWith("/") ? p : `${p}/`);
	});

	if (cleaned.length <= 1) return cleaned;

	cleaned.sort();

	const output: string[] = [];
	const currentParent: string = cleaned[0] || ""; 
	if (currentParent.length > 0) {
		output.push(currentParent);
	}

	for (let i = 1; i < cleaned.length; i += 1) {
		const nextPath: string = cleaned[i] || "";
		if (nextPath.length === 0) continue;

		if (!nextPath.startsWith(currentParent)) {
			output.push(nextPath);
		}
	}

	return output;
}

/**
 * Compiles structural runtime index tags used to pin MutationObservers to explicit tab sheets.
 */
export function buildObserverKey(prefix: string, index: number): string {
	return `${prefix.trim().toLowerCase()}-${index}`;
}

/**
 * Strips UI query streams to process layout rule checks across search boxes.
 */
export function cleanSearchQuery(query: string | null | undefined): string {
	return (query ?? "").trim().toLowerCase();
}

/**
 * Slices interface element interaction triggers symmetrically at the trailing underscore character.
 * Prevents index alignment failures when handling multi-nested properties (e.g., 'scl_lightColor_0').
 */
export function parseControlValueKey(key: string): { prop: string; uid: string } {
	const rawKey = key ?? "";
	const lastUnderscoreIndex = rawKey.lastIndexOf("_");
	
	if (lastUnderscoreIndex > 0) {
		const firstUnderscoreIndex = rawKey.indexOf("_");
		const prop = rawKey.slice(firstUnderscoreIndex + 1, lastUnderscoreIndex);
		const uid = rawKey.slice(lastUnderscoreIndex + 1);
		
		return { prop, uid };
	}
	
	return { prop: "", uid: "" };
}


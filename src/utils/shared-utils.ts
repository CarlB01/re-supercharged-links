// utils/shared-utils

/**
 * Performs a typesafe structural clone of settings blocks without using any-casts.
 */
export function cloneSettingsObject<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Super-robust normalization for emojis and text strings.
 * Strips emoji variation selectors (U+FE0F) and standardizes formatting.
 * Performance: Checks if normalization is actually required before invoking heavy operations.
 */
export const norm = (s: string | null): string => {
	if (s === null || s.length === 0) return "";
	
	if (!s.includes(" ") && !/[\uFE00-\uFE0F]/.test(s)) {
		return s.trim().normalize("NFC");
	}

	return s
		.normalize("NFC")
		.replace(/[\uFE00-\uFE0F]/g, "")
		.replace(/\s+/g, " ")
		.trim();
};

/**
 * Verifies if a normalized text string begins with a specific token literal.
 * Performance: Compares raw strings first to skip normalization on exact matches.
 */
export const startsWithToken = (text: string | null, token: string | null): boolean => {
	if (text === null || token === null || text.length === 0 || token.length === 0) return false;
	if (text === token) return true;

	const k: string = norm(token);
	if (k.length === 0) return false;

	const t: string = norm(text);
	return t.startsWith(k);
};

/**
 * Advanced check verifying if a string ends with a specific token literal.
 * Prevents layout drift by verifying direct string positioning instead of speculative slicing.
 */
export const endsWithToken = (text: string | null, token: string | null): boolean => {
	if (text === null || token === null || text.length === 0 || token.length === 0) return false;
	if (text === token) return true;

	const k: string = norm(token);
	if (k.length === 0 || text.length < k.length) return false;

	const t: string = norm(text);
	return t.endsWith(k);
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
	const s: string = norm(input);
	if (s.length === 0) return "";
	
	// Endret +\$ til +\$ på slutten
	const clean = s.replace(/^[\s,;|]+|[\s,;|]+\$/g, "");
	return clean.startsWith("#") ? clean : `#${clean}`;
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
	
	let cleanText: string = text;
	if (cleanText.startsWith("[[")) {
		cleanText = cleanText.substring(2);
	}
	if (cleanText.endsWith("]]")) {
		cleanText = cleanText.substring(0, cleanText.length - 2);
	}

	const pipeIdx = cleanText.indexOf("|");
	if (pipeIdx !== -1) {
		cleanText = cleanText.substring(0, pipeIdx);
	}

	const hashIdx = cleanText.indexOf("#");
	if (hashIdx !== -1) {
		cleanText = cleanText.substring(0, hashIdx);
	}
	
	return cleanText.trim();
}

/**
 * Standardizes configuration selector match keywords into clean, lowercase strings.
 */
export function cleanRuleValue(value: string | null | undefined): string {
	if (!value) return "";
	const trimmed = value.trim().toLowerCase();
	return trimmed.startsWith("#") ? trimmed.substring(1) : trimmed;
}

/**
 * Formats user frontmatter metadata names into lower-hyphen delimitations.
 */
export function cleanAttributeKey(name: string | null | undefined): string {
	return (name ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Fast-track path string normalization routine specifically tailored for queue ingestion.
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
 * ⚡ LATMANNSKODE FJERNET: Byttet ut .filter().map() med en lynrask singel for-løkke.
 */
export function parseSpaceSeparatedTokens(rawInput: string | null | undefined): string[] {
	if (!rawInput) return [];
	
	const tokens = rawInput.toLowerCase().replace(/#/g, "").trim().split(/\s+/);
	const result: string[] = [];
	
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token && token.length > 0) {
			result.push(token);
		}
	}
	
	return result;
}

/**
 * Filters and compacts a list of folder prefixes to purge redundant children from memory trees.
 * ⚡ LATMANNSKODE FJERNET: Replaced side-effect forEach arrays allocation with predictable index loop.
 */
export function compactPrefixes(prefixes: string[]): string[] {
	const len = prefixes.length;
	if (len === 0) return [];

	const cleaned: string[] = [];
	for (let i = 0; i < len; i++) {
		const p = prefixes[i];
		if (p && p.length > 0) {
			cleaned.push(p.endsWith("/") ? p : `${p}/`);
		}
	}

	if (cleaned.length <= 1) return cleaned;
	cleaned.sort();

	const output: string[] = [];
	let currentParent: string = cleaned[0] || ""; 
	if (currentParent.length > 0) {
		output.push(currentParent);
	}

	for (let i = 1; i < cleaned.length; i++) {
		const nextPath: string = cleaned[i] || "";
		if (nextPath.length === 0) continue;

		if (!nextPath.startsWith(currentParent)) {
			currentParent = nextPath;
			output.push(currentParent);
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
 */
export function parseControlValueKey(key: string): { prop: string; uid: string } {
	const rawKey = key ?? "";
	const lastUnderscoreIndex = rawKey.lastIndexOf("_");
	
	if (lastUnderscoreIndex > 0) {
		const firstUnderscoreIndex = rawKey.indexOf("_");
		return {
			prop: rawKey.slice(firstUnderscoreIndex + 1, lastUnderscoreIndex),
			uid: rawKey.slice(lastUnderscoreIndex + 1)
		};
	}
	
	return { prop: "", uid: "" };
}

/**
 * Universally scans a raw text string line for internal Obsidian wikilink patterns.
 * 
 * @param lineText - The raw text line snippet to query.
 * @param targetCleanText - Optional filter. If provided, returns the target path ONLY if the link display text or filename matches this criteria.
 */
export function extractWikiLinkFromLine(lineText: string, targetCleanText: string | null = null): string | null {
	if (lineText.length === 0) return null;

	const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
	let match: RegExpExecArray | null = null;
	const cleanSearchTarget = targetCleanText !== null ? targetCleanText.trim().toLowerCase() : null;

	while ((match = wikiLinkRegex.exec(lineText)) !== null) {
		const fullContent: string = match[0] ?? ""; // Dynamic full link token layout string e.g., "[[Path|Alias]]"
		const rawInsideContent: string = match[1] ?? ""; // The string content purely inside the brackets e.g., "Path|Alias"
		if (fullContent.length === 0 || rawInsideContent.length === 0) continue;

		// Extract the absolute clean destination path layout
		const resolvedPath: string = extractCleanLinkPath(fullContent);
		if (resolvedPath.length === 0) continue;

		// If no target filter is specified, return the first valid link path discovered right away
		if (cleanSearchTarget === null) {
			return resolvedPath;
		}

		// Resolve alias display boundaries identically across all consumers
		let displayContent: string = rawInsideContent;
		const pipeIdx = rawInsideContent.indexOf("|");
		if (pipeIdx !== -1) {
			displayContent = rawInsideContent.substring(pipeIdx + 1);
		} else {
			const hashIdx = displayContent.indexOf("#");
			if (hashIdx !== -1) {
				displayContent = displayContent.substring(0, hashIdx);
			}
		}

		const cleanDisplayContent = displayContent.trim().toLowerCase();
		const cleanResolvedPath = resolvedPath.trim().toLowerCase();

		// Intersect targets natively against element text definitions
		if (cleanResolvedPath === cleanSearchTarget || cleanDisplayContent === cleanSearchTarget) {
			return resolvedPath;
		}
	}

	return null;
}

/**
 * Verifies if a search token consists strictly of alphanumeric characters from start to end.
 * Performance: Used to guard minimum character length validations for plain text strings.
 */
export const isPureAlphanumeric = (token: string): boolean => {
	return /^[a-z0-9]+$/i.test(token);
};

/**
 * Verifies if a raw text string ends with a standard layout, status, or presentation emoji.
 * Prevents appending redundant trailing icons when visual indicators are already present.
 */
export const endsWithEmoji = (text: string | null | undefined): boolean => {
	const s = text ?? "";
	if (s.length <= 1) return false;
	
	return /([\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]|\p{Emoji_Presentation})$/u.test(s);
};
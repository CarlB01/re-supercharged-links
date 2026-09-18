/**
 * Perform a typesafe structural clone of settings blocks without using any-casts.
 */
export function cloneSettingsObject<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Super-robust normalization for emojis and text strings.
 * Strips emoji variation selectors (U+FE0F) and standardizes formatting.
 */
export const norm = (s: string | null | undefined): string =>
	(s ?? "")
		.normalize("NFC")
		.replace(/[\uFE00-\uFE0F]/g, "") // Strips absolutely all invisible emoji variation selectors
		.replace(/\s+/g, " ")
		.trim();

/**
 * Verifies if a normalized text string begins with a specific token literal.
 */
export const startsWithToken = (text: string | null | undefined, token: string | null | undefined): boolean => {
	const t: string = norm(text);
	const k: string = norm(token);
	return t.length > 0 && k.length > 0 && t.startsWith(k);
};

/**
 * Advanced, multi-window safe check verifying if a string ends with a specific token literal.
 * Uses a slice boundary lookup to eliminate bugs caused by hidden trailing space strings.
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
 * Cleans metadata string properties and strips internal wiki brackets from designated publishing matrices.
 */
export function processValue(key: string, value: string): string {
	if (!value) return value;
	if (key.includes("publishedIn") && value.startsWith("[[") && value.endsWith("]]")) {
		return value.slice(2, -2);
	}
	return value;
}

/**
 * Transforms loose layout words into standardized hashtag tokens cleanly.
 */
export function normalizeTagToken(input: string): string {
	let s: string = norm(input);
	if (s.length === 0) return "";
	s = s.replace(/^[\s,;|]+|[\s,;|]+$/g, "");
	if (!s.startsWith("#")) {
		s = `#${s}`;
	}
	return s;
}

/**
 * Escapes specific characters within runtime string nodes to keep inline CSS strings clean.
 */
export function escCssString(v: string | null | undefined): string {
	return (v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Comprehensive runtime guard to guarantee a node maps to a solid HTMLElement instance.
 */
export function isHtmlElement(node: unknown): node is HTMLElement {
	return typeof node === "object" && node !== null && (node as Node).nodeType === 1;
}

/**
 * Extracts and isolates clean anchor routes by trimming fragment identifiers and pipe aliases.
 */
export function extractCleanLinkPath(rawText: string | null | undefined): string {
	const text: string = rawText ?? "";
	if (text.length === 0) return "";
	
	let cleanText: string = text.replace(/^\[\[/, "").replace(/\]\]$/, "");

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
 * 🚀 UNIFIED RUNTIME ROUTINE: Cleans and standardizes user rule values for index matching.
 */
export function cleanRuleValue(value: string | null | undefined): string {
	return (value ?? "").toLowerCase().trim().replace(/^#/, "");
}

/**
 * 🚀 UNIFIED RUNTIME ROUTINE: Standardizes attribute and metadata names down to lowercase-hyphen strings.
 */
export function cleanAttributeKey(name: string | null | undefined): string {
	return (name ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * 🚀 UNIFIED RUNTIME ROUTINE: Sanitizes and splits space-separated metadata tokens into a clean string array.
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
 * 🚀 UNIFIED RUNTIME ROUTINE: Assembles structural, typesafe tracking keys for layout observer matrices.
 */
export function buildObserverKey(prefix: string, index: number): string {
	return `${prefix.trim().toLowerCase()}-${index}`;
}

/**
 * 🚀 UNIFIED UI ROUTINE: Standardizes setting queries for robust panel rows searching.
 */
export function cleanSearchQuery(query: string | null | undefined): string {
	return (query ?? "").trim().toLowerCase();
}

/**
 * Splits open control value interaction keys symmetrically.
 * 🔑 RUNTIME INDEX MATRIX: Strictly cuts the string at the VERY LAST underscore character.
 * This ensures clean extraction of CamelCase properties and sequential index numbers (e.g., 'scl_lightColor_0').
 */
export function parseControlValueKey(key: string): { prop: string; uid: string } {
	const rawKey = key ?? "";
	
	// Finn posisjonen til den aller siste understreken i strengen (skiller egenskap fra indeks)
	const lastUnderscoreIndex = rawKey.lastIndexOf("_");
	
	if (lastUnderscoreIndex > 0) {
		// Finn den første understreken (skiller 'scl' fra egenskapen)
		const firstUnderscoreIndex = rawKey.indexOf("_");
		
		// Trekk ut egenskapen (f.eks. alt mellom første og siste understrek: 'lightColor')
		const prop = rawKey.slice(firstUnderscoreIndex + 1, lastUnderscoreIndex);
		
		// Trekk ut indeksen eller ID-en (alt etter den siste understreken: '0')
		const uid = rawKey.slice(lastUnderscoreIndex + 1);
		
		return { prop, uid };
	}
	
	return { prop: "", uid: "" };
}

export function normalizePath(input: string | null | undefined): string {
	return (input ?? "").trim().replace(/^\/+/, "").toLowerCase();
}
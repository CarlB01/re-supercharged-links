/**
 * Super-robust normalization for emojis and text strings.
 * Strips emoji variation selectors (U+FE0F) and standardizes formatting.
 */
export const norm = (s: string | null | undefined): string =>
	(s || "")
		.normalize("NFC")
		.replace(/[\uFE00-\uFE0F]/g, "") // Stripper absolutt alle usynlige emoji-variasjonsvelgere
		.replace(/\s+/g, " ")
		.trim();

export const startsWithToken = (text: string | null | undefined, token: string | null | undefined): boolean => {
	const t = norm(text);
	const k = norm(token);
	return !!t && !!k && t.startsWith(k);
};

/**
 * Advanced, multi-window safe check verifying if a string ends with a specific token literal.
 * Uses a slice boundary lookup to eliminate bugs caused by hidden trailing space strings.
 */
export const endsWithToken = (text: string | null | undefined, token: string | null | undefined): boolean => {
	const t = norm(text);
	const k = norm(token);
	if (!t || !k || t.length < k.length) return false;

	// Sjekk om den rensede teksten slutter på ikonet, ELLER om ikonet finnes innenfor de 2 siste karakterene
	// (Dette fanger opp om det ligger en skjult, ustrippet byte helt på tampen av filnavnet i Obsidian)
	const standardMatch = t.endsWith(k);
	if (standardMatch) return true;

	const trailingSlice = t.slice(-k.length - 2);
	return trailingSlice.includes(k);
};


export function processKey(key: string): string {
	return key.trim().replace(/\s+/g, "-");
}

export function processValue(key: string, value: string): string {
	if (!value) return value;
	if (key.includes("publishedIn") && value.startsWith("[[") && value.endsWith("]]")) {
		return value.slice(2, -2);
	}
	return value;
}

export function normalizeTagToken(input: string): string {
	let s = norm(input);
	if (!s) return "";
	s = s.replace(/^[\s,;|]+|[\s,;|]+$/g, "");
	if (!s.startsWith("#")) s = `#${s}`;
	return s;
}

export function escCssString(v: string | null | undefined): string {
	return (v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function isHtmlElement(node: unknown): node is HTMLElement {
	return typeof node === "object" && node !== null && (node as Node).nodeType === 1;
}

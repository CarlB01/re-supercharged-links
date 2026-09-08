/**
 * Normalizes strings for robust comparison (NFC, flattens emoji presentation selectors, collapses whitespace).
 */
export const norm = (s: string | null | undefined): string =>
	(s || "")
		.normalize("NFC")
		.replace(/\uFE0F/g, "")
		.replace(/\s+/g, " ")
		.trim();

export const startsWithToken = (text: string | null | undefined, token: string | null | undefined): boolean => {
	const t = norm(text);
	const k = norm(token);
	return !!t && !!k && t.startsWith(k);
};

export const endsWithToken = (text: string | null | undefined, token: string | null | undefined): boolean => {
	const t = norm(text);
	const k = norm(token);
	return !!t && !!k && t.endsWith(k);
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

/**
 * Multi-window safe and high-performance check to verify if a node is an HTMLElement.
 * Eliminates Obsidian pop-out window context bugs without performance penalty.
 */
export function isHtmlElement(node: unknown): node is HTMLElement {
	return typeof node === "object" && node !== null && (node as Node).nodeType === 1;
}

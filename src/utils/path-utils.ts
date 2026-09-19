/**
 * Normalizes an Obsidian vault path for queue ingestion.
 * Fast string-operation pipeline that avoids regex overhead where possible.
 */
export function normalizePathForQueue(input: string): string {
	if (input.length === 0) return "";
	
	let trimmed: string = input.trim();
	// Fast-track forward slash clearing without regex engine overhead
	while (trimmed.startsWith("/")) {
		trimmed = trimmed.substring(1);
	}
	
	return trimmed.toLowerCase();
}

/**
 * Compacts a list of folder prefixes to remove redundant child paths.
 * Example: If ['src/', 'src/utils/'] is provided, it reduces down to just ['src/']
 * Optimized to run in O(N log N) via sorted positional matching.
 */
export function compactPrefixes(prefixes: string[]): string[] {
	if (prefixes.length === 0) return [];

	// 1) Enforce proper trailing slashes and filter out empty strings instantly
	const cleaned: string[] = [];
	prefixes.forEach((p) => {
		if (p.length === 0) return;
		cleaned.push(p.endsWith("/") ? p : `${p}/`);
	});

	if (cleaned.length <= 1) return cleaned;

	// 2) Sort alphabetically. This is a powerful trick: 
	// After sorting, any child folder WILL naturally sit directly after its parent!
	cleaned.sort();

	const output: string[] = [];
	// Always keep the very first element after sorting (it's the shallowest parent)
	let currentParent: string = cleaned[0] || ""; 
	if (currentParent.length > 0) {
		output.push(currentParent);
	}

	// 3) Linear scan - look forward and drop anything covered by the active parent
	for (let i = 1; i < cleaned.length; i += 1) {
		const nextPath: string = cleaned[i] || "";
		if (nextPath.length === 0) continue;

		// Since it's sorted, if it doesn't start with the current parent, 
		// it means we have moved to a completely new folder branch!
		if (!nextPath.startsWith(currentParent)) {
			currentParent = nextPath;
			output.push(currentParent);
		}
	}

	return output;
}

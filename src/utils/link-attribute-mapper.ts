/**
 * V8 OPTIMIZED: Transforms raw file metadata records into normalized data attributes.
 */
export function mapRawAttrsToDataAttrs(rawAttrs: Record<string, string>): Record<string, string> {
	const domAttributes: Record<string, string> = Object.create(null) as Record<string, string>;
	
	const keys = Object.keys(rawAttrs);
	const keysLen = keys.length;
	
	for (let i = 0; i < keysLen; i++) {
		const key = keys[i];
		
		if (key !== undefined) {
			const val = rawAttrs[key]; 
			
			if (val !== undefined && val !== null && val.length > 0) {
				domAttributes[`data-link-${key}`] = val;
			}
		}
	}
	return domAttributes;
}

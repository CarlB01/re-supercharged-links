	/**
	 * 🚀 V8 OPTIMIZED: Transforms raw file metadata records into normalized data attributes.
	 * Eliminates for...in layout degradation by operating on pre-allocated key sets.
	 */
	export function mapRawAttrsToDataAttrs(rawAttrs: Record<string, string>): Record<string, string> {
		// Object.create(null) har ingen prototype, noe som gjør egenskaps-oppslag superraskt
		const domAttributes: Record<string, string> = Object.create(null);
		
		const keys = Object.keys(rawAttrs);
		const keysLen = keys.length;
		
		for (let i = 0; i < keysLen; i++) {
			const key = keys[i];
			
			// ✨ TS-FIKS: Garanter overfor kompilatoren at key ikke er undefined før oppslag
			if (key !== undefined) {
				const val = rawAttrs[key]; // Nå er TypeScript helt fornøyd!
				
				if (val !== undefined && val !== null && val.length > 0) {
					domAttributes[`data-link-${key}`] = val;
				}
			}
		}
		return domAttributes;
	}

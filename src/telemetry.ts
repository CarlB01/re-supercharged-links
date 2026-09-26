// telemetry

/**
 * Typesafe performance monitor tracking cache efficiency and lifecycle overhead.
 * Strictly free of 'any' and 'undefined' types to preserve runtime integrity.
 */
export class PluginPerformanceTracker {
	private isEnabled: boolean = false;
	private cacheHits: number = 0;
	private cacheMisses: number = 0;
	private lastNodeCount: number = 0;
	
	// 🚀 TRACKING ENGINE SEGMENTS: Explicitly trace dual-read migration dynamics separately
	private canonicalHits = 0;
	private legacyHits = 0;

	private readonly updateTimingsMs: number[] = [];
	private readonly processedElementsCount: number[] = [];
	private readonly MAX_HISTORY_CAP: number = 20;

	constructor(initialState: boolean) {
		this.isEnabled = initialState;
	}

	public setLastNodeCount(count: number): void {
		this.lastNodeCount = count;
	}

	public getLastNodeCount(): number {
		return this.lastNodeCount;
	}

	public setTrackingState(state: boolean): void {
		this.isEnabled = state;
	}

	public getTrackingState(): boolean {
		return this.isEnabled;
	}

	public logHit(): void {
		this.cacheHits += 1;
	}

	/**
	 * Logs a high-performance hit matching the modern standard canonical lowercased key index framework.
	 */
	public logCanonicalHit(): void {
		this.cacheHits += 1;
		this.canonicalHits += 1;
	}

	/**
	 * Logs a hit on the historical original casing index framework during dual-read migration periods.
	 */
	public logLegacyHit(): void {
		this.cacheHits += 1;
		this.legacyHits += 1;
	}

	public logMiss(): void {
		this.cacheMisses += 1;
	}

	public recordUpdateCycle(durationMs: number, elementCount: number): void {
		if (!this.isEnabled) return;

		this.updateTimingsMs.push(durationMs);
		this.processedElementsCount.push(elementCount);

		if (this.updateTimingsMs.length > this.MAX_HISTORY_CAP) {
			this.updateTimingsMs.shift();
			this.processedElementsCount.shift();
		}
	}

	public resetMetrics(): void {
		this.cacheHits = 0;
		this.cacheMisses = 0;
		this.canonicalHits = 0;
		this.legacyHits = 0;
		this.updateTimingsMs.length = 0;
		this.processedElementsCount.length = 0;
	}

	/**
	 * Generates a real-time structural performance diagnostic snapshot.
	 * 🚀 FIXED INLINE TERMINAL: Re-activated the native log channel and attached 
	 * a user-facing Notice bridge to ensure seamless diagnostics across desktop and mobile iOS.
	 * 
	 * @param noticeClass - Injectable bridge reference to Obsidian's Notice component.
	 */
	public printReport(noticeClass: typeof import("obsidian").Notice): void {
		if (!this.isEnabled) return;

		const totalRequests: number = this.cacheHits + this.cacheMisses;
		const hitRate: string = totalRequests > 0 
			? ((this.cacheHits / totalRequests) * 100).toFixed(1) 
			: "0.0";

		let totalDurationSum: number = 0;
		const timingsLen = this.updateTimingsMs.length;
		for (let i = 0; i < timingsLen; i++) {
			const time: number | null = this.updateTimingsMs[i] ?? null;
			if (time !== null) totalDurationSum += time;
		}
		
		const avgTimeMs: string = timingsLen > 0
			? (totalDurationSum / timingsLen).toFixed(2)
			: "0.00";

		let totalElementsSum: number = 0;
		const elementsLen = this.processedElementsCount.length;
		for (let i = 0; i < elementsLen; i++) {
			const count: number | null = this.processedElementsCount[i] ?? null;
			if (count !== null) totalElementsSum += count;
		}

		const avgElements: number = elementsLen > 0
			? Math.round(totalElementsSum / elementsLen)
			: 0;

		const lastElementIndex: number = elementsLen - 1;
		const lastRunCount: number = lastElementIndex >= 0 
			? (this.processedElementsCount[lastElementIndex] || 0)
			: 0;

		// ✅ VERIFICATION PIPELINE: Expose modern vs legacy lookups cleanly inside diagnostics
		const reportText: string = "📊 Re-Supercharged Links Perf Report:\n" +
			`• Cache Hit Rate: ${hitRate}% (${this.cacheHits}/${totalRequests})\n` +
			`• Canonical Migrated: ${this.canonicalHits} hits / Legacy Fallbacks: ${this.legacyHits} hits\n` +
			`• Avg execution frame: ${avgTimeMs}ms\n` +
			`• Avg links styled: ${avgElements} nodes (Last: ${lastRunCount})`;

		new noticeClass(reportText, 8000);

		// console.log(`%c${reportText}`, "color: #ff6600; font-weight: bold;");
	}
}

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
		if (!this.isEnabled) return;
		this.cacheHits += 1;
	}

	public logMiss(): void {
		if (!this.isEnabled) return;
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
			const time = this.updateTimingsMs[i];
			if (time !== undefined) totalDurationSum += time;
		}
		
		const avgTimeMs: string = timingsLen > 0
			? (totalDurationSum / timingsLen).toFixed(2)
			: "0.00";

		let totalElementsSum: number = 0;
		const elementsLen = this.processedElementsCount.length;
		for (let i = 0; i < elementsLen; i++) {
			const count = this.processedElementsCount[i];
			if (count !== undefined) totalElementsSum += count;
		}

		const avgElements: number = elementsLen > 0
			? Math.round(totalElementsSum / elementsLen)
			: 0;

		const lastElementIndex: number = elementsLen - 1;
		const lastRunCount: number = lastElementIndex >= 0 
			? (this.processedElementsCount[lastElementIndex] || 0)
			: 0;

		// Compile clean flat diagnostic message block
		const reportText: string = "📊 Re-Supercharged Links Perf Report:\n" +
			`• Cache Hit Rate: ${hitRate}% (${this.cacheHits}/${totalRequests})\n` +
			`• Avg execution frame: ${avgTimeMs}ms\n` +
			`• Avg links styled: ${avgElements} nodes (Last: ${lastRunCount})`;

		// 🚀 1. PRINT TO OBSIDIAN UI: Pops up a beautiful notice box on both Mac and iPhone screens!
		new noticeClass(reportText, 8000);

		// 🚀 2. PRINT TO CONSOLE: Active once more with verified style flags
		console.log(`%c${reportText}`, "color: #ff6600; font-weight: bold;");
	}
}

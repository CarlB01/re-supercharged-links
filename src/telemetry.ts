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

	public printReport(): void {
		if (!this.isEnabled) return;

		const totalRequests: number = this.cacheHits + this.cacheMisses;
		const hitRate: string = totalRequests > 0 
			? ((this.cacheHits / totalRequests) * 100).toFixed(1) 
			: "0.0";

		let totalDurationSum: number = 0;
		this.updateTimingsMs.forEach((time) => { totalDurationSum += time; });
		
		const avgTimeMs: string = this.updateTimingsMs.length > 0
			? (totalDurationSum / this.updateTimingsMs.length).toFixed(2)
			: "0.00";

		let totalElementsSum: number = 0;
		this.processedElementsCount.forEach((count) => { totalElementsSum += count; });

		const avgElements: number = this.processedElementsCount.length > 0
			? Math.round(totalElementsSum / this.processedElementsCount.length)
			: 0;

		const lastElementIndex: number = this.processedElementsCount.length - 1;
		const lastRunCount: number = lastElementIndex >= 0 
			? (this.processedElementsCount[lastElementIndex] || 0)
			: 0;

		// 🔑 FLATTET UT: Ingen mystiske linjeskift som kan lure esbuild under kompilering!
		const reportText: string = "[Supercharged Links Perf]\n" +
			`• Cache Hit Rate: ${hitRate}% (${this.cacheHits}/${totalRequests})\n` +
			`• Average execution: ${avgTimeMs}ms\n` +
			`• Average links styled: ${avgElements} nodes (Last frame: ${lastRunCount})`;

		console.log(`%c${reportText}`, "color: #ff6600; font-weight: bold;");
	}

}

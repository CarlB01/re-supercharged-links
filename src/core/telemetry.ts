/**
 * Typesafe performance monitor tracking cache efficiency, structural barriers, and lifecycle overhead.
 * Stripped of legacy fallback overhead for pure canonical production rendering.
 */
export class PluginPerformanceTracker {
	private isEnabled: boolean = false;
	private cacheHits: number = 0;
	private cacheMisses: number = 0;
	
	private barrierSkips: number = 0;       
	private totalNodesEvaluated: number = 0; 
	private maxExecutionTimeMs: number = 0;  

	private readonly updateTimingsMs: number[] = [];
	private readonly processedElementsCount: number[] = [];
	private readonly MAX_HISTORY_CAP: number = 25; 

	constructor(initialState: boolean) {
		this.isEnabled = initialState;
	}

	public setTrackingState(state: boolean): void {
		this.isEnabled = state;
	}

	public getTrackingState(): boolean {
		return this.isEnabled;
	}

	/**
	 * Logs when strict O(1) Set barriers (.has()) successfully blocks redundant re-processing.
	 */
	public logBarrierSkip(): void {
		if (!this.isEnabled) return;
		this.barrierSkips += 1;
		this.totalNodesEvaluated += 1;
	}

	/**
	 * Logs a high-performance hit matching the modern standard canonical framework.
	 */
	public logHit(): void {
		if (!this.isEnabled) return;
		this.cacheHits += 1;
		this.totalNodesEvaluated += 1;
	}

	public logMiss(): void {
		if (!this.isEnabled) return;
		this.cacheMisses += 1;
		this.totalNodesEvaluated += 1;
	}

	public recordUpdateCycle(durationMs: number, elementCount: number): void {
		if (!this.isEnabled) return;

		this.updateTimingsMs.push(durationMs);
		this.processedElementsCount.push(elementCount);

		if (durationMs > this.maxExecutionTimeMs) {
			this.maxExecutionTimeMs = durationMs;
		}

		if (this.updateTimingsMs.length > this.MAX_HISTORY_CAP) {
			this.updateTimingsMs.shift();
			this.processedElementsCount.shift();
		}
	}

	public resetMetrics(): void {
		this.cacheHits = 0;
		this.cacheMisses = 0;
		this.barrierSkips = 0;
		this.totalNodesEvaluated = 0;
		this.maxExecutionTimeMs = 0;
		this.updateTimingsMs.length = 0;
		this.processedElementsCount.length = 0;
	}

	/**
	 * ✨ TIDLØS FIKS: Eksplisitt public getter som gjør telleren tilgjengelig for main.ts
	 */
	public getTotalNodesEvaluated(): number {
		return this.totalNodesEvaluated;
	}

	/**
	 * Generates a real-time structural performance diagnostic snapshot.
	 */
	public printReport(noticeClass: typeof import("obsidian").Notice): void {
		if (!this.isEnabled) return;

		const totalCacheRequests: number = this.cacheHits + this.cacheMisses;
		const cacheHitRate: string = totalCacheRequests > 0 
			? ((this.cacheHits / totalCacheRequests) * 100).toFixed(1) 
			: "0.0";

		const barrierEfficiency: string = this.totalNodesEvaluated > 0
			? ((this.barrierSkips / this.totalNodesEvaluated) * 100).toFixed(1)
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

		const reportText: string = "📊 Re-Supercharged Links Perf Report:\n" +
			`• Total Nodes Evaluated: ${this.totalNodesEvaluated}\n` +
			`• O(1) Barrier Skip Rate: ${barrierEfficiency}% (${this.barrierSkips} exits)\n` +
			`• Internal Cache Hit Rate: ${cacheHitRate}% (${this.cacheHits}/${totalCacheRequests})\n` +
			`• Frame Time (Avg / Max): ${avgTimeMs}ms / ${this.maxExecutionTimeMs.toFixed(2)}ms\n` +
			`• DOM Batches Flushed: ${timingsLen} (Avg: ${avgElements} nodes, Last: ${lastRunCount})`;

		new noticeClass(reportText, 12000);
	}
}

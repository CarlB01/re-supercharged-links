type PerfMetricKey = "updateVisibleLinks" | "updateContainer" | "resolveRuleResolution";

interface PerfStats {
	count: number;
	totalMs: number;
	maxMs: number;
	minMs: number;
}

const PERF_ENABLED: boolean = false; // sett til false før release
const REPORT_EVERY_N: number = 1000;

const statsMap: Record<PerfMetricKey, PerfStats> = {
	updateVisibleLinks: { count: 0, totalMs: 0, maxMs: 0, minMs: Number.POSITIVE_INFINITY },
	updateContainer: { count: 0, totalMs: 0, maxMs: 0, minMs: Number.POSITIVE_INFINITY },
	resolveRuleResolution: { count: 0, totalMs: 0, maxMs: 0, minMs: Number.POSITIVE_INFINITY }
};

export function measurePerf<T>(key: PerfMetricKey, fn: () => T): T {
	if (!PERF_ENABLED) return fn();

	const start: number = performance.now();
	try {
		return fn();
	} finally {
		const duration: number = performance.now() - start;
		recordMetric(key, duration);
	}
}

export async function measurePerfAsync<T>(key: PerfMetricKey, fn: () => Promise<T>): Promise<T> {
	if (!PERF_ENABLED) return fn();

	const start: number = performance.now();
	try {
		return await fn();
	} finally {
		const duration: number = performance.now() - start;
		recordMetric(key, duration);
	}
}

function recordMetric(key: PerfMetricKey, durationMs: number): void {
	const metric: PerfStats = statsMap[key];
	metric.count += 1;
	metric.totalMs += durationMs;
	if (durationMs > metric.maxMs) metric.maxMs = durationMs;
	if (durationMs < metric.minMs) metric.minMs = durationMs;

	if (metric.count % REPORT_EVERY_N === 0) {
		const avgMs: number = metric.totalMs / metric.count;
		const minMs: number = metric.minMs === Number.POSITIVE_INFINITY ? 0 : metric.minMs;

		console.info(
			`[SCL PERF] ${key} count=${metric.count} avg=${avgMs.toFixed(2)}ms min=${minMs.toFixed(2)}ms max=${metric.maxMs.toFixed(2)}ms`
		);
	}
}
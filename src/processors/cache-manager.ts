import { PluginPerformanceTracker } from "../core/telemetry";
import { extractPathFromCacheKey, normalizeCachePath } from "../utils/shared-utils";

/**
 * Encapsulates all metadata cache lifecycles, entry caps, and inverted path index logic.
 */
export class AttributeCacheManager {
	private readonly attrCycleCache: Map<string, Record<string, string>>;
	private readonly attrCacheTouchedAt: Map<string, number> = new Map();
	private readonly recentPathTouches: Map<string, number> = new Map();
	private readonly telemetry: PluginPerformanceTracker;

	private readonly pathIndex: Map<string, Set<string>> = new Map();

	private readonly ATTR_CACHE_TTL_MS: number = 5 * 60 * 1000; // 5 min
	private readonly ATTR_CACHE_MAX_ENTRIES: number = 4000;
	private readonly PATH_TOUCH_PRUNE_AGE_MS: number = 10_000;
	private readonly PATH_TOUCH_MAX_ENTRIES: number = 2000;
	private readonly PATH_TOUCH_COOLDOWN_MS: number = 400;

	constructor(
		cacheMap: Map<string, Record<string, string>>, 
		tracker: PluginPerformanceTracker
	) {
		this.attrCycleCache = cacheMap;
		this.telemetry = tracker;
	}

	public getPathIndex(): Map<string, Set<string>> {
		return this.pathIndex;
	}

	public touchAttrCacheKey(key: string): void {
		if (key.length === 0) return;
		this.attrCacheTouchedAt.set(key, Date.now());
	}

	/**
	 * Registers a fresh cache signature and links it directly to its structural file source path.
	 */
	public registerIndexedKey(path: string, key: string): void {
		if (path.length === 0 || key.length === 0) return;
		
		const normalizedPath: string = normalizeCachePath(path);

		let set: Set<string> | undefined = this.pathIndex.get(normalizedPath);
		if (set === undefined) { 
			set = new Set<string>();
			this.pathIndex.set(normalizedPath, set);
		}
		set.add(key);
	}

	/**
	 * Cleans a distinct cache key directly from the inverted path index trackers.
	 */
	public removeKeyFromIndex(path: string, key: string): void {
		if (path.length === 0 || key.length === 0) return;

		const normalizedPath: string = normalizeCachePath(path);

		const set: Set<string> | undefined = this.pathIndex.get(normalizedPath);
		if (set !== undefined) {
			set.delete(key);
			if (set.size === 0) {
				this.pathIndex.delete(normalizedPath);
			}
		}
	}

	/**
	 * Evicts a specific file path from the live cache map and updates the inverted index structure.
	 */
	public invalidatePath(path: string): void {
		if (path.length === 0) return;
		
		const normalizedPath: string = normalizeCachePath(path);

		const targetKeys: Set<string> | undefined = this.pathIndex.get(normalizedPath);

		if (targetKeys !== undefined) {
			for (const key of targetKeys) {
				if (key !== null && key !== undefined) {
					this.attrCycleCache.delete(key);
					this.attrCacheTouchedAt.delete(key);
				}
			}
			this.pathIndex.delete(normalizedPath);
		}
		this.recentPathTouches.delete(normalizedPath);
	}

	/**
	 * Cascades downward through the inverted index keys to drop cache signatures originating under a folder prefix.
	 */
	public invalidatePrefix(prefix: string): void {
		if (prefix.length === 0) return;

		const normalizedPrefix: string = normalizeCachePath(prefix);
		const cleanPrefix: string = normalizedPrefix.endsWith("/") ? normalizedPrefix : `${normalizedPrefix}/`;

		const pathsToDelete: string[] = [];

		for (const [currentPath] of this.pathIndex) {
			const cleanCurrent: string = normalizeCachePath(currentPath);
			if (cleanCurrent === normalizedPrefix || cleanCurrent.startsWith(cleanPrefix)) {
				pathsToDelete.push(currentPath);
			}
		}

		for (const targetPath of pathsToDelete) {
				this.invalidatePath(targetPath); 
		}
	}


	public markPathTouched(path: string): void {
		if (path.length === 0) return;

		const normalizedPath: string = normalizeCachePath(path);
		this.recentPathTouches.set(normalizedPath, Date.now());
	}

	public wasPathTouchedRecently(path: string): boolean {
		if (path.length === 0) return false;

		const normalizedPath: string = normalizeCachePath(path);

		const last: number = this.recentPathTouches.get(normalizedPath) ?? 0;
		if (last === 0) return false;
		return Date.now() - last < this.PATH_TOUCH_COOLDOWN_MS;
	}

	public clearAllCache(): void {
		this.attrCycleCache.clear();
		this.attrCacheTouchedAt.clear();
		this.pathIndex.clear();
	}

	public runLifecyclePrune(): void {
		const nowTs: number = Date.now();
		this.pruneRecentPathTouches(nowTs);
		this.pruneAttrCycleCache(nowTs);
	}

	private evictEntry(key: string): void {
		this.removeKeyFromIndexFromRawKey(key);
		this.attrCycleCache.delete(key);
		this.attrCacheTouchedAt.delete(key);
	}

	private pruneRecentPathTouches(nowTs: number): void {
		if (this.recentPathTouches.size === 0) return;
		
		// 1. Remove outdated elements
		for (const [path, ts] of this.recentPathTouches) {
			if (nowTs - ts > this.PATH_TOUCH_PRUNE_AGE_MS) {
				this.recentPathTouches.delete(path);
			}
		}

		// 2. Handle overflow
		if (this.recentPathTouches.size > this.PATH_TOUCH_MAX_ENTRIES) {
			let overflow: number = this.recentPathTouches.size - this.PATH_TOUCH_MAX_ENTRIES;
			
			for (const [path] of this.recentPathTouches) {
				this.recentPathTouches.delete(path);
				overflow--;
				if (overflow <= 0) break;
			}
		}
	}

	private pruneAttrCycleCache(nowTs: number): void {
		if (this.attrCycleCache.size === 0) return;

		// 1. TTL-clean
		for (const [key] of this.attrCycleCache) {
			const ts: number = this.attrCacheTouchedAt.get(key) ?? 0;
			if (ts === 0 || nowTs - ts > this.ATTR_CACHE_TTL_MS) {
				this.evictEntry(key);
			}
		}

		// 2. LRU-evict if overflow
		if (this.attrCycleCache.size > this.ATTR_CACHE_MAX_ENTRIES) {
			let overflow: number = this.attrCycleCache.size - this.ATTR_CACHE_MAX_ENTRIES;
			
			for (const [key] of this.attrCacheTouchedAt) {
				if (this.attrCycleCache.has(key)) {
					this.evictEntry(key);
					overflow--;
					if (overflow <= 0) break;
				}
			}
		}
	}

	private removeKeyFromIndexFromRawKey(key: string): void {
		const extractedPath: string | null = extractPathFromCacheKey(key);
		if (extractedPath !== null) {
			this.removeKeyFromIndex(normalizeCachePath(extractedPath), key);
		}
	}
}

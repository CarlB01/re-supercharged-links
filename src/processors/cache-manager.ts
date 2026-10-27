import { extractPathFromCacheKey, normalizeCachePath } from "../utils/shared-utils";

/**
 * Encapsulates all metadata cache lifecycles, entry caps, and inverted path index logic.
 * Fully optimized for unified canonical storage mapping without V8 map iteration degradation.
 */
export class AttributeCacheManager {
	private readonly attrCycleCache: Map<string, Record<string, string>>;
	private readonly attrCacheTouchedAt: Map<string, number> = new Map();
	private readonly recentPathTouches: Map<string, number> = new Map();

	private readonly pathIndex: Map<string, Set<string>> = new Map();

	// Pre-sized capacities preventing dynamic V8 memory recycling during long sessions
	private readonly ATTR_CACHE_TTL_MS: number = 10 * 60 * 1000; // 10 minutes
	private readonly ATTR_CACHE_MAX_ENTRIES: number = 32768;    // Supports large production vaults cleanly
	private readonly PATH_TOUCH_PRUNE_AGE_MS: number = 10_000;
	private readonly PATH_TOUCH_MAX_ENTRIES: number = 4000;
	private readonly PATH_TOUCH_COOLDOWN_MS: number = 400;

	constructor(cacheMap: Map<string, Record<string, string>>) {
		this.attrCycleCache = cacheMap;
	}

	public getPathIndex(): Map<string, Set<string>> {
		return this.pathIndex;
	}

	/**
	 * Updates the timestamp and repositions the key to enforce true insertion-order LRU tracking in V8.
	 */
	public touchAttrCacheKey(key: string): void {
		if (key.length === 0) return;
		// Deleting and resetting the key pushes it to the very end of V8's map iterator queue
		this.attrCacheTouchedAt.delete(key);
		this.attrCacheTouchedAt.set(key, Date.now());
	}

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

	public invalidatePath(path: string): void {
		if (path.length === 0) return;
		
		const normalizedPath: string = normalizeCachePath(path);
		const targetKeys: Set<string> | undefined = this.pathIndex.get(normalizedPath);

		if (targetKeys !== undefined) {
			// Copy keys out to avoid cross-mutation issues during index eviction loops
			const keysArray: string[] = Array.from(targetKeys);
			const len = keysArray.length;
			
			for (let i = 0; i < len; i++) {
				const key = keysArray[i];
				if (key !== undefined && key !== null) {
					this.attrCycleCache.delete(key);
					this.attrCacheTouchedAt.delete(key);
				}
			}
			this.pathIndex.delete(normalizedPath);
		}
		this.recentPathTouches.delete(normalizedPath);
	}

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

		const deleteLen = pathsToDelete.length;
		for (let i = 0; i < deleteLen; i++) {
			const targetPath = pathsToDelete[i];
			if (targetPath !== undefined) {
				this.invalidatePath(targetPath); 
			}
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
		
		const expiredPaths: string[] = [];
		for (const [path, ts] of this.recentPathTouches) {
			if (nowTs - ts > this.PATH_TOUCH_PRUNE_AGE_MS) {
				expiredPaths.push(path);
			}
		}

		const expiredLen = expiredPaths.length;
		for (let i = 0; i < expiredLen; i++) {
			const path = expiredPaths[i];
			if (path !== undefined) this.recentPathTouches.delete(path);
		}

		if (this.recentPathTouches.size > this.PATH_TOUCH_MAX_ENTRIES) {
			let overflow: number = this.recentPathTouches.size - this.PATH_TOUCH_MAX_ENTRIES;
			const overflowPaths: string[] = [];

			for (const [path] of this.recentPathTouches) {
				overflowPaths.push(path);
				overflow--;
				if (overflow <= 0) break;
			}

			const overflowLen = overflowPaths.length;
			for (let i = 0; i < overflowLen; i++) {
				const path = overflowPaths[i];
				if (path !== undefined) this.recentPathTouches.delete(path);
			}
		}
	}

	private pruneAttrCycleCache(nowTs: number): void {
		if (this.attrCycleCache.size === 0) return;

		const expiredKeys: string[] = [];
		for (const [key] of this.attrCycleCache) {
			const ts: number = this.attrCacheTouchedAt.get(key) ?? 0;
			if (ts === 0 || nowTs - ts > this.ATTR_CACHE_TTL_MS) {
				expiredKeys.push(key);
			}
		}

		const expiredLen = expiredKeys.length;
		for (let i = 0; i < expiredLen; i++) {
			const key = expiredKeys[i];
			if (key !== undefined) this.evictEntry(key);
		}

		if (this.attrCycleCache.size > this.ATTR_CACHE_MAX_ENTRIES) {
			let overflow: number = this.attrCycleCache.size - this.ATTR_CACHE_MAX_ENTRIES;
			const overflowKeys: string[] = [];

			for (const [key] of this.attrCacheTouchedAt) {
				if (this.attrCycleCache.has(key)) {
					overflowKeys.push(key);
					overflow--;
					if (overflow <= 0) break;
				}
			}

			const overflowLen = overflowKeys.length;
			for (let i = 0; i < overflowLen; i++) {
				const key = overflowKeys[i];
				if (key !== undefined) this.evictEntry(key);
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

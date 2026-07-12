import type { EnvPair } from "@envhq/parser";

export interface ThreeWayDiff {
  toUpsert: EnvPair[];
  toDelete: string[];
}

/**
 * Three-way diff for `push`: base (last-synced key names) / local (current
 * file) / remote (live server pairs).
 *
 *   - local − base                     → upsert (new local key)
 *   - base ∩ local, value ≠ remote     → upsert (changed since last sync)
 *   - base − local, still in remote    → delete (removed locally since last sync)
 *   - remote − base                    → left untouched (never seen by this
 *     client — this is what stops a stale/partial local file from mass-
 *     deleting cloud state it doesn't know about)
 */
export function computeThreeWayDiff(
  localPairs: EnvPair[],
  baseKeys: string[],
  remotePairs: EnvPair[],
): ThreeWayDiff {
  const baseSet = new Set(baseKeys);
  const remoteMap = new Map(remotePairs.map((p) => [p.key, p.value]));
  const localMap = new Map(localPairs.map((p) => [p.key, p.value]));

  const toUpsert: EnvPair[] = [];
  for (const { key, value } of localPairs) {
    if (!baseSet.has(key) || remoteMap.get(key) !== value) {
      toUpsert.push({ key, value });
    }
  }

  const toDelete: string[] = [];
  for (const key of baseKeys) {
    if (!localMap.has(key) && remoteMap.has(key)) {
      toDelete.push(key);
    }
  }

  return { toUpsert, toDelete };
}

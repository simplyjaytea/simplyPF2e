/**
 * Share one load per key, including while it is pending. Successful results
 * live for the session; failed loads are removed so the next call can retry.
 * Pack loaders use the actual pack object as their key, so replacing a pack
 * cannot return an earlier collection's cached data.
 */
export function createAsyncCache() {
  const cache = new Map();
  return (key, load) => {
    if (!cache.has(key)) {
      const pending = Promise.resolve().then(load).catch((error) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, pending);
    }
    return cache.get(key);
  };
}

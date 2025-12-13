/**
 * Lightweight LRU cache backed by Web Storage (sessionStorage/localStorage).
 * - Persists for the browser session when using sessionStorage
 * - Evicts least-recently-used entries when maxEntries is exceeded
 *
 * Values must be JSON-serializable.
 */
export class Cache {
  /**
   * @param {{ key: string, maxEntries?: number, storage?: 'session'|'local' }} opts
   */
  constructor({ key, maxEntries = 50, storage = 'session' }) {
    if (!key || typeof key !== 'string') {
      throw new Error('Cache requires a storage key');
    }
    this.key = key;
    this.maxEntries = Math.max(1, maxEntries);
    this.storageType = storage;
  }

  /**
   * @template T
   * @param {string} itemKey
   * @returns {T|null}
   */
  get(itemKey) {
    if (!itemKey || typeof itemKey !== 'string') return null;
    try {
      const storage = this._getStorage();
      if (!storage) return null;

      const state = this._readState(storage);
      const entry = state.entries[itemKey];
      if (!entry) return null;

      // Touch LRU
      state.order = [itemKey, ...state.order.filter((k) => k !== itemKey)].slice(0, this.maxEntries);
      this._writeState(storage, state);

      return entry.value ?? null;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} itemKey
   * @param {any} value
   */
  set(itemKey, value) {
    if (!itemKey || typeof itemKey !== 'string') return;
    try {
      const storage = this._getStorage();
      if (!storage) return;

      const state = this._readState(storage);
      state.entries[itemKey] = { value, cachedAt: Date.now() };
      state.order = [itemKey, ...state.order.filter((k) => k !== itemKey)];

      // Evict beyond maxEntries
      const evicted = state.order.slice(this.maxEntries);
      evicted.forEach((k) => {
        delete state.entries[k];
      });
      state.order = state.order.slice(0, this.maxEntries);

      this._writeState(storage, state);
    } catch {
    }
  }

  /**
   * @param {string} itemKey
   */
  delete(itemKey) {
    if (!itemKey || typeof itemKey !== 'string') return;
    try {
      const storage = this._getStorage();
      if (!storage) return;

      const state = this._readState(storage);
      delete state.entries[itemKey];
      state.order = state.order.filter((k) => k !== itemKey);
      this._writeState(storage, state);
    } catch {
      // ignore
    }
  }

  clear() {
    try {
      const storage = this._getStorage();
      if (!storage) return;
      storage.removeItem(this.key);
    } catch {
      // ignore
    }
  }

  /**
   * @private
   * @returns {Storage|null}
   */
  _getStorage() {
    try {
      if (this.storageType === 'local') return window.localStorage;
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  /**
   * @private
   * @param {Storage} storage
   * @returns {{ order: string[], entries: Record<string, {value: any, cachedAt: number}> }}
   */
  _readState(storage) {
    const raw = storage.getItem(this.key);
    if (!raw) return { order: [], entries: {} };

    try {
      const parsed = JSON.parse(raw);
      return {
        order: Array.isArray(parsed?.order) ? parsed.order : [],
        entries: parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      };
    } catch {
      return { order: [], entries: {} };
    }
  }

  /**
   * @private
   * @param {Storage} storage
   * @param {{ order: string[], entries: Record<string, {value: any, cachedAt: number}> }} state
   */
  _writeState(storage, state) {
    storage.setItem(this.key, JSON.stringify(state));
  }
}



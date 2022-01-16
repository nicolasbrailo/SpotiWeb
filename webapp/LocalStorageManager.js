import { GlobalUI } from './ui.js';

export class LocalStorageManager {
  constructor(max_cache_age_secs) {
    this.max_cache_age_secs = max_cache_age_secs;
    this.cache_idx = this.get('cache_idx', {});
    if (typeof(this.cache_idx) != typeof({})) {
      GlobalUI.showErrorUi("Can't read local storage, will clear cache");
      this.cache_idx = {};
      this.save('cache_idx', this.cache_idx);
      localStorage.clear();
    }
  }

  get(key, default_val) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v? v : default_val;
    } catch (e) {
      return default_val;
    }
  }

  save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  cacheGet(key) {
    const last_update = this.cache_idx[key] || 0;
    const age = Date.now() - last_update;
    const cache_is_old = (age > 1000 * this.max_cache_age_secs);
    if (cache_is_old) {
      localStorage.removeItem(key);
      return null;
    }
    return this.get(key, null);
  }

  cacheSave(key, val) {
    this.cache_idx[key] = Date.now();
    this.save('cache_idx', this.cache_idx);
    this.save(key, val);
  }
};

export class CollectionManager {
  constructor(storage) {
    this.storage = storage;
  }

  fetch(cb) {
    W.getJson("/api/fetch_all", col => {
      col.genres.sort();
      $.each(col.artists_by_genre, (_,arts) => { arts.sort(); });
      this.storage.cacheSave('collection', col);
      cb(col);
    });
  }

  cachedFetch(cb) {
    const col = this.storage.cacheGet('collection');
    if (col) return cb(col);
    GlobalUI.showErrorUi("Collection cache not valid, refetching");
    return this.fetch(cb);
  }
};

export class RecentlyPlayed {
  constructor(storage, maxEntries) {
    this.storage = storage;
    this.maxEntries = maxEntries;
  }

  get() {
    var lastPlayed = this.storage.get('lastPlayed', []);
    if (!Array.isArray(lastPlayed)) return [];
    return lastPlayed.reverse();
  }

  add(art) {
    var newLastPlayed = this.get().filter(x => x != art);
    newLastPlayed.push(art);

    if (newLastPlayed.length > this.maxEntries) {
      newLastPlayed = newLastPlayed.slice(1, this.maxEntries + 1);
    }

    this.storage.save('lastPlayed', newLastPlayed);
  }
};



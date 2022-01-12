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


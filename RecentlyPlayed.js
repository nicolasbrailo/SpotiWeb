
window.foo = (l, art, max=5) => {
    const newLastPlayed = l.reverse().filter(x => x != art);

    if (art != null) {
      newLastPlayed.push(art);
    }

    while (newLastPlayed.length > max) {
      newLastPlayed.shift();
    }

    return newLastPlayed.reverse();
}

export class RecentlyPlayed {
  constructor(storage, maxEntries) {
    this.storage = storage;
    this.maxEntries = maxEntries;
  }

  setRecentlyPlayedCount(cnt) {
    console.log(`Will remember ${cnt} recently played entries`);
    this.maxEntries = cnt;
    // Trigger rebuild to remove entries over limit
    this.add(null);
  }

  _get() {
    var lastPlayed = this.storage.get('lastPlayed', []);
    if (!Array.isArray(lastPlayed)) return [];
    return lastPlayed;
  }

  get() {
    return this._get().reverse();
  }

  add(art) {
    const newLastPlayed = this._get().filter(x => x != art);

    if (art != null) {
      newLastPlayed.push(art);
    }

    while (newLastPlayed.length > this.maxEntries) {
      newLastPlayed.shift();
    }

    this.storage.save('lastPlayed', newLastPlayed);
  }
};



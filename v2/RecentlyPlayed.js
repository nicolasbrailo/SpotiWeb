
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

  get() {
    var lastPlayed = this.storage.get('lastPlayed', []);
    if (!Array.isArray(lastPlayed)) return [];
    return lastPlayed.reverse();
  }

  add(art) {
    var newLastPlayed = this.get().filter(x => x != art);

    if (art != null) {
      newLastPlayed.push(art);
    }

    if (newLastPlayed.length > this.maxEntries) {
      newLastPlayed = newLastPlayed.slice(1, this.maxEntries + 1);
    }

    this.storage.save('lastPlayed', newLastPlayed);
  }
};



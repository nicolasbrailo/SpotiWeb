import { GlobalUI } from './UiGlobal.js';
import { groupAndIndexGenres, getInterestingAttrsFromSpotifyArtistList } from './GenreClassifier.js';

export class CollectionManager {
  FOLLOWED_ARTISTS_STORAGE_KEY = "FOLLOWED_ARTISTS_STORAGE_KEY";

  constructor(storage, spotify) {
    this.storage = storage;
    this.spotify = spotify;
    this.ready = $.Deferred();

    GlobalUI.notifyNewRequestOnFlight();

    this.artistIndex = null;
    this.genresIndex = null;
    const cache = this.storage.get(this.FOLLOWED_ARTISTS_STORAGE_KEY);
    if (cache && cache.artistIndex) {
      try {
        this.artistIndex = new Map(JSON.parse(cache.artistIndex));
      } catch (e) {
        console.log("Cached artist index isn't valid");
      }
    }
    if (cache && cache.genresIndex) {
      try {
        this.genresIndex = new Map(JSON.parse(cache.genresIndex));
      } catch (e) {
        console.log("Cached genre index isn't valid");
      }
    }

    let valid_cache = true;
    valid_cache &= this.genresIndex && this.genresIndex.size > 0;
    valid_cache &= this.artistIndex && this.artistIndex.size > 0;

    if (valid_cache) {
      console.log("Got collection from cache");
      GlobalUI.notifyRequestFinished();
      this.ready.resolve();
    } else {
      console.log("Collection from cache is not valid, reload collection");
      this._refreshFollowedArtists(this.ready);
    }
  }

  refreshFollowedArtists() {
    const ready = $.Deferred();
    this._refreshFollowedArtists(ready);
    return ready;
  }

  _refreshFollowedArtists(promise) {
    console.log("Refreshing collection from Spotify");
    this.spotify.ready.then(() => {
      this.spotify.fetchFollowedArtists().then(lst => {
        console.log("Retrieved full followed artist list, got", lst.length, "artists");
        const raw_arts = getInterestingAttrsFromSpotifyArtistList(lst);
        console.log("Transmogrifying artist list, have", raw_arts.length, "artists");
        const arts = groupAndIndexGenres(raw_arts);
        this.genresIndex = arts.genresIndex;
        this.artistIndex = arts.artistIndex;

        const serializedArts = arts;
        serializedArts.artistIndex = JSON.stringify(Array.from(arts.artistIndex.entries()));
        serializedArts.genresIndex = JSON.stringify(Array.from(arts.genresIndex.entries()));
        this.storage.save(this.FOLLOWED_ARTISTS_STORAGE_KEY, serializedArts);

        GlobalUI.notifyRequestFinished();
        promise.resolve();
      });
    });
  }
}


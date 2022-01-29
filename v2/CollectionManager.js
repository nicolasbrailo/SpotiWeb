import { GlobalUI } from './UiGlobal.js';
import { groupAndIndexGenres } from './GenreClassifier.js';

export class CollectionManager {
  FOLLOWED_ARTISTS_STORAGE_KEY = "FOLLOWED_ARTISTS_STORAGE_KEY";

  constructor(storage, spotify) {
    this.storage = storage;
    this.spotify = spotify;
    this.ready = $.Deferred();

    GlobalUI.notifyNewRequestOnFlight();
    const cache = this.storage.get(this.FOLLOWED_ARTISTS_STORAGE_KEY);
    this.genres_index = cache?.genres_index;
    this.artist_index = cache?.artist_index;

    let valid_cache = true;
    valid_cache &= this.genres_index && Object.keys(this.genres_index).length > 0;
    valid_cache &= this.artist_index && Object.keys(this.artist_index).length > 0;

    if (valid_cache) {
      console.log("Got collection from cache");
      GlobalUI.notifyRequestFinished();
      this.ready.resolve();
    } else {
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
      const interestingAttrs = ['id', 'name', 'uri', 'genres', 'images'];
      const getInterestingAttrsFromSpotifyArtist = art => {
        const obj = {};
        for (let attr of interestingAttrs) {
          obj[attr] = art[attr];
        }
        return obj;
      };

      this.spotify.fetchFollowedArtists().then(lst => {
        console.log("Retrieved full followed artist list");
        const raw_arts = lst.map(getInterestingAttrsFromSpotifyArtist);
        console.log("Transmogrifying artist list");
        const arts = groupAndIndexGenres(raw_arts);
        this.storage.save(this.FOLLOWED_ARTISTS_STORAGE_KEY, arts);
        this.genres_index = arts.genres_index;
        this.artist_index = arts.artist_index;
        GlobalUI.notifyRequestFinished();
        promise.resolve();
      });
    });
  }
}


import { SpotifyAuth } from './SpotifyAuth.js';
import { GlobalUI } from './UiGlobal.js';
import { W } from './wget.js';

export class SpotifyProxy {
  constructor(auth_broken_cb) {
    const scope="app-remote-control streaming user-follow-read user-library-read " +
                "user-modify-playback-state user-read-currently-playing " +
                "user-read-email user-read-playback-state user-read-private";

    this.auth_broken_cb = auth_broken_cb || (() => { console.error("Auth is broken, can't find tokens. Should request user token refresh."); });
    this.auth = new SpotifyAuth(scope);
    this.default_player_id = null;
    this.local_player = null;
    this.active_player_id = null;
    this.ready = $.Deferred();

    // No credentials? Bail out
    if (!this.auth.hasValidTokens()) {
      this.auth_broken_cb();
    }
  }

  triggerFullReauth(uiDivId) {
    return this.auth.triggerFullReauth(uiDivId);
  }

  // Call this if the auth token seems invalid
  requestReauth() {
    return this.auth.refreshToken().then(this.ready.resolve);
  }

  setLocalPlayer(localPlayer) {
    this.local_player = localPlayer;
  }

  setDefaultPlayerId(id) {
    this.default_player_id = id;
  }

  usingLocal() {
    return (this.active_player_id != null) && (this.local_player?.device_id == this.active_player_id);
  }

  _buildSpRequest(action, path, data=null) {
    return {
        type: action,
        dataType: 'json',
        contentType: 'application/json',
        processData: false,
        headers: this.auth.getHeader(),
        success: console.log,
        error: console.error,
        url: 'https://api.spotify.com/v1/' + path,
        data: JSON.stringify(data),
    };
  }

  _asyncFetchDeauthRetry(promise, req) {
    console.log("Deauth detected, will try to refresh auth");
    const refreshResult = this.auth.refreshToken();

    refreshResult.fail(() => {
      this.auth_broken_cb();
      promise.reject();
    });

    refreshResult.then(() => {
      req.error = promise.reject;
      W.get(req);
    });
  }

  _asyncFetchNoActiveDeviceRetry(promise, req) {
    if (!this.default_player_id) {
      GlobalUI.showErrorUi("No active device");
      promise.reject();
      return;
    }

    console.log("Trying to activate default device...");
    const activate = this._asyncPut('me/player', {'device_ids': [this.default_player_id]});

    activate.fail(() => {
      GlobalUI.showErrorUi("No active device and failed to activate default device");
      promise.reject();
    });

    activate.then(() => {
      req.error = promise.reject;
      W.get(req);
    });
  }

  _asyncFetch(req, cb=null) {
    const promise = $.Deferred();
    req.success = msg => { promise.resolve(cb? cb(msg) : msg) };
    req.error = (err) => {
      if (err.status == 401) {
        this._asyncFetchDeauthRetry(promise, req);
        return;
      }

      if (err.status == 404 && err?.responseJSON?.error?.reason == "NO_ACTIVE_DEVICE") {
        this._asyncFetchNoActiveDeviceRetry(promise, req, cb);
        return;
      }

      console.error("SpotifyProxy error:", err);
      GlobalUI.showErrorUi(JSON.stringify(err.responseJSON));
      promise.reject();
    };
    W.get(req, false);
    return promise;
  }

  _asyncGet(path, result_mogrifier) {
    const req = this._buildSpRequest('GET', path);
    return this._asyncFetch(req, result_mogrifier);
  }

  _asyncPut(path, data={}) {
    const req = this._buildSpRequest('PUT', path, data);
    return this._asyncFetch(req);
  }

  _asyncPost(path) {
    const req = this._buildSpRequest('POST', path, {});
    return this._asyncFetch(req);
  }

  getAvailableDevices() {
    return this._asyncGet('me/player/devices', x => x.devices);
  }

  setActiveDevice(id) {
    const done = $.Deferred();

    this.getAvailableDevices().then(devs => {
      for (let dev of devs) {
        if (dev.id == id) {
          if (dev.is_active) {
            console.log("Ignoring request to activate already active device ", dev);
          } else {
            this.active_player_id = id;
            this._asyncPut('me/player', {'device_ids': [id]}).then(done.resolve);
          }
          return;
        }
      }
      console.log("Ignoring request to activate unknown device ", id);
    });

    return done;
  }

  // Set vol from 0 to 100
  setVolume(pct) {
    if (this.usingLocal()) {
      this.local_player.player.setVolume(pct / 100.0);
      return $.Deferred().resolve();
    }

    return this._asyncPut('me/player/volume?volume_percent=' + pct, {'volume_percent': pct});
  }

  getPlayingNow() {
    const pickImg = imgs => {
      if (!imgs || imgs.length == 0) {
        return "https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG";
      }

      const tgtWidth = 300;
      let selected = 0;
      let selectedD = 99999;
      for (let i=1; i < imgs.length; ++i) {
        const d = Math.abs(imgs[i].width - tgtWidth);
        if (d < selectedD) {
          selected = i;
          selectedD = d;
        }
      }

      return imgs[selected].url;
    };

    const mogrify = player_state => {
      if (!player_state?.is_playing) return null;
      return {
        songName: player_state.item?.name,
        artist: player_state.item?.artists?.[0].name,
        album: player_state.item?.album?.name,
        album_uri: player_state.item?.album?.uri,
        album_img: pickImg(player_state.item?.album?.images),
        full_response: player_state,
      };
    };

    return this._asyncGet('me/player', mogrify);
  }

  playPause() {
    if (this.usingLocal()) {
      this.local_player.player.togglePlay();
      return $.Deferred().resolve();
    }

    return this._asyncGet('me/player').then(player => {
      const action = player?.is_playing? 'me/player/pause' : 'me/player/play';
      this._asyncPut(action);
    });
  }

  play(uri) {
    return this._asyncPut('me/player/play', {'context_uri': uri});
  }

  playPrev() {
    if (this.usingLocal()) {
      this.local_player.player.previousTrack();
      return $.Deferred().resolve();
    }

    return this._asyncPost('me/player/previous');
  }

  playNext() {
    if (this.usingLocal()) {
      this.local_player.player.nextTrack();
      return $.Deferred().resolve();
    }

    return this._asyncPost('me/player/next');
  }

  setShuffleEnabled() {
    return this._asyncPut('me/player/shuffle?state=true');
  }

  setShuffleDisabled() {
    return this._asyncPut('me/player/shuffle?state=false');
  }


  fetchOnlySomeFollowedArtists() {
    return this._asyncGet('me/following?type=artist&limit=42', o => o.artists.items);
  }

  fetchFollowedArtists(fetchUrl=null, parentPromise=null, artists=null) {
    const promise = parentPromise? parentPromise : $.Deferred();
    const url = fetchUrl? fetchUrl : 'me/following?type=artist&limit=50';
    console.log("Refreshing artist list, request to ", url);
    this._asyncGet(url).then( res => {
      console.log("Refreshing artist list, received response", res);
      const nextArtists = artists? artists.concat(res.artists.items) : res.artists.items;
      if (res.artists.next) {
        const expectedPrefix = 'https://api.spotify.com/v1/';
        if (!res.artists.next.startsWith(expectedPrefix)) {
          console.log("Can't parse request to fetch artists, expected next request to have prefix", expectedPrefix, " but received URL is", res.artists.next)
          promise.reject();
        }

        const nextUrl = res.artists.next.substr(expectedPrefix.length);
        this.fetchFollowedArtists(nextUrl, promise, nextArtists);
      } else {
        if (res.artists.total != nextArtists.length) {
          console.warning("Bad length: expected to get", res.artists.total, "artists, but received", nextArtists.length);
        }
        console.log("Received updated artists list:", nextArtists);
        promise.resolve(nextArtists);
      }
    });
    return promise;
  }

  fetchPlaylists() {
    return this._asyncGet('me/playlists?limit=50');
  }

  fetchTopArtists() {
    const affinity = 'long_term'; // 'long_term|medium_term|short_term'
    return this._asyncGet('me/top/artists?limit=50');
  }

  fetchDiscographyFor(artist_id, disc_type="album,single", offset=0) {
    // Some albums seem duplicated
    function deduplicateAlbums(albums) {
      var seen_albums = [];
      var uniqs = [];
      for (let album of albums) {
        const seen = album.release_date + album.name + album.total_tracks;
        if (!seen_albums.includes(seen)) {
          seen_albums.push(seen);
          uniqs.push(album);
        }
      }
      return uniqs;
    }

    const promise = $.Deferred();
    this._asyncGet(`artists/${artist_id}/albums?limit=50&offset=${offset}&include_groups=${disc_type}`).then( albums => {
      const this_fetch = albums.items;
      const has_more = (albums.total > offset + this_fetch.length);
      const recvd_data = (this_fetch.length != 0);
      if (recvd_data && has_more) {
        this.fetchDiscographyFor(artist_id, disc_type, offset + this_fetch.length).then( next_fetch => {
          promise.resolve(this_fetch.concat(next_fetch));
        });
      } else {
        promise.resolve(deduplicateAlbums(albums.items));
      }
    });
    return promise;
  }

  fetchAlbumsFor(artist_id) {
    return this.fetchDiscographyFor(artist_id, "album");
  }
}


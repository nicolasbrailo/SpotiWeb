import { SpotifyAuth } from './SpotifyAuth.js';
import { W } from './wget.js';

export class SpotifyProxy {
  constructor() {
    const scope="app-remote-control streaming user-follow-read user-library-read " +
                "user-modify-playback-state user-read-currently-playing " +
                "user-read-email user-read-playback-state user-read-private";
    this.auth = new SpotifyAuth(scope);
    this.ready = $.Deferred();
  }

  canConnect() {
    return this.auth.hasValidTokens();
  }

  triggerFullReauth(uiDivId) {
    return this.auth.triggerFullReauth(uiDivId);
  }

  connect() {
    this.auth.refreshToken().then(this.ready.resolve);
    return this.ready;
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

  _asyncFetch(req, cb=null) {
    const promise = $.Deferred();
    req.success = msg => { promise.resolve(cb? cb(msg) : msg) };
    req.error = promise.reject;
    W.get(req);
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
    return this._asyncGet('me/player').then(player => {
      const action = player?.is_playing? 'me/player/pause' : 'me/player/play';
      this._asyncPut(action);
    });
  }

  play(uri) {
    return this._asyncPut('me/player/play', {'context_uri': uri});
  }

  playPrev() {
    return this._asyncPost('me/player/previous');
  }

  playNext() {
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

  fetchFollowedArtists(prev_fetch=[]) {
    const promise = $.Deferred();

    const last_id = prev_fetch[prev_fetch.length-1]?.id;
    const this_fetch_start = last_id? `&after=${last_id}` : '';
    const fetch_path = `me/following?type=artist&limit=50${this_fetch_start}`;

    this._asyncGet(fetch_path).then( res => {
      const this_fetch = prev_fetch.concat(res.artists.items);
      const recvd_data = (res.artists.items.length != 0);
      const has_more = (res.artists.total > this_fetch.length);
      const has_next = !!res.artists.next;
      if (has_more && recvd_data) {
        const next_id = res.artists.next.split('&after=')[1].split('&')[0];
        if (!next_id) {
          console.error("Failed to parse next id from response: ", res);
        }
        const next_req = next_id? next_id : last_id;
        this.fetchFollowedArtists(this_fetch, next_req).then(promise.resolve);
      } else {
        if (has_next) {
          console.error(res);
        }
        promise.resolve(this_fetch);
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


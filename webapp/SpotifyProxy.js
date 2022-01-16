import { GlobalUI } from './ui.js';
import { W } from './wget.js';

export class SpotifyProxy {
  constructor(cache) {
    this.cache = cache;
    this.max_auth_age = 2 * 60 * 1000; // 2 Minutes
    this.localPlayer = null;
  }

  _withAuth(cb) {
    const auth_age = Date.now() - (this.auth_settime || 0);
    if (!this.auth || auth_age > this.max_auth_age) {
      W.getJson("/api/get_tok", auth => {
        this.auth = auth;
        this.auth_settime = Date.now();
        cb(this.auth);
      });
    } else {
      cb(this.auth);
    }
  }

  _spApi(action, url, data) {
    const promise = $.Deferred();
    this._withAuth(auth => {
      const req = {
          type: action,
          dataType: 'json',
          contentType: 'application/json',
          processData: false,
          headers: auth,
          success: promise.resolve,
          url: 'https://api.spotify.com/v1/' + url,
          data: JSON.stringify(data),
      }

      req.error = e => {
        const spe = e?.responseJSON?.error;
        if (spe?.status == 404 && spe?.reason == 'NO_ACTIVE_DEVICE') {
          GlobalUI.showErrorUi("No active device: trying to set active device");
          this._setActiveDevice().then(_ => {
            // Don't retry again
            req.error = GlobalUI.showErrorUi;
            W.get(req);
          });
        } else {
          GlobalUI.showErrorUi(JSON.stringify(e));
        }
      }

      W.get(req);
    });

    return promise;
  }

  _setActiveDevice() {
    return this.getAvailableDevices().then(devs => {
      if (devs.length == 0) return false;
      const new_dev = devs[devs.length-1];
      console.log("Selecting new device to play", new_dev.name, new_dev.id);
      return this.setActiveDevice(new_dev.id);
    });
  }

  setLocalPlayer(localPlayer) {
    this.localPlayer = localPlayer;
    // TODO: Set volume?
  }

  setVolume(pct) {
    return this._spApi('PUT', 'me/player/volume?volume_percent=' + pct, {'volume_percent': pct});
  }

  setActiveDevice(id) {
    return this._spApi('PUT', 'me/player', {'device_ids': [id]});
  }

  getAvailableDevices() {
    return this._spApi('GET', 'me/player/devices')
    .then(rsp => {
      if (!rsp || !rsp.devices || !rsp.devices.length) return [];
      return rsp.devices;
    });
  }

  getPlayingNow() {
    return this._spApi('GET', 'me/player/currently-playing').then(playingNow => {
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

      if (!playingNow?.is_playing) return null;
      return {
        songName: playingNow.item?.name,
        artist: playingNow.item?.artists?.[0].name,
        album: playingNow.item?.album?.name,
        album_uri: playingNow.item?.album?.uri,
        album_img: pickImg(playingNow.item?.album?.images),
      };
    });
  }

  play(obj) {
    return this._spApi('PUT', 'me/player/play', {'context_uri': obj.uri});
  }

  playPrev() { this._spApi('POST', 'me/player/previous', {}); }

  playNext() { this._spApi('POST', 'me/player/next', {}); }

  playPause() {
    this._spApi('GET', 'me/player').then(p => {
      const action = p?.is_playing? 'me/player/pause' : 'me/player/play';
      this._spApi('PUT', action, {}); 
    });
  }

  fetchAlbumsFor(artist_id, cb) {
    const lst = this.cache.cacheGet(`album_list_for_${artist_id}`);
    if (lst) return cb(lst);

    this._spApi('GET', `artists/${artist_id}/albums?limit=50&include_groups=album,single`).then( resp => {
      if (resp.items > 45) {
        GlobalUI.showErrorUi(`Albums for artist ${artist_id} requires pagination. Not implemented`);
      }
      this.cache.cacheSave(`album_list_for_${artist_id}`, resp.items);
      cb(resp.items);
    });
  }
};

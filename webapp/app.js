import { GlobalUI, UI_Builder } from './ui.js';
import { W } from './wget.js';
import { UiPeriodicUpdater } from './UiPeriodicUpdater.js';
import { LocalStorageManager } from './LocalStorageManager.js';

// If true, will try to open the native client whenever a link is clicked (eg open the artist page in the native Spotify client)
const gOpenLinkInNativeClient = false;

class CollectionManager {
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

class RecentlyPlayed {
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

class SpotifyProxy {
  constructor(cache) {
    this.cache = cache;
    this.max_auth_age = 2 * 60 * 1000; // 2 Minutes
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

class UI_PlayerCtrl {
  constructor(spProxy) {
    this.spProxy = spProxy;
  }

  notifyUILoaded() {
    this._installButtonCbs();
    this.onTick();
  }

  onTick() {
    this.updateAvailableDevices();
    this.updatePlayingNow();
  }

  updateAvailableDevices() {
    this.spProxy.getAvailableDevices().then(devs  => {
      $('#playctrls_device').html('');
      $.each(devs, (_, dev) => {
        let selected = "";
        if (dev.is_active) {
          $('#playctrls_vol').val(dev.volume_percent);
          selected = "selected";
        }
        $('#playctrls_device').append(`<option value="${dev.id}" ${selected}>${dev.name}</option>`);
      });
    });
  }

  updatePlayingNow() {
    this.spProxy.getPlayingNow().then(playingNow => {
      const playCtrls = document.getElementById('playctrls');
      if (!playingNow) {
        playCtrls.classList.remove('somethingPlaying');
        playCtrls.classList.add('nothingPlaying');
      } else {
        playCtrls.classList.add('somethingPlaying');
        playCtrls.classList.remove('nothingPlaying');

        $("#playingNow_StatusImg").attr("src", playingNow.album_img);
        $("#playingNow_statusLine1").html(playingNow.songName);
        $("#playingNow_statusLine2").html(`<a href="${playingNow.album_uri}">${playingNow.album}</a>| ` +  
                                          `<a href="${playingNow.album_uri}">${playingNow.artist}</a>`);
      }
    });
  }

  _installButtonCbs() {
    $('#playctrls_device').change(() => {
      $('#playctrls_device option:selected').each((idx, opt) => {
        const dev_id = opt.value;
        const dev_name = opt.text;
        sp.setActiveDevice(opt.value).then(_ => {
          console.log("Selected new device", dev_name);
        });
      });
    });

    $('#playctrls_vol').change(_ => {
      console.log("Set vol", $('#playctrls_vol').val());
      sp.setVolume($('#playctrls_vol').val());
    });

    $('#playctrls_prev').click(_ => { sp.playPrev(); });
    $('#playctrls_play').click(_ => { sp.playPause(); });
    $('#playctrls_next').click(_ => { sp.playNext(); });
  }
}

const HISTORY_CNT_LAST_ARTS_PLAYED = 10;
const MAX_CACHE_AGE_SECS = 60 * 60 * 24 * 3;

const storage = new LocalStorageManager(MAX_CACHE_AGE_SECS);
const collection = new CollectionManager(storage);
const recentlyPlayed = new RecentlyPlayed(storage, HISTORY_CNT_LAST_ARTS_PLAYED);
const ui = new UI_Builder(recentlyPlayed);
const sp = new SpotifyProxy(storage);
const playerUi = new UI_PlayerCtrl(sp);
const tick = new UiPeriodicUpdater();

function rebuildRecentlyPlayed() {
  $('#recently_played').html(ui.buildRecentlyPlayed());
}

function rebuildUI() {
  $('#genres_idx').html(ui.buildGenres())
  $('#arts_by_gen').html(ui.buildArts());
  rebuildRecentlyPlayed();
}

ui.onArtistClicked(art => {
  recentlyPlayed.add(art.name);
  rebuildRecentlyPlayed();
  sp.play(art).then(_ => {
    playerUi.updatePlayingNow(); 
    if (gOpenLinkInNativeClient) {
      window.location = art.uri;
    }
  });
});

ui.onAlbumClicked((art,album) => {
  recentlyPlayed.add(art.name);
  rebuildRecentlyPlayed();
  sp.play(album).then(_ => {
    playerUi.updatePlayingNow(); 
    if (gOpenLinkInNativeClient) {
      window.location = album.uri;
    }
  });
});

ui.onToggleArtistExtendedViewClicked((tile_id, art) => {
  const ext_view = ui.toggleExtendedView(tile_id, art.id);
  if (ext_view) {
    sp.fetchAlbumsFor(art.id, artAlbs => {
      ext_view.innerHTML = ui.buildExtendedView(art.name, artAlbs);
    });
  }
});

function reload(useCache=true) {
  const cb = col => {
    ui.setCollection(col);
    rebuildUI();
  };

  useCache?
    collection.cachedFetch(cb) :
    collection.fetch(cb);
}

document.addEventListener('DOMContentLoaded', _ => {
  playerUi.notifyUILoaded();
  tick.installCallback(_ => { playerUi.onTick(); }, 10 * 1000);
  reload();

  document.getElementById('refreshCollection').addEventListener('click', _ => {
    reload(false);
  });
});

window.player = 42;
window.onSpotifyWebPlaybackSDKReady = () => {
  W.getJson("/api/get_tok", auth => {
    player = new Spotify.Player({
      name: 'Web Playback SDK Quick Start Player',
      getOAuthToken: cb => { cb(auth.Authorization.split(' ')[1]); },
      volume: 0.5
    });

    // Ready
    player.addListener('ready', ({ device_id }) => {
      console.log('Ready with Device ID', device_id);
    });

    // Not Ready
    player.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID has gone offline', device_id);
    });

    player.addListener('initialization_error', ({ message }) => {
        console.error(message);
    });

    player.addListener('authentication_error', ({ message }) => {
        console.error(message);
    });

    player.addListener('account_error', ({ message }) => {
        console.error(message);
    });

    console.log("CONN");
    player.connect();
    window.player = player;
  });
};


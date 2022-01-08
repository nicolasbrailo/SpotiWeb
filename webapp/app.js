import { GlobalUI } from './GlobalUI.js';
import { W } from './wget.js';
import { UiPeriodicUpdater } from './UiPeriodicUpdater.js';
import { LocalStorageManager } from './LocalStorageManager.js';

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

class UI_Builder {
  static self = null;
  constructor(recentlyPlayed) {
    this.recentlyPlayed = recentlyPlayed;
    this.onArtistClickedCb = console.log;
    this.onArtistExpandClickedCb = console.log;
    this.onAlbumClickedCb = console.log;
    this.known_albums = {};
    // A unique id to represent each tile. Same artist may have multiple 
    // tiles in different sections
    this.art_tile_unique_id = 42;
    UI_Builder.self = this;
  }

  setCollection(col) {
    this.collection = col;
  }

  buildGenreHref(gen) {
    return gen.replaceAll(' ', '-');
  }

  onAlbumClicked(cb) {this.onAlbumClickedCb = cb; }
  static trampolineOnAlbumClicked(art_name, album_id) {
    const art_obj = UI_Builder.self.collection.artists[art_name];
    const album_obj = UI_Builder.self.known_albums[album_id];
    UI_Builder.self.onAlbumClickedCb(art_obj, album_obj);
  }

  onToggleArtistExtendedViewClicked(cb) { this.onArtistExpandClickedCb = cb; }
  static trampolineToggleArtistExtendedView(tile_id, art_name) {
    const art_obj = UI_Builder.self.collection.artists[art_name];
    UI_Builder.self.onArtistExpandClickedCb(tile_id, art_obj);
  }

  onArtistClicked(cb) { this.onArtistClickedCb = cb; }
  static trampolineOnArtistClicked(art) {
    const art_obj = UI_Builder.self.collection.artists[art];
    UI_Builder.self.onArtistClickedCb(art_obj);
  }

  buildSingleArt(art) {
    const art_info = this.collection.artists[art];
    const unique_id = this.art_tile_unique_id++;
    if (!art_info) {
      return `<li><img src="https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG"/>${art}</li>`;
    } else {
      const imgurl = art_info.img? art_info.img : "https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG";
      return `<li id='art${unique_id}_node_${art_info.id}'>
              <div class="expandView" onclick='UI_Builder.trampolineToggleArtistExtendedView("${unique_id}", "${art}")'>&#9660;</div>
              <a href='javascript:' onclick='UI_Builder.trampolineOnArtistClicked("${art}")'>
                <img src='${imgurl}'/>
                ${art}
              </a>
              <div id='art${unique_id}_extended_info_${art_info.id}'>...</div>
              </li>`;
    }
  }

  toggleExtendedView(tile_id, art_id) {
    const art_view = document.getElementById(`art${tile_id}_node_${art_id}`);
    const art_extended_view = document.getElementById(`art${tile_id}_extended_info_${art_id}`);

    if (art_view.classList.contains('selected')) {
      art_view.classList.remove('selected');
      art_extended_view.classList.remove('selected');
      return null;
    } else {
      // Remove class from all elements, so only one will have it
      $(".selected").removeClass("selected");
      art_view.classList.add('selected');
      art_extended_view.classList.add('selected');
      return art_extended_view;
    }
  }

  buildGenres() {
    return this.collection.genres.map(gen => `<li><a href="#${this.buildGenreHref(gen)}">${gen}</a></li>`);
  }

  buildArts() {
    return this.collection.genres.map( gen => {
      const art_lst = this.collection.artists_by_genre[gen].map(art => this.buildSingleArt(art)).join('');
      return `<h2 id='${this.buildGenreHref(gen)}'>${gen}</h2>
              <ul class='arts'>${art_lst}</ul>`;
    }).join('');
  }

  buildRecentlyPlayed() {
    const lastPlayed = this.recentlyPlayed.get();
    if (lastPlayed.length == 0) return '';
    const lastPlayedUi = lastPlayed.map(art => this.buildSingleArt(art)).join('');
    return `<h2>Recently played</h2><ul class='arts'>${lastPlayedUi}</ul>`;
  }

  buildExtendedView(art_name, albums) {
    const art = this.collection.artists[art_name];
    const genres = art.genres
                    .filter(gen => this.collection.genres.includes(gen))
                    .map(gen => `<li><a href=#${this.buildGenreHref(gen)}>${gen}</a><li>`)
                    .join('');
    const genres_view = (genres.length == 0)? '' : `<p class="genresList">More:</p><ul class="genresList">${genres}</ul>`
    return genres_view + this.buildAlbumList(art_name, albums);
  }

  buildAlbumList(art_name, albums) {
    const imgClosestTo200 = imgs => {
      if (!imgs || !Array.isArray(imgs) || imgs.length == 0) {
        return "https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG";
      }

      const tgt_height = 250;
      var closest_idx = 0;
      for (var i=1; i<imgs.length; ++i) {
        const delta = Math.abs(imgs[i].height - tgt_height);
        const delta_min = Math.abs(imgs[closest_idx].height - tgt_height);
        if (delta < delta_min) closest_idx = i;
      }
      return imgs[closest_idx].url;
    };

    var seen_albums = [];
    const lst = albums.map(album => {
      // Remove duplicates
      const seen = album.release_date + album.name + album.total_tracks;
      if (seen_albums.includes(seen)) return '';
      seen_albums.push(seen);

      // Save this album to look it up again in the onClick callback
      this.known_albums[album.id] = album;

      var albumtype = '';
      if (album.album_type == 'single') albumtype = '-Single:';

      return `<li class='album_info'>
                <a href='javascript:' onclick='UI_Builder.trampolineOnAlbumClicked("${art_name}", "${album.id}")'>
                  <img src='${imgClosestTo200(album.images)}'/>
                  ${(new Date(album.release_date)).getFullYear()}${albumtype} ${album.name}
                </a>
              </li>`
    }).join('');
    return `<ul class='albums'>${lst}</ul>`;
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
      const action = p.is_playing? 'me/player/pause' : 'me/player/play';
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
        $('#playctrls_device').append($('<option/>').val(dev.id).text(dev.name));
        if (dev.is_active) {
          $('#playctrls_device select').val(dev.id);
          $('#playctrls_vol').val(dev.volume_percent);
        }
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
    window.location = art.uri;
  });
});

ui.onAlbumClicked((art,album) => {
  recentlyPlayed.add(art.name);
  rebuildRecentlyPlayed();
  sp.play(album).then(_ => {
    playerUi.updatePlayingNow(); 
    window.location = album.uri;
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


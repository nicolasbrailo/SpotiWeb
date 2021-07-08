
function wget(url, cb, h={}) {
    return $.ajax({
      type: 'GET',
      dataType: 'json',
      headers: h,
      url: url,
      success: cb,
      error: console.error,
    });
}

class LocalStorageManager {
  constructor(max_cache_age_secs) {
    this.max_cache_age_secs = max_cache_age_secs;
    this.cache_idx = this.get('cache_idx', {});
    if (typeof(this.cache_idx) != typeof({})) {
      console.log("Local storage cache seems bad, will clear it");
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

class CollectionManager {
  constructor(storage) {
    this.storage = storage;
  }

  fetch(cb) {
    wget("/api/fetch_all", col => {
      col.genres.sort();
      $.each(col.artists_by_genre, (_,arts) => { arts.sort(); });
      this.storage.cacheSave('collection', col);
      cb(col);
    });
  }

  cachedFetch(cb) {
    const col = this.storage.cacheGet('collection');
    if (col) return cb(col);
    console.log("Collection cache not valid, refetching");
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
  static trampolineToggleArtistExtendedView(src_id, art_name) {
    const art_obj = UI_Builder.self.collection.artists[art_name];
    UI_Builder.self.onArtistExpandClickedCb(src_id, art_obj);
  }

  onArtistClicked(cb) { this.onArtistClickedCb = cb; }
  static trampolineOnArtistClicked(art) {
    const art_obj = UI_Builder.self.collection.artists[art];
    UI_Builder.self.onArtistClickedCb(art_obj);
  }

  buildSingleArt(art, src_id='') {
    const art_info = this.collection.artists[art];
    if (!art_info) {
      return `<li><img src="https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG"/>${art}</li>`;
    } else {
      const imgurl = art_info.img? art_info.img : "https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG";
      return `<li id='art${src_id}_node_${art_info.id}'>
              <div class="expandView" onclick='UI_Builder.trampolineToggleArtistExtendedView("${src_id}", "${art}")'>&#9660;</div>
              <a href='javascript:' onclick='UI_Builder.trampolineOnArtistClicked("${art}")'>
                <img src='${imgurl}'/>
                ${art}
              </a>
              <div id='art${src_id}_extended_info_${art_info.id}'>...</div>
              </li>`;
    }
  }

  toggleExtendedView(src, art_id) {
    const art_view = document.getElementById(`art${src}_node_${art_id}`);
    const art_extended_view = document.getElementById(`art${src}_extended_info_${art_id}`);

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
    const lastPlayedUi = lastPlayed.map(art => this.buildSingleArt(art, 'recents')).join('');
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
      wget("/api/get_tok", auth => {
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
          console.log("No active device: trying to set active device");
          this._setActiveDevice().then(_ => {
            // Don't retry again
            req.error = console.log;
            $.ajax(req);
          });
        } else {
          console.log(e);
        }
      }

      $.ajax(req);
    });

    return promise;
  }

  _setActiveDevice() {
    return this._spApi('GET', 'me/player/devices')
    .then(rsp => {
      if (!rsp || !rsp.devices || !rsp.devices.length) return false;
      const new_dev = rsp.devices[rsp.devices.length-1];
      console.log("Selecting new device to play", new_dev.name);
      return this._spApi('PUT', 'me/player', {'device_ids': [new_dev.id]});
    });
  }

  play(obj) {
    return this._spApi('PUT', 'me/player/play', {'context_uri': obj.uri});
  }

  fetchAlbumsFor(artist_id, cb) {
    const lst = this.cache.cacheGet(`album_list_for_${artist_id}`);
    if (lst) return cb(lst);

    this._spApi('GET', `artists/${artist_id}/albums?limit=50&include_groups=album,single`).then( resp => {
      if (resp.items > 48) {
        console.error(`Albums for artist ${artist_id} requires pagination. Not implemented`);
      }
      this.cache.cacheSave(`album_list_for_${artist_id}`, resp.items);
      cb(resp.items);
    });
  }
};

const HISTORY_CNT_LAST_ARTS_PLAYED = 10;
const MAX_CACHE_AGE_SECS = 60 * 60 * 24 * 3;

const storage = new LocalStorageManager(MAX_CACHE_AGE_SECS);
const collection = new CollectionManager(storage);
const recentlyPlayed = new RecentlyPlayed(storage, HISTORY_CNT_LAST_ARTS_PLAYED);
const ui = new UI_Builder(recentlyPlayed);
const sp = new SpotifyProxy(storage);

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
    window.location = art.uri;
  });
});

ui.onAlbumClicked((art,album) => {
  recentlyPlayed.add(art.name);
  rebuildRecentlyPlayed();
  sp.play(album).then(_ => {
    window.location = album.uri;
  });
});

ui.onToggleArtistExtendedViewClicked((src, art) => {
  const ext_view = ui.toggleExtendedView(src, art.id);
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
  reload();

  document.getElementById('refreshCollection').addEventListener('click', _ => {
    reload(false);
  });
});

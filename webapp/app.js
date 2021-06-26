
function wget(url, cb, h={}) {
    return $.ajax({
      type: 'GET',
      dataType: 'json',
      headers: h,
      url: url,
      success: cb,
      error: (_,e,ee) => console.log(`Error fetching ${url}: ${e}, ${ee}`),
    });
}

class LocalStorageManager {
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
};

class CollectionManager {
  constructor(storage, max_cache_age_secs) {
    this.storage = storage;
    this.max_cache_age_secs = max_cache_age_secs;
  }

  fetch(cb) {
    wget("/api/fetch_all", col => {
      col.genres.sort();
      $.each(col.artists_by_genre, (_,arts) => { arts.sort(); });
      this.storage.save('collection', col);
      this.storage.save('collection_last_update', Date.now());
      cb(col);
    });
  }

  cachedFetch(cb) {
    const last_update = this.storage.get('collection_last_update', 0);
    const col_age = Date.now() - last_update;
    const cache_is_old = (col_age > 1000 * this.max_cache_age_secs);
    if (cache_is_old) {
      console.log("Collection cache is old, refetching");
      return this.fetch(cb);
    }

    const col = this.storage.get('collection', null);
    if (col && col.genres && Array.isArray(col.genres)) {
      cb(col);
    } else {
      console.log("Collection cache is not valid, refetching");
      return this.fetch(cb);
    }
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
    return lastPlayed;
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
  static onArtClickCb = a => console.log(a);
  static onArtExpandViewClickCb = a => console.log(a);

  constructor(recentlyPlayed, onArtClickCb) {
    this.recentlyPlayed = recentlyPlayed;
  }

  onArtClicked(cb) {
    UI_Builder.onArtClickCb = cb;
  }

  onArtExpandViewClicked(cb) {
    UI_Builder.onArtExpandViewClickCb = cb;
  }

  setCollection(col) {
    this.collection = col;
  }

  buildGenreHref(gen) {
    return gen.replace(' ', '-');
  }

  buildSingleArt(art, src_id='') {
    const art_info = this.collection.artists[art];
    if (!art_info) {
      return `<li><img src="https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG"/>${art}</li>`;
    } else {
      return `<li id='art${src_id}_node_${art_info.id}'>
              <div class="expandView" onclick='UI_Builder.onArtExpandViewClickCb("${src_id}", "${art}", "${art_info.id}", "${art_info.uri}")'>&#9660;</div>
              <a href='${art_info.uri}' onclick='UI_Builder.onArtClickCb("${art}")'>
                <img src='${art_info.img}'/>
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

  buildAlbumList(art, albums) {
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

      return `<li class='album_info'>
                <a href='${album.uri}' onclick='UI_Builder.onArtClickCb("${art}")'>
                  <img src='${imgClosestTo200(album.images)}'/>
                  ${(new Date(album.release_date)).getFullYear()} - ${album.name}
                </a>
              </li>`
    }).join('');
    return `<ul class='albums'>${lst}</ul>`;
  }
};

class SpotifyProxy {
  fetchAlbumsFor(id, cb) {
    wget("/api/get_tok", auth => {
      $.ajax({
          type: 'GET',
          dataType: 'json',
          headers: auth,
          success: resp => {
            if (resp.items > 50) {
              console.error(`${id} requires pagination. Not implemented`);
            }
            cb(resp.items);
          },
          error: (_,e,ee) => console.log(`Error fetching ${url}: ${e}, ${ee}`),
          url: `https://api.spotify.com/v1/artists/${id}/albums?limit=50&include_groups=album`,
        });
    });
  }
};

const HISTORY_CNT_LAST_ARTS_PLAYED = 10;
const MAX_CACHE_AGE_SECS = 60 * 60 * 24 * 3;

const storage = new LocalStorageManager();
const collection = new CollectionManager(storage, MAX_CACHE_AGE_SECS);
const recentlyPlayed = new RecentlyPlayed(storage, HISTORY_CNT_LAST_ARTS_PLAYED);
const ui = new UI_Builder(recentlyPlayed);
const sp = new SpotifyProxy();

function rebuildRecentlyPlayed() {
  $('#recently_played').html(ui.buildRecentlyPlayed());
}

function rebuildUI() {
  $('#genres_idx').html(ui.buildGenres())
  $('#arts_by_gen').html(ui.buildArts());
  rebuildRecentlyPlayed();
}

ui.onArtClicked(art => {
  recentlyPlayed.add(art);
  rebuildRecentlyPlayed();
});

ui.onArtExpandViewClicked((src, art, id, uri) => {
  const ext_view = ui.toggleExtendedView(src, id);
  if (ext_view) {
    sp.fetchAlbumsFor(id, artAlbs => {
      ext_view.innerHTML = ui.buildAlbumList(art, artAlbs);
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


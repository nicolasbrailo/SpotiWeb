
export class GlobalUI {
  static _reqsOnFlight = 0;
  static _loadingAnimationCurrentStep = 0.0;
  static _loadingAnimationTask = null;

  static _maybeShowLoadingUi() {
    const clock = (t) => {
      const hr = Math.floor(t);
      const hf = t - Math.floor(t);
      const hr12 = hr % 12? hr % 12 : 12;
      const clck = 128335 + hr12 + (hf? 12 : 0);
      return `&#${clck};`;
    };

    const run = () => {
      if (GlobalUI._reqsOnFlight == 0) {
        $('#loading').hide();
        clearInterval(GlobalUI._loadingAnimationTask);
      }
      $('#loading').html(`${clock(GlobalUI._loadingAnimationCurrentStep)} '&#9749;'`);
      GlobalUI._loadingAnimationCurrentStep += 0.5;
    };

    if (GlobalUI._reqsOnFlight == 1) {
      $('#loading').show();
      GlobalUI._loadingAnimationCurrentStep = 0.0;
      GlobalUI._loadingAnimationTask = setInterval(run, 50);
    }
  }


  static showErrorUi(msg) {
    $('#error').show()
    $('#error').html(msg);
    setTimeout(() => $('#error').hide(), 3000);
  }

  static notifyNewRequestOnFlight() {
    GlobalUI._reqsOnFlight++;
    GlobalUI._maybeShowLoadingUi();
  }

  static notifyRequestFinished() {
    GlobalUI._reqsOnFlight--;
  }
};


export class UI_Builder {
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
    // Make the UI_Builder globally accessible, so that links can use it to trampoline
    window.UI_Builder = UI_Builder;
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


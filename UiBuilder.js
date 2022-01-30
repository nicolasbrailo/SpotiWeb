
const NO_KNOWN_IMAGE = "https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG";

// Return a genre name that can be used in an anchor link
function buildGenreHref(gen) {
  return gen.replaceAll(' ', '-');
}

function imgClosestTo200(imgs) {
  if (!imgs || !Array.isArray(imgs) || imgs.length == 0) {
    return NO_KNOWN_IMAGE;
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

function buildArtistGenresView(genres, art) {
  const known_genres = art.genres
                          .filter(gen => genres.includes(gen))
                          .map(gen => `<li><a href=#${buildGenreHref(gen)}>${gen}</a><li>`)
                          .join('');

  const unknown_genres = art.genres
                          .filter(gen => { return !genres.includes(gen); })
                          .map(gen => `<li class='unknown_genre'>${gen}<li>`)
                          .join('');

  const genres_view = (genres.length == 0)? 
                        '' :
                        `<p class="genresList">More:</p><ul class="genresList">
                            ${known_genres}${unknown_genres}
                        </ul>`;
  return genres_view;
};


function buildAlbumListView(art_name, albums) {
  const lst = albums.map(album => {
    var albumtype = '';
    if (album.album_type == 'single') albumtype = '-Single:';

    return `<li class='album_info'>
              <a href='javascript:' onclick='UiBuilder.trampolineOnAlbumClicked("${art_name}", "${album.uri}")'>
                <img src='${imgClosestTo200(album.images)}'/>
                ${(new Date(album.release_date)).getFullYear()}${albumtype} ${album.name}
              </a>
            </li>`
  }).join('');

  return `<ul class='albums'>${lst}</ul>`;
};


export class UiBuilder {
  static self = null;
  constructor() {
    if (UiBuilder.self != null) {
      console.error("This is a singleton, weird things may happen if you instanciate twice");
    }

    this.collection = {};
    this.genres = [];
    this.artists_index = {};

    this.onArtistClickedCb = console.log;
    this.onArtistExpandClickedCb = console.log;
    this.onAlbumClickedCb = console.log;
    this.known_albums = {};

    // A unique id to represent each tile. Same artist may have multiple 
    // tiles in different sections
    this.art_tile_unique_id = 42;

    // Make the UiBuilder globally accessible, so that links can use it to trampoline
    window.UiBuilder = UiBuilder;
    UiBuilder.self = this;
  }

  setCollection(collection, artists_index) {
    this.collection = collection;
    this.genres = Object.keys(this.collection).sort();
    this.artists_index = artists_index;
  }

  buildRecentlyPlayed(recently_played) {
    if (recently_played.length == 0) return '';
    const lastPlayedUi = recently_played.map(this.buildArtistTile).join('');
    return `<h2>Recently played</h2><ul class='arts'>${lastPlayedUi}</ul>`;
  }

  buildGenresIndex() {
    return this.genres.map(gen => `<li><a href="#${buildGenreHref(gen)}">${gen}</a></li>`).join('');
  }

  buildAllGenres() {
    const buildArtistGroup = (arts) => {
      const arts_group_body = arts.map(this.buildArtistTile).join('');
      return `<ul class='arts'>${arts_group_body}</ul>`;
    }

    const buildSingleGenre = (gen) => {
      const genre_body = buildArtistGroup(this.collection[gen])
      return `<h2 id='${buildGenreHref(gen)}'>${gen}</h2>` + genre_body;
    }

    return this.genres.map(buildSingleGenre).join('');
  }

  buildArtistTile = (art_name) => {
    const art_info = this.artists_index[art_name];
    const unique_id = this.art_tile_unique_id++;
    if (!art_info) {
      return `<li><img src="${NO_KNOWN_IMAGE}"/>${art_name}</li>`;
    } else {
      const imgurl = imgClosestTo200(art_info.images);
      return `<li id='art${unique_id}_node_${art_info.id}'>
              <div class="expandView" onclick='UiBuilder.trampolineToggleArtistExtendedView("${unique_id}", "${art_name}")'>&#9660;</div>
              <a href='javascript:' onclick='UiBuilder.trampolineOnArtistClicked("${art_name}")'>
                <img src='${imgurl}'/>
                ${art_name}
              </a>
              <div id='art${unique_id}_extended_info_${art_info.id}'>...</div>
              </li>`;
    }
  }

  // Event handlers
  onAlbumClicked(cb) {this.onAlbumClickedCb = cb; }
  onExtendedViewClicked(cb) { this.onArtistExpandClickedCb = cb; }
  onArtistClicked(cb) { this.onArtistClickedCb = cb; }

  // Event trampolines
  static trampolineOnAlbumClicked(art_name, album_uri) {
    const art_obj = UiBuilder.self.artists_index[art_name];
    UiBuilder.self.onAlbumClickedCb(art_obj, album_uri);
  }

  static trampolineToggleArtistExtendedView(tile_id, art_name) {
    const art_obj = UiBuilder.self.artists_index[art_name];
    UiBuilder.self.onArtistExpandClickedCb(tile_id, art_obj);
  }

  static trampolineOnArtistClicked(art_name) {
    const art_obj = UiBuilder.self.artists_index[art_name];
    UiBuilder.self.onArtistClickedCb(art_obj);
  }

  toggleExtendedView(tile_id, art, content_generator) {
    const buildExtendedView = (art, albums) => {
      return buildArtistGenresView(this.genres, art) +
             buildAlbumListView(art.name, albums);
    };

    const art_view = document.getElementById(`art${tile_id}_node_${art.id}`);
    const art_extended_view = document.getElementById(`art${tile_id}_extended_info_${art.id}`);

    if (art_view.classList.contains('selected')) {
      art_view.classList.remove('selected');
      art_extended_view.classList.remove('selected');
    } else {
      // Remove class from all elements, so only one will have it
      $(".selected").removeClass("selected");
      art_view.classList.add('selected');
      art_extended_view.classList.add('selected');

      content_generator().then(albums => {
        art_extended_view.innerHTML = buildExtendedView(art, albums);
      });
    }
  }
};


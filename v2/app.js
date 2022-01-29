import { CollectionManager } from './CollectionManager.js';
import { RecentlyPlayed } from './RecentlyPlayed.js';
import { SpotifyProxy } from './SpotifyProxy.js';
import { LocalStorageManager } from './LocalStorageManager.js';
import { UiBuilder } from './UiBuilder.js';
import { UiSettings } from './UiSettings.js';

const storage = new LocalStorageManager();
const settings = new UiSettings(storage);
const spotify = new SpotifyProxy();
const recently_played = new RecentlyPlayed(storage, settings.recentlyPlayedCount);
const main_ui = new UiBuilder();
const collection_manager = new CollectionManager(storage, spotify);

function rebuildRecentPlayed() {
  $('#recently_played').html(main_ui.buildRecentlyPlayed(recently_played.get()));
}

main_ui.onExtendedViewClicked((tile_id, art_obj) => {
  const generator = () => { return spotify.fetchDiscographyFor(art_obj.id); };
  main_ui.toggleExtendedView(tile_id, art_obj, generator);
});

main_ui.onAlbumClicked((art_obj, album_uri) => {
  recently_played.add(art_obj.name);
  rebuildRecentPlayed();
  spotify.play(album_uri);

  if (settings.openLinksInNativeClient) {
    window.location = album_uri;
  }
});

main_ui.onArtistClicked((art_obj) => {
  recently_played.add(art_obj.name);
  rebuildRecentPlayed();
  spotify.play(art_obj.uri);

  if (settings.openLinksInNativeClient) {
    window.location = art_obj.uri;
  }
});

settings.onRecentlyPlayedCountChange(cnt => {
  recently_played.setRecentlyPlayedCount(cnt);
  rebuildRecentPlayed();
});

collection_manager.ready.then(() => {
  main_ui.setCollection(collection_manager.genres_index, collection_manager.artist_index);
  $('#genres_idx').html(main_ui.buildGenresIndex());
  $('#arts_by_gen').html(main_ui.buildAllGenres());
  rebuildRecentPlayed();
});

const spotifySdkLoaded = $.Deferred();
const uiReady = $.Deferred();

window.onSpotifyWebPlaybackSDKReady = spotifySdkLoaded.resolve;

document.addEventListener('DOMContentLoaded', () => {
  settings.notifyUILoaded();
  uiReady.resolve();
});

if (!spotify.canConnect()) {
  window.location = '/reauth.html';
} else {
  Promise.all([uiReady, spotify.connect()]).then(() => {
    console.log("READY");
    spotify.getAvailableDevices().then(console.log);
  });
}


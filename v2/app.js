import { CollectionManager } from './CollectionManager.js';
import { LocalStorageManager } from './LocalStorageManager.js';
import { RecentlyPlayed } from './RecentlyPlayed.js';
import { SpotifyLocalPlayer } from './SpotifyLocalPlayer.js';
import { SpotifyProxy } from './SpotifyProxy.js';
import { UiBuilder } from './UiBuilder.js';
import { UiMiniPlayerCtrl } from './UiMiniPlayerCtrl.js';
import { UiPeriodicUpdater } from './UiPeriodicUpdater.js';
import { UiSettings } from './UiSettings.js';

const main_ui = new UiBuilder();
const spotify = new SpotifyProxy();
const player_ui = new UiMiniPlayerCtrl(spotify);
const storage = new LocalStorageManager();
const settings = new UiSettings(storage);
const recently_played = new RecentlyPlayed(storage, settings.recentlyPlayedCount);
const collection_manager = new CollectionManager(storage, spotify);
const tick = new UiPeriodicUpdater();

function rebuildRecentPlayed() {
  $('#recently_played').html(main_ui.buildRecentlyPlayed(recently_played.get()));
}

function rebuildMainUi() {
  main_ui.setCollection(collection_manager.genres_index, collection_manager.artist_index);
  $('#genres_idx').html(main_ui.buildGenresIndex());
  $('#arts_by_gen').html(main_ui.buildAllGenres());
  rebuildRecentPlayed();
}

function createLocalSpotifyClient() {
  const localPlayer = new SpotifyLocalPlayer('Spotiwebos', storage, spotify);
  // TODO: Bypass remote API maybe faster? spotify.setLocalPlayer(localPlayer);
  localPlayer.ready.then(player_ui.updateAvailableDevices);
  // Make it globally available
  window.player = localPlayer;
}

main_ui.onExtendedViewClicked((tile_id, art_obj) => {
  const generator = () => { return spotify.fetchDiscographyFor(art_obj.id); };
  main_ui.toggleExtendedView(tile_id, art_obj, generator);
});

main_ui.onAlbumClicked((art_obj, album_uri) => {
  recently_played.add(art_obj.name);
  rebuildRecentPlayed();
  spotify.play(album_uri).then(player_ui.updatePlayingNow);

  if (settings.openLinksInNativeClient) {
    window.location = album_uri;
  }
});

main_ui.onArtistClicked((art_obj) => {
  recently_played.add(art_obj.name);
  rebuildRecentPlayed();
  spotify.play(art_obj.uri).then(player_ui.updatePlayingNow);

  if (settings.openLinksInNativeClient) {
    window.location = art_obj.uri;
  }
});

settings.onRecentlyPlayedCountChange(cnt => {
  recently_played.setRecentlyPlayedCount(cnt);
  rebuildRecentPlayed();
});

settings.onUserRequestedCacheRefresh(() => {
  collection_manager.refreshFollowedArtists().then(rebuildMainUi);
});

collection_manager.ready.then(rebuildMainUi);


const spotifySdkLoaded = $.Deferred();
window.onSpotifyWebPlaybackSDKReady = spotifySdkLoaded.resolve;

settings.onThingsAreBroken(() => {
  spotifySdkLoaded.then(createLocalSpotifyClient);
});

const uiReady = $.Deferred();
document.addEventListener('DOMContentLoaded', () => {
  settings.notifyUILoaded();
  player_ui.notifyUILoaded();
  uiReady.resolve();
});

if (!spotify.canConnect()) {
  window.location = '/reauth.html';
} else {
  Promise.all([uiReady, spotify.connect()]).then(() => {
    tick.installCallback(_ => { player_ui.onTick(); }, 10 * 1000);
  });

  spotifySdkLoaded.then(createLocalSpotifyClient);
}


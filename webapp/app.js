import { GlobalUI, UI_Builder } from './ui.js';
import { LocalStorageManager, CollectionManager, RecentlyPlayed } from './LocalStorageManager.js';
import { SpotifyLocalPlayer } from './SpotifyLocalPlayer.js';
import { SpotifyProxy } from './SpotifyProxy.js';
import { UiMiniPlayerCtrl } from './UiMiniPlayerCtrl.js';
import { UiPeriodicUpdater } from './UiPeriodicUpdater.js';
import { UiSettings } from './settings.js';
import { W } from './wget.js';

const spotifySdkLoaded = $.Deferred();

const storage = new LocalStorageManager();
const settingsUi = new UiSettings(storage);
const collection = new CollectionManager(storage);
const recentlyPlayed = new RecentlyPlayed(storage, settingsUi.recentlyPlayedCount);
const ui = new UI_Builder(recentlyPlayed);
const sp = new SpotifyProxy(storage);
const playerUi = new UiMiniPlayerCtrl(sp);
const tick = new UiPeriodicUpdater();

function createLocalSpotifyClient() {
  const localPlayer = new SpotifyLocalPlayer('Spotiwebos', storage);
  sp.setLocalPlayer(localPlayer);
  playerUi.updateAvailableDevices();
  // Make it globally available
  window.player = localPlayer;
}

function rebuildRecentlyPlayed() {
  $('#recently_played').html(ui.buildRecentlyPlayed());
}

ui.onArtistClicked(art => {
  recentlyPlayed.add(art.name);
  rebuildRecentlyPlayed();
  sp.play(art).then(_ => {
    playerUi.updatePlayingNow(); 
    if (settingsUi.openLinksInNativeClient) {
      window.location = art.uri;
    }
  });
});

ui.onAlbumClicked((art,album) => {
  recentlyPlayed.add(art.name);
  rebuildRecentlyPlayed();
  sp.play(album).then(_ => {
    playerUi.updatePlayingNow(); 
    if (settingsUi.openLinksInNativeClient) {
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
  spotifySdkLoaded.then(createLocalSpotifyClient);

  const cb = col => {
    ui.setCollection(col);
    $('#genres_idx').html(ui.buildGenres())
    $('#arts_by_gen').html(ui.buildArts());
    rebuildRecentlyPlayed();
  };

  useCache?
    collection.cachedFetch(cb) :
    collection.fetch(cb);
}

settingsUi.onThingsAreBroken(reload);
settingsUi.onRecentlyPlayedCountChange(cnt => {
  recentlyPlayed.setRecentlyPlayedCount(cnt);
  rebuildRecentlyPlayed();
});

window.onSpotifyWebPlaybackSDKReady = spotifySdkLoaded.resolve;

document.addEventListener('DOMContentLoaded', _ => {
  playerUi.notifyUILoaded();
  settingsUi.notifyUILoaded();
  tick.installCallback(_ => { playerUi.onTick(); }, 10 * 1000);
  reload();
});


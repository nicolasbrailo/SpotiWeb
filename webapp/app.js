import { GlobalUI, UI_Builder } from './ui.js';
import { LocalStorageManager, CollectionManager, RecentlyPlayed } from './LocalStorageManager.js';
import { SpotifyLocalPlayer } from './SpotifyLocalPlayer.js';
import { SpotifyProxy } from './SpotifyProxy.js';
import { UiMiniPlayerCtrl } from './UiMiniPlayerCtrl.js';
import { UiPeriodicUpdater } from './UiPeriodicUpdater.js';
import { W } from './wget.js';


export class UiSettings {
  constructor(localStorage) {
    this.localStorage = localStorage;
    this.hidden = true;
  }

  notifyUILoaded() {
    this._installButtonCbs();
  }

  _installButtonCbs() {
    $('#settings_toggle').click(_ => {
      const settingsUi = document.getElementById('settings');
      this.hidden = !this.hidden;
      if (this.hidden) {
        settingsUi.classList.add('settingsHidden');
      } else {
        settingsUi.classList.remove('settingsHidden');
      }
    });

    $('#settings_reload').click(_ => {
      console.log("TODO");
    });

    $('#settings_tileSize').change((x) => {
      console.log("TODO", x);
    });

    $('#settings_openLinksInNativeClient').click((x) => {
      console.log(x)
    });

    $('#refreshCollection').click((x) => {
      // TODO global
      reload(false);
    });
  }
}


// If true, will try to open the native client whenever a link is clicked (eg open the artist page in the native Spotify client)
const gOpenLinkInNativeClient = false;
const gSpotifyWebClientName = 'Spotiwebos';

const spotifySdkLoaded = $.Deferred();

const HISTORY_CNT_LAST_ARTS_PLAYED = 10;
const MAX_CACHE_AGE_SECS = 60 * 60 * 24 * 3;

const storage = new LocalStorageManager(MAX_CACHE_AGE_SECS);
const collection = new CollectionManager(storage);
const recentlyPlayed = new RecentlyPlayed(storage, HISTORY_CNT_LAST_ARTS_PLAYED);
const ui = new UI_Builder(recentlyPlayed);
const sp = new SpotifyProxy(storage);
const playerUi = new UiMiniPlayerCtrl(sp);
const settingsUi = new UiSettings(storage);
const tick = new UiPeriodicUpdater();

function createLocalSpotifyClient() {
  const localPlayer = new SpotifyLocalPlayer(gSpotifyWebClientName, storage);
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

window.onSpotifyWebPlaybackSDKReady = spotifySdkLoaded.resolve;

document.addEventListener('DOMContentLoaded', _ => {
  playerUi.notifyUILoaded();
  settingsUi.notifyUILoaded();
  tick.installCallback(_ => { playerUi.onTick(); }, 10 * 1000);
  reload();
});


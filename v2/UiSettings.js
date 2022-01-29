import { GlobalUI } from './UiGlobal.js';

function getCss(selector) {
  for (let rule of document.styleSheets[0].cssRules) {
    if (rule.selectorText == selector) {
      return rule;
    }
  }

  GlobalUI.showErrorUi(`Can't find tile style with selector "${selector}"`);
  return null;
};

export class UiSettings {
  constructor(localStorage) {
    this.thingsAreBrokenCb = null;
    this.recentlyPlayedCountChange = null;
    this.localStorage = localStorage;
    this.hidden = true;

    // Configure UI size
    this.TILE_SIZE_STORAGE_KEY = "settings_tileSize_pct";

    this.defaultTileHeight = parseFloat(getCss(".arts li").style.height);
    if (isNaN(this.defaultTileHeight)) {
      this.defaultTileHeight = 200;
      console.error(`Couldn't retrieve default tile height, using ${this.defaultTileHeight}px`);
    }

    this.defaultTileWidth = parseFloat(getCss(".arts li").style.width);
    if (isNaN(this.defaultTileWidth)) {
      this.defaultTileWidth = 200;
      console.error(`Couldn't retrieve default tile width, using ${this.defaultTileWidth}px`);
    }

    this.defaultCssFontSize = parseFloat(getCss(".arts li").style.fontSize);
    if (isNaN(this.defaultCssFontSize)) {
      this.defaultCssFontSize = 25;
      console.error(`Couldn't retrieve default font size, using ${this.defaultCssFontSize}px`);
    }

    // Buttons (like tile expand) are a bit bigger than default font
    this.defaultCssButtonFontSize = this.defaultCssFontSize + 3;

    // Configure link behavior
    this.OPEN_LINKS_IN_NATIVE_CLIENT_KEY = "settings_openLinksInNativeClient";
    this.openLinksInNativeClient = this.localStorage.get(this.OPEN_LINKS_IN_NATIVE_CLIENT_KEY, false);

    // Configure default recently-played size
    this.RECENTLY_PLAYED_COUNT_KEY = "settings_recentlyPlayedCount";
    this.recentlyPlayedCount = this.localStorage.get(this.RECENTLY_PLAYED_COUNT_KEY, 10);
  }

  notifyUILoaded() {
    this._installButtonCbs();

    const uiSize = this.localStorage.get(this.TILE_SIZE_STORAGE_KEY, 1);
    this.resetUiSizes(uiSize);
  }

  onThingsAreBroken(cb) {
    this.thingsAreBrokenCb = cb;
  }

  onUserRequestedCacheRefresh(cb) {
    this.onUserRequestedCacheRefreshCb = cb;
  }

  onRecentlyPlayedCountChange(cb) {
    this.recentlyPlayedCountChange = cb;
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
      console.log(`Stuff is broken, user requested reload`);
      this.thingsAreBrokenCb(false);
    });

    $('#settings_refresh_collection').click(_ => {
      console.log(`User requested collection refresh`);
      this.onUserRequestedCacheRefreshCb();
    });

    $('#settings_tileSize').change(() => {
      const elm = document.getElementById('settings_tileSize');
      // Scale slider from 50% to 150%
      const range = (elm.max - elm.min) / 2;
      const pct = 1.0 * (elm.value - elm.min) / range;
      this.resetUiSizes(pct);
    });

    document.getElementById('settings_openLinksInNativeClient').checked = this.openLinksInNativeClient;
    $('#settings_openLinksInNativeClient').click((x) => {
      this.openLinksInNativeClient = !this.openLinksInNativeClient;
      this.localStorage.save(this.OPEN_LINKS_IN_NATIVE_CLIENT_KEY, this.openLinksInNativeClient);
    });

    $('#settings_recentlyPlayedCount').val(this.recentlyPlayedCount);
    $('#settings_recentlyPlayedCount').change(() => {
      const cntUserInput = $('#settings_recentlyPlayedCount').val();
      const cnt = parseInt(cntUserInput);
      if (isNaN(cnt)) {
        GlobalUI.showErrorUi(`${cnt} isn't a number`);
      } else {
        this.recentlyPlayedCount = cnt;
        this.localStorage.save(this.RECENTLY_PLAYED_COUNT_KEY, cnt);
        if (this.recentlyPlayedCountChange) this.recentlyPlayedCountChange(cnt);
      }
    });
  }

  resetUiSizes(pct) {
    console.log(`Reset UI to ${pct * 100}%`);
    this.localStorage.save(this.TILE_SIZE_STORAGE_KEY, pct);
    const newSize = (this.defaultTileWidth * pct) + "px";
    const tileHeight = (this.defaultTileHeight * pct) + "px";
    const newFontSize = (this.defaultCssFontSize * pct) + "px";
    const newButtonFontSize = (this.defaultCssButtonFontSize * pct) + "px";

    getCss(".arts li").style.height = tileHeight;

    getCss(".arts li").style.width = newSize;
    getCss(".arts li a").style.width = newSize;
    getCss(".arts li img").style.width = newSize;
    getCss(".arts li img").style.height = newSize;
    getCss(".arts li.selected a").style.width = newSize;

    getCss(".arts li a").style.fontSize = newFontSize;
    getCss(".arts li.selected a").style.fontSize = newFontSize;

    getCss(".arts li .expandView").style.fontSize = newButtonFontSize;
  }
}


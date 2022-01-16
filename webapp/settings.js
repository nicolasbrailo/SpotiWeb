
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
    this.TILE_SIZE_STORAGE_KEY = "settings_tileSize_pct";

    this.defaultCssImageSize = parseFloat(getCss(".arts li").style.width);
    if (isNaN(this.defaultCssImageSize)) {
      this.defaultCssImageSize = 200;
      console.error(`Couldn't retrieve default image size, using ${this.defaultCssImageSize}px`);
    }

    this.defaultCssFontSize = parseFloat(getCss(".arts li").style.fontSize);
    if (isNaN(this.defaultCssFontSize)) {
      this.defaultCssFontSize = 25;
      console.error(`Couldn't retrieve default font size, using ${this.defaultCssFontSize}px`);
    }

    this.thingsAreBrokenCb = null;
    this.localStorage = localStorage;
    this.hidden = true;

    this.OPEN_LINKS_IN_NATIVE_CLIENT_KEY = "settings_openLinksInNativeClient";
    this.openLinksInNativeClient = this.localStorage.get(this.OPEN_LINKS_IN_NATIVE_CLIENT_KEY, false);
  }

  notifyUILoaded() {
    this._installButtonCbs();

    const uiSize = this.localStorage.get(this.TILE_SIZE_STORAGE_KEY, 1);
    this.resetUiSizes(uiSize);
  }

  onThingsAreBroken(cb) {
    this.thingsAreBrokenCb = cb;
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
  }

  resetUiSizes(pct) {
    console.log(`Reset UI to ${pct * 100}%`);
    this.localStorage.save(this.TILE_SIZE_STORAGE_KEY, pct);
    const newSize = (this.defaultCssImageSize * pct) + "px";
    const newFontSize = (this.defaultCssFontSize * pct) + "px";

    getCss(".arts li").style.width = newSize;
    getCss(".arts li a").style.width = newSize;
    getCss(".arts li img").style.width = newSize;
    getCss(".arts li img").style.height = newSize;
    getCss(".arts li.selected a").style.width = newSize;

    getCss(".arts li a").style.fontSize = newFontSize;
    getCss(".arts li.selected a").style.fontSize = newFontSize;
  }
}


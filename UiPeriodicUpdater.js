export class UiPeriodicUpdater {
  constructor(cb, intervalMs) {
    this.bgTask = null;
    this.callback = null;
    this.install_visibility_callback();
  }

  installCallback(cb, intervalMs) {
    this.callback = cb;
    this.intervalMs = intervalMs;
    this.reinstallTicker();
  }

  app_became_hidden() {
    if (this.bgTask != null) {
      clearInterval(this.bgTask);
    }
  }

  reinstallTicker() {
    if (this.bgTask == null && this.callback != null) {
      this.bgTask = setInterval(this.callback, this.intervalMs);
    }
  }

  app_became_visible() {
    this.callback();
    this.reinstallTicker();
  }

  static warn_if_visibility_not_supported(visChangeAction) {
    if (this.visibility_checked !== undefined) return;
    this.visibility_checked = true;
    if (visChangeAction === undefined) {
      console.log("Visibility changes not supported: UI elements won't auto-refresh");
    }
  }

  install_visibility_callback() {
    if (this.vis_cb_installed !== undefined) return;
    this.vis_cb_installed = true;

    var hidden, visChangeAction;
    if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
        hidden = "hidden";
        visChangeAction = "visibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
        hidden = "msHidden";
        visChangeAction = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
        hidden = "webkitHidden";
        visChangeAction = "webkitvisibilitychange";
    }

    UiPeriodicUpdater.warn_if_visibility_not_supported(visChangeAction);
    if (visChangeAction !== undefined) {
      document.addEventListener(visChangeAction, () => {
        const app_hidden = document[hidden];
        app_hidden? this.app_became_hidden() : this.app_became_visible();
      });
    }
  }
};

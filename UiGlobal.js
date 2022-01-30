
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



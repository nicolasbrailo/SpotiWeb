import { GlobalUI } from './ui.js';

export class W {
  static get(params) {
    const origComplete = params.complete || (() => {});
    params.complete = (dataOrReqObj, stat, objOrErr) => {
      GlobalUI.notifyRequestFinished();

      const httpStat = dataOrReqObj.status;
      if (stat != 'success' && httpStat > 299) {
        GlobalUI.showErrorUi(JSON.stringify(objOrErr));
      }

      origComplete(dataOrReqObj, stat, objOrErr);
    };

    GlobalUI.notifyNewRequestOnFlight();
    return $.ajax(params);
  }

  static getJson(url, cb) {
    return W.get({
      type: 'GET',
      dataType: 'json',
      contentType: 'application/json',
      processData: false,
      url: url,
      success: cb,
    });
  }
};


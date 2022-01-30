import { GlobalUI } from './UiGlobal.js';

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
};

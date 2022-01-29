import { LocalStorageManager } from './LocalStorageManager.js';
import { W } from './wget.js';

// Make a url query string from obj
function stringify(obj) {
  var str = [];
  for (var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
}

// Make a form-encoded representation of obj suitable for content type x-www-form-urlencoded
function formEncode(obj) {
  var formBody = [];
  for (var property in obj) {
    var encodedKey = encodeURIComponent(property);
    var encodedValue = encodeURIComponent(obj[property]);
    formBody.push(encodedKey + "=" + encodedValue);
  }
  return formBody.join("&");
}

// Make obj from query string
function jsonify(url) {
  const queryStr = url.split('?');
  if (queryStr.length != 2) {
    console.error("Bad res url");
    return {};
  }

  const paramsKv = {};
  const params = queryStr[1].split('&');
  for (let param of params) {
    const k = param.split('=', 1)[0];
    const v = param.substr(k.length + 1);
    paramsKv[k] = v;
  }

  return paramsKv;
}

function randomStr(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

function buildSpotifyAuthLink(client_id, redirect_uri, scope) {
  const spotifyAuthStartParams = {
    client_id: client_id,
    response_type: 'code',
    redirect_uri: redirect_uri,
    // TODO PKCE state: randomStr(32),
    scope: scope,
    show_dialog: false,
    // TODO PKCE code_challenge_method: 'S256',
    // TODO PKCE code_challenge: '',
  };
  return "https://accounts.spotify.com/authorize?" + stringify(spotifyAuthStartParams);
}

function buildSpotifyTokenRequest(auth_code, app_config) {
  const spotifyAuthStep2Params = {
    grant_type: 'authorization_code',
    code: auth_code,
    redirect_uri: app_config.redirect_uri,
    // TODO PKCE client_id: app_config.client_id,
    // TODO PKCE code_challenge: '',
  };

  const b64secret = btoa(`${app_config.client_id}:${app_config.client_secret}`);
  const spotifyAuthStep2Headers = {
    'Authorization': 'Basic ' + b64secret,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  return {
    type: 'POST',
    dataType: 'json',
    contentType: 'application/json',
    processData: false,
    headers: spotifyAuthStep2Headers,
    data: formEncode(spotifyAuthStep2Params),
    url: "https://accounts.spotify.com/api/token",
  };
}

function buildSpotifyTokenRefresh(refresh_tok, app_config) {
  const params = {
    grant_type: 'refresh_token',
    refresh_token: refresh_tok,
    // TODO PKCE client_id: app_config.client_id,
  };

  const b64secret = btoa(`${app_config.client_id}:${app_config.client_secret}`);
  const headers = {
    'Authorization': 'Basic ' + b64secret,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  return {
    type: 'POST',
    dataType: 'json',
    contentType: 'application/json',
    processData: false,
    headers: headers,
    data: formEncode(params),
    url: "https://accounts.spotify.com/api/token",
  };
}

export class SpotifyAuth {
  // Storage keys
  SPOTIFY_CURRENT_TOKENS_KEY = "SPOTIFY_CURRENT_TOKENS_KEY";
  SPOTIFY_APP_CONFIG_KEY = "SPOTIFY_APP_CONFIG_KEY";

  constructor(scope) {
    this.userRequestedScope = scope;
    this.storage = new LocalStorageManager();
    this.current_tokens = this.storage.get(this.SPOTIFY_CURRENT_TOKENS_KEY, null);
    this.app_config = this.storage.get(this.SPOTIFY_APP_CONFIG_KEY, null);
  }

  hasAppConfig() {
    return !!(this.app_config);
  }

  hasValidTokens() {
    return this.current_tokens != null &&
           this.current_tokens.access_token != null &&
           this.current_tokens.refresh_token != null;
  }

  getHeader() {
    return {'Authorization': 'Bearer ' + this.current_tokens?.access_token};
  }

  /*
  // Refresh a token if possible, reauth if not
  refreshOrReauth(uiDivId) {
    const done = $.Deferred();
    this.reauthIfNeeded(uiDivId).then(() => {
      this.refreshToken(done);
    });

    return done;
  }

  // Request user to reauth if needed
  reauthIfNeeded(uiDivId) {
    if (this.hasValidTokens()) return $.Deferred().resolve();
    if (this.hasAppConfig()) return this.triggerSpotifyAuthorize(uiDivId);
    return this.triggerFullReauth(uiDivId);
  }
  */

  // Request user to reconfigure and reauth
  triggerFullReauth(uiDivId) {
    const done = $.Deferred();
    this.triggerRequestAppConfig(uiDivId).then(() => {
      this.triggerSpotifyAuthorize(uiDivId).then(() => {
        done.resolve();
      });
    });
    return done;
  }

  // Step 1: Configure app
  triggerRequestAppConfig(uiDivId) {
    console.log("Request user for app config");
    const def_cfg = {client_id: '', client_secret: '', redirect_uri: ''};
    this.app_config = this.storage.get(this.SPOTIFY_APP_CONFIG_KEY, def_cfg);
    $(`#${uiDivId}`).html(`
        Client ID: <input type="text" id="spotifyAppConfig_client_id" value="${this.app_config.client_id}"/><br/>
        Client Secret: <input type="text" id="spotifyAppConfig_client_secret" value="${this.app_config.client_secret}"/><br/>
        Redirect URI: <input type="text" id="spotifyAppConfig_RedirUri" value="${this.app_config.redirect_uri}"/><br/>
        <button onClick="javascript:triggerRequestAppConfig_onUserAction()">Save</button>
    `);

    const self = this;
    const on_app_configured = $.Deferred();
    window.triggerRequestAppConfig_onUserAction = () => {
      self.app_config = {
        client_id: $('#spotifyAppConfig_client_id').val(),
        client_secret: $('#spotifyAppConfig_client_secret').val(),
        redirect_uri: $('#spotifyAppConfig_RedirUri').val(),
      };
      self.storage.save(self.SPOTIFY_APP_CONFIG_KEY, self.app_config);

      window.triggerRequestAppConfig_onUserAction = undefined;
      $(`#${uiDivId}`).html('');

      on_app_configured.resolve();
    };

    return on_app_configured;
  }

  // Step 2, after app is configed: request new authorization from Spotify
  triggerSpotifyAuthorize(uiDivId) {
    if (!this.hasAppConfig()) {
      return $.Deferred().reject("App config not set");
    }

    console.log("Request user for auth");
    const url = buildSpotifyAuthLink(this.app_config.client_id, this.app_config.redirect_uri, this.userRequestedScope);
    $(`#${uiDivId}`).html(`
        <ol>
          <li><a target="blank" href="${url}">Click here to request Spotify auth</a><br/></li>
          <li>Paste the URL you were redirected to here: <input type="text" id="triggerSpotifyAuthorize_redirUri"></input><br/></li>
          <li><button onClick="javascript:triggerSpotifyAuthorize_onUserAction()">Save</button></li>
        </ol>
    `);

    const self = this;
    const on_auth_complete = $.Deferred();
    window.triggerSpotifyAuthorize_onUserAction = () => {
      const redir_uri = $('#triggerSpotifyAuthorize_redirUri').val();
      const auth_result = jsonify(redir_uri);
      if (!auth_result.code) {
        console.error("Auth not valid", auth_result);
        on_auth_complete.reject("Auth not valid");
        return;
      }

      window.triggerSpotifyAuthorize_onUserAction = undefined;
      $(`#${uiDivId}`).html('');

      // Here we have full app config and user auth, so we can request a token
      const req = buildSpotifyTokenRequest(auth_result.code, self.app_config);
      req.error = on_auth_complete.reject;
      req.success = (response, success, httpStatus) => {
        self._onSpotifyTokenReceived(on_auth_complete, response, success, httpStatus);
      };

      $.ajax(req);
    };

    return on_auth_complete;
  }

  refreshToken(promise=null) {
    const done = promise? promise : $.Deferred();
    if (!this.current_tokens.refresh_token) {
      done.reject();
    }

    const req = buildSpotifyTokenRefresh(this.current_tokens.refresh_token, this.app_config);
    req.error = done.reject;
    req.success = (response, success, httpStatus) => {
      this._onSpotifyTokenReceived(done, response, success, httpStatus);
    };

    $.ajax(req);
    return done;
  }

  // Successfully received a new token
  _onSpotifyTokenReceived(promise, response, success, httpStatus) {
    if (!response || !response.access_token) {
      console.error("Auth request rejected: ", response, success, httpStatus);
      promise.reject();
      return;
    }

    if (success != "success" || httpStatus.status != 200 ||
        !response.token_type || response.token_type != "Bearer") {
      console.warn("Unexpected response to auth request, will try to continue: ", response, success, httpStatus);
    }

    for (var x of this.userRequestedScope.split(' ')) {
      if (!response.scope.split(' ').includes(x)) {
        console.warn(`Missing requested scope ${x}`);
      }
    }

    if (!this.hasValidTokens()) {
      this.current_tokens = response;
      console.log("Received new auth token");
    } else {
      this.current_tokens.access_token = response.access_token;
      this.current_tokens.expires_in = response.expires_in? response.expires_in : 3600;
    }
    this.storage.save(this.SPOTIFY_CURRENT_TOKENS_KEY, this.current_tokens);

    // TODO schedule refresh
    // this.refreshToken(done);

    promise.resolve();
  }
}


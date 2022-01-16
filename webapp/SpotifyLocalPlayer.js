import { W } from './wget.js';

export class SpotifyLocalPlayer {
  constructor(clientName, localStorage) {
    this.deviceId = null;

    this.player = new Spotify.Player({
      name: clientName,
      getOAuthToken: cb => {
        W.getJson("/api/get_tok", auth => {
          cb(auth.Authorization.split(' ')[1]);
        });
      },
      volume: localStorage.get("vol_" + clientName, 0.2),
    });

    // Ready
    this.player.addListener('ready', ({ device_id }) => {
      this.device_id = device_id;
      console.log('Ready with Device ID', this.device_id);
    });

    // Not Ready
    this.player.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID has gone offline', device_id);
    });

    this.player.addListener('initialization_error', ({ message }) => {
        console.error(message);
    });

    this.player.addListener('authentication_error', ({ message }) => {
        console.error(message);
    });

    this.player.addListener('account_error', ({ message }) => {
        console.error(message);
    });

    this.player.connect();
    console.log("Local player ", clientName, " initialized");
  }
};


import { W } from './wget.js';

export class SpotifyLocalPlayer {
  constructor(clientName, localStorage, spotify) {
    this.ready = $.Deferred();
    this.deviceId = null;

    this.player = new Spotify.Player({
      name: clientName,
      getOAuthToken: cb => { cb(spotify.auth.getCurrentToken()); },
      volume: localStorage.get("vol_" + clientName, 0.2),
    });

    this.player.addListener('ready', ({ device_id }) => {
      this.device_id = device_id;
      console.log('Ready local player, Device ID', this.device_id);
      this.ready.resolve();
    });

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
    console.log("Connecting local player ", clientName);
  }
};


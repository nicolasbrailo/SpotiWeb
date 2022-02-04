
export class UiMiniPlayerCtrl {
  constructor(spotify) {
    this.spotify = spotify;
  }

  notifyUILoaded() {
    this._installButtonCbs();
    this.onTick();
  }

  onTick() {
    this.updateAvailableDevices();
    this.updatePlayingNow();
  }

  updateAvailableDevices = () => {
    this.spotify.getAvailableDevices().then(devs  => {
      $('#playctrls_device').html('');
      let device_active = false;
      $.each(devs, (_, dev) => {
        let selected = "";
        if (dev.is_active) {
          $('#playctrls_vol').val(dev.volume_percent);
          selected = "selected";
          device_active = true;
        }
        $('#playctrls_device').append(`<option value="${dev.id}" ${selected}>${dev.name}</option>`);
      });

      if (!device_active) {
        $('#playctrls_device').append(`<option selected>NO DEVICE SELECTED</option>`);
      }
    });
  }

  updatePlayingNow = () => {
    this.spotify.getPlayingNow().then(playingNow => {
      const playCtrls = document.getElementById('playctrls');
      if (!playingNow) {
        playCtrls.classList.remove('somethingPlaying');
        playCtrls.classList.add('nothingPlaying');
      } else {
        const shuffle_active = playingNow?.full_response?.shuffle_state;
        $('#playctrls_shuffle_enabled').prop('checked', shuffle_active);

        playCtrls.classList.add('somethingPlaying');
        playCtrls.classList.remove('nothingPlaying');

        $("#playingNow_StatusImg").attr("src", playingNow.album_img);
        $("#playingNow_statusLine1").html(playingNow.songName);
        $("#playingNow_statusLine2").html(`<a href="${playingNow.album_uri}">${playingNow.album}</a>| ` +
                                          `<a href="${playingNow.album_uri}">${playingNow.artist}</a>`);
      }
    });
  }

  _installButtonCbs() {
    const sp = this.spotify;
    $('#playctrls_device').change(() => {
      $('#playctrls_device option:selected').each((idx, opt) => {
        const dev_id = opt.value;
        const dev_name = opt.text;
        sp.setActiveDevice(opt.value).then(_ => {
          console.log("Selected new device", dev_name);
        });
      });
    });

    $('#playctrls_vol').change(_ => {
      console.log("Set vol", $('#playctrls_vol').val());
      sp.setVolume($('#playctrls_vol').val());
    });

    $('#playctrls_shuffle_enabled').change(_ => {
      if ($('#playctrls_shuffle_enabled').is(":checked")) {
        sp.setShuffleEnabled();
      } else {
        sp.setShuffleDisabled();
      }
    });

    $('#playctrls_prev').click(_ => { sp.playPrev().then(this.updatePlayingNow); });
    $('#playctrls_play').click(_ => { sp.playPause(); });
    $('#playctrls_next').click(_ => { sp.playNext().then(this.updatePlayingNow); });
  }
}


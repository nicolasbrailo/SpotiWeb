
export class UiMiniPlayerCtrl {
  constructor(spProxy) {
    this.spProxy = spProxy;
  }

  notifyUILoaded() {
    this._installButtonCbs();
    this.onTick();
  }

  onTick() {
    this.updateAvailableDevices();
    this.updatePlayingNow();
  }

  updateAvailableDevices() {
    this.spProxy.getAvailableDevices().then(devs  => {
      $('#playctrls_device').html('');
      $.each(devs, (_, dev) => {
        let selected = "";
        if (dev.is_active) {
          $('#playctrls_vol').val(dev.volume_percent);
          selected = "selected";
        }
        $('#playctrls_device').append(`<option value="${dev.id}" ${selected}>${dev.name}</option>`);
      });
    });
  }

  updatePlayingNow() {
    this.spProxy.getPlayingNow().then(playingNow => {
      const playCtrls = document.getElementById('playctrls');
      if (!playingNow) {
        playCtrls.classList.remove('somethingPlaying');
        playCtrls.classList.add('nothingPlaying');
      } else {
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
    const sp = this.spProxy;
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

    $('#playctrls_prev').click(_ => { sp.playPrev(); });
    $('#playctrls_play').click(_ => { sp.playPause(); });
    $('#playctrls_next').click(_ => { sp.playNext(); });
  }
}


const path = require('path');
const { exec } = require('child_process');

function playNotification() {
    const soundFile = path.join(__dirname, 'sounds', 'notification.mp3');
    const script = `
        Set Sound = CreateObject("WMPlayer.OCX.7")
        Sound.URL = "${soundFile.replace(/\\/g, '\\\\')}"
        Sound.Controls.play
        While Sound.playState <> 1
            WScript.Sleep 100
        Wend
        Sound.close
    `;
    
    const vbsPath = path.join(__dirname, 'play.vbs');
    require('fs').writeFileSync(vbsPath, script);
    
    exec(`cscript //nologo "${vbsPath}"`, (error) => {
        if (error) {
            console.error('Error playing sound:', error);
        }
        // Clean up the temporary script
        require('fs').unlinkSync(vbsPath);
    });
}

module.exports = { playNotification };

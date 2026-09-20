const path = require('path')
const { app, BrowserWindow, Menu } = require('electron')

const createWindow = () => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 400,
    height: 686,
    backgroundColor: '#00AAF1',
    webPreferences:{
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'icons', 'png', '256x256.png')
  })

  win.loadFile('src/index.html')
}

app.whenReady().then(() => {
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

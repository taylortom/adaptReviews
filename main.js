var electron = require("electron");

var BrowserWindow = electron.BrowserWindow;
var app = electron.app;

app.on("ready", function() {
  var appWindow = new BrowserWindow({
    width: 850,
    height: 800
  });

  var query = "adapt_authoring/2309735";
  query = "";

  appWindow.loadURL(`file://${__dirname}/index.html?${query}`);
});

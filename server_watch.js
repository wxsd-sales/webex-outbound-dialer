var exited = false;
var cp = require('child_process');
var superProcess = cp.fork('./server.js');
var logCounter = 0;

superProcess.on('exit', (code, signal) => {
  console.log('server-watch - exit event received');
  exited = true;
});

setInterval(function() {
  if (exited) {
    console.log('server-watch - is gone :( restarting...');
    exited = false;
    superProcess = cp.fork('./server.js');

    superProcess.on('exit', (code, signal) => {
      console.log('server-watch - exit event received');
      exited = true;
    });
  } else {
    if(logCounter > 30){
      logCounter = 0;
      console.log('server-watch - still running ...');
    }
    logCounter += 1;
  }
}, 1000);

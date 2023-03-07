// server.js
require('dotenv').config();

var fork = require('child_process').fork;

const express = require("express");
const bodyParser = require("body-parser");
const app = express();

//handles Ctrl+C interrupts
var process = require('process')
process.on('SIGINT', () => {
  console.info("Interrupted")
  process.exit(0)
})

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

//send response to the REST /bridge POST request
function send(res, jObject){
  try{
    jObject["message"] = jObject["message"].trim();
    if(jObject["message"] == "" && jObject["success"] == true){
      jObject["message"] = "Bridge established.";
    }
    console.log(`returning: ${JSON.stringify(jObject)}`)
    res.send(jObject);
  } catch (e){
    console.log('request already responded, not sending again.')
  }
}

//we use a child process to make the bridge call
//these are our event listeners for that child process.
function setupChildListeners(child, res, trackingId){

  function getTimeString(){
    let timestamp = new Date();
    return timestamp.toISOString().slice(0,-5);
  }

  function myLogLine(msg){
    console.log(`${getTimeString()}-${trackingId}-${msg}`);
  }

  function myStdOut(msg){
    process.stdout.write(`${getTimeString()}-${trackingId}-${msg}`);
  }

  child.on('message', function (msg) {
    myLogLine(`child msg: ${msg}`);
    success = true;
    if(msg != ""){
      success = false;
    }
    send(res, {"success":success, "message":msg, "trackingId":trackingId})
   })

  child.on('exit', function (code, signal) {
    myLogLine(`child process exited with ` +
                `code ${code} and signal ${signal}`);
  });

  child.on('close', function (code, signal) {
    myLogLine(`child process closed with ` +
                `code ${code} and signal ${signal}`);
  });

  child.on('error', function (err) {
    myLogLine(`child err:\n${err}`);
   })

  child.stdout.on('data', function(data) {
    myStdOut(`child stdout: ${data}`);
  });

  child.stderr.on('data', (data) => {
    myLogLine(`child stderr: ${data}`);
  });
}

// ..
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//There's a better way to serve these 3 files
app.get('/launch.html', async(req, res, next) => {
  console.log('launch')
  res.sendFile(`${__dirname}/launch.html`)
});

app.get('/public/bridge.js', async(req, res, next) => {
  res.sendFile(`${__dirname}/public/bridge.js`)
});

app.get('/public/webex.js', async(req, res, next) => {
  res.sendFile(`${__dirname}/public/webex.js`)
});

app.get('/listener', async(req, res, next) => {
  res.send('alive');
});

//used only to expose browser request actions to playwright
app.post('/listener', async(req, res, next) => {
  console.log('listener');
  console.log(req.body);
  res.send('alive');
});

app.post('/bridge', async (req, res, next) => {
  console.log('bridge');
  console.log(req.body);
  let trackingId = uuidv4();
  console.log(trackingId);
  let msg = "";
  let success = false;
  if(req.body.initialToken == undefined){
    msg = "initialToken is required and must be a bearer token belonging to a licensed Webex or guest user.";
  } else if(req.body.endpointToken == undefined){
    msg = "endpointToken is required and must belong to a licensed Webex user.";
  } else if(req.body.meeting == undefined){
    msg = "meeting parameter is required and should be a meeting SIP or url.";
  } else if(req.body.endpointSIP == undefined){
    msg = "endpointSIP is required and must be a valid SIP address.";
  } else {

    let processArgs = [process.env.PORT, req.body.initialToken, req.body.endpointToken, req.body.meeting, req.body.endpointSIP]
    if(req.body.meetingToken != null){
      processArgs.push(req.body.meetingToken);
    }
    console.log(processArgs);
    success = true;

    //spawn a browser process to make the desired bridge webex call/meeting
    var child = fork('./webkit.js', processArgs, {
      stdio: 'pipe'
    });

    setupChildListeners(child, res, trackingId);
    if([undefined, null, false].indexOf(req.body.wait) >= 0){
      send(res, {"success":success, "message":"Request to bridge call has been received.", "trackingId":trackingId})
    }
  }
  if(!success){
    send(res, {"success":success, "message":msg, "trackingId":trackingId});
  }
})


const listener = app.listen(process.env.PORT, function() {
  console.log("Your app is listening on port " + listener.address().port);
});


const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let initialToken = urlParams.get('initialToken');
let endpointToken = urlParams.get('endpointToken');
let meetingToken = urlParams.get('meetingToken');
console.log(initialToken);
console.log(endpointToken);
console.log(meetingToken);

let init_complete = {};
let num_webex_instances = 2;
let num_deregistered = 0;
var loadedReady = false;
var firstLegReady = false;
var secondLegReady = false;
var thirdLegReady = false;
var cleanupReady = false;


const first_webex = (window.webex = Webex.init({credentials: {access_token: initialToken}}));
const second_webex = (window.webex = Webex.init({credentials: {access_token: endpointToken}}));
let third_webex = null;
if(meetingToken != null){
  third_webex = (window.webex = Webex.init({credentials: {access_token: meetingToken}}));
  num_webex_instances = 3;
}

let tempShare = null;

const mediaSettings = {
  receiveVideo: true,
  receiveAudio: true,
  receiveShare: false,
  sendShare: false,
  sendVideo: true,
  sendAudio: true
};

let streams = {first: null, second: null, third:null}
let meetings = {first: null, second: null, third:null}

let firstLegDestination = null;
let secondDestination = null;
let launchedFrom = null;

let connectCounter = 0;
let maxCounterAttempts = 60; // x * pollMeetingStateInterval = total milisec time we'll wait to be let in from lobby before giving up
let pollMeetingStateInterval = 2000; //miliseconds


first_webex.once("ready", () => {
  genericFinalizeWebexAuth("first", first_webex);
});

second_webex.once("ready", () => {
  genericFinalizeWebexAuth("second", second_webex);
});

//third_webex is optional, only used if meetingToken is supplied in initial REST request
if(third_webex != null){
  third_webex.once("ready", () => {
    genericFinalizeWebexAuth("third", third_webex);
  });
}

function isReady(){
  return ready == true;
}

function genericFinalizeWebexAuth(place, generic_webex){
  if (generic_webex.canAuthorize) {
    console.log("Test Generic User Authenticated");
    console.log(`Data - ${JSON.stringify(generic_webex)}`);

    generic_webex.meetings.register()
      .then((data) => {
        console.log('generic_webex user register done')
        init_complete[place] = {success:true};
        loadElement();
      })
      .catch(err => {
        console.log('generic_webex user register Error:')
        console.log(err);
        init_complete[place] = {success:false, code: err.statusCode};
        loadElement();
        throw err;
    });
  }
}

function allClear(){
  console.log('checking if allClear()');
  let all_clear = true;
  let instances = [first_webex, second_webex, third_webex];
  for(let i in instances){
    if(instances[i] != null && instances[i].meetings.registered){
      console.log(`Not all clear: ${i} registered: ${instances[i].meetings.registered}`)
      all_clear = false;
      break;
    }
  }
  if(all_clear){
    console.log('all clear!');
    console.log('writing close element.');
    cleanupReady = true;
    writeElement("cleanup", {result:"success"});
  }
}

function cleanup(){
  console.log("cleanup called...")
  first_webex.meetings.unregister().then(allClear);
  console.log("unregistered first_webex");
  second_webex.meetings.unregister().then(allClear);
  console.log("unregistered second_webex");
  if(third_webex != null){
    third_webex.meetings.unregister().then(allClear);
    console.log("unregistered third_webex");
  }
}

/*Originally we used writeElement to write to the DOM to update playwright
  but those functions don't work in our headful/no display environment,
  so we utilize inbound requests to the server, which playwright can still snoop.
  That's why we now fetch('/listener')
  */
function writeElement(id, innerHTML){
  let retEle = document.createElement("DIV");
  retEle.id = id;
  retEle.innerHTML = JSON.stringify(innerHTML);
  document.body.appendChild(retEle);
  //console.log('element written');
  //console.log(retEle.innerHTML);
  fetch('/listener', {
    method: 'POST',
    credentials: 'same-origin', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json',
      'Element-ID': id
    },
    body: JSON.stringify(innerHTML)
  });
}

function loadElement(){
  let ready = false;
  let keyLength = Object.keys(init_complete).length;
  console.log("init_complete: " + keyLength)
  if(keyLength == 2 && meetingToken == null){
    console.log("setting done loaded status. (2 webex instances)");
    ready = true;
  } else if(keyLength == 3){
    console.log("setting done loaded status. (3 webex instances)");
    ready = true;
  }
  if(ready){
    console.log('ready');
    console.log(init_complete);
    loadedReady = true;
    writeElement("loadedStatus", init_complete);
  }
}

//Used for first and third legs of the call
function mainLegElement(result, place, message){
  let innerHTML = {"result":result}
  if(message != undefined){
    innerHTML["message"] = message;
  }
  if(place == "first" && result == "failure"){
    endCall(meetings.first);
  }
  if(place == "first"){
    firstLegReady = true;
  } else if (place == "second"){
    secondLegReady = true;
  } else if (place == "third"){
    thirdLegReady = true;
  }
  writeElement(`${place}LegStatus`, innerHTML);
}


function operator(config){
  firstLegDestination = config.meetingSIP;
  secondLegDestination = config.endpointSIP;
  if(config.launcher !== null && config.launcher !== undefined){
    launchedFrom = config.launcher;
  } else {
    launchedFrom = "webkit";
  }
  mainLeg(firstLegDestination, "first");
}

function testOperator(){
  firstLegDestination = "tahanson.acecloud@webex.com";
  secondLegDestination = "taylors_home_dx80@wxsd.rooms.webex.com";
  launchedFrom = "webkit";
  firstLegWithMedia(firstLegDestination, "first");
}

function testOperator2(){
  firstLegDestination = "tahanson.acecloud@webex.com";
  secondLegDestination = "taylors_home_dx80@wxsd.rooms.webex.com";
  launchedFrom = "webkit";
  mainLeg(firstLegDestination, "first");
}

function firstLegWithMedia(firstDestination){
  console.log(`firstLeg destination - ${firstDestination}`);
  return first_webex.meetings
    .create(firstDestination)
    .then(meeting => {
      meetings.first = meeting;
      bindFirstMeetingEvents(meetings.first);
      return meeting.join().then(() => {
        console.log('adding first media (none to start)');
        return meeting.getMediaStreams(mediaSettings).then((mediaStreams) => {
          const [localStream, localShare] = mediaStreams;
          console.log("localStream:");
          console.log(localStream);
          meeting.addMedia({
            localShare,
            localStream,
            mediaSettings
          });
        });
      });
    })
    .catch(error => {
      console.error(error);
    });
}


function addMainLegMedia(meeting, place){
  console.log(`adding ${place} media (none to start)`);
  //let tempStream = new MediaStream();
  let mediaObject = {
    //localShare: tempShare,
    //localStream: tempStream,
    mediaSettings
  }
  if(place == "third"){
    mediaObject = {
      localShare: tempShare,
      localStream: streams.second,
      mediaSettings
    }
  }
  meeting.addMedia(mediaObject).then(() => {
    console.log(`${place} leg addMedia success!`);
    mainLegElement("success", place);
  }).catch(e => {
    console.log(`${place} leg error with addMedia!`);
    console.log('e: ' + e);
    mainLegElement("failure", place, e.message);
  });
}

function mainLeg(destination, place){
  console.log(`${place}Leg destination - ${destination}`);
  let use_webex = second_webex;
  if(third_webex != null && place == "third"){
    console.log('using third webex meetings instance');
    use_webex = third_webex;
  } else if(place == "first"){
    use_webex = first_webex;
  }
  return use_webex.meetings
    .create(destination)
    .then(meeting => {
      meetings[place] = meeting;
      bindMainMeetingEvents(meetings[place], place);
      return meeting.join().then(() => {
        console.log(`${place}Leg join meeting:`);
        console.log(meeting);
        console.log(`${place}Leg join meeting.state: ${meeting.state}`);
        if(meeting.state == "JOINED"){
          addMainLegMedia(meeting, place);
        } else {
          var intervalID = setInterval(function(){
            console.log(`${place}Leg connectCounter: ${connectCounter}`);
            console.log(meeting.state);
            if(meeting.state == "JOINED"){
              console.log('clearing interval');
              clearInterval(intervalID);
              connectCounter = 0;
              addMainLegMedia(meeting, place);
            } else {
              connectCounter += 1;
              if(connectCounter > maxCounterAttempts){
                let err_msg = `no one let ${place} leg in, clearing interval`;
                console.log(err_msg);
                clearInterval(intervalID);
                connectCounter = 0;
                mainLegElement("failure", place, err_msg);
              }
            }
          }, pollMeetingStateInterval);
        }
      }).catch(err => {
        console.log(`${place} leg error with join!`);
        console.error('err: ' + err);
        mainLegElement("failure", place, err.message);
      });
    }).catch(error => {
      console.log(`${place} leg error with create!`);
      console.error('error: ' + error);
      mainLegElement("failure", place, error.message);
    });
}


function secondLeg(destination){
  place = "second"
  console.log(`secondLeg destination - ${destination}`);
  return second_webex.meetings
    .create(destination)
    .then(meeting => {
      meetings.second = meeting;
      bindSecondMeetingEvents(meetings.second);
      return meeting.join().then(() => {
          meeting.addMedia({
            localShare: tempShare,
            localStream: streams.first,
            mediaSettings
          }).then(() => {
            console.log('second leg success!');
            mainLegElement("success", place);
          }).catch(e => {
            console.log('second leg error with addMedia!');
            console.log('e: ' + e);
            mainLegElement("failure", place, e.message);
          });
      }).catch(err => {
        console.log('second leg error with join!');
        console.error('err: ' + err);
        mainLegElement("failure", place, err.message);
      });
    }).catch(error => {
      console.log('second leg error with create!');
      console.error('error: ' + error);
      mainLegElement("failure", place, error.message);
    });
}


function updateFirstLeg(){
  console.log("meetings.first");
  console.log(meetings.first);
  console.log("streams.second");
  console.log(streams.second);

  return meetings.first.updateMedia({
    localShare: tempShare,
    localStream: streams.second,
    mediaSettings
  });
}

function updateSecondLegAV(){
  updateSecondLegAudio();
  updateSecondLegVideo();
}


function updateSecondLegVideo(){
  console.log("streams.third");
  console.log(streams.third);
  videoStream = new MediaStream();
  videoStream.addTrack(streams.third.getVideoTracks()[0])
  console.log("videoStream");
  console.log(videoStream);
  meetings.second.updateVideo({
    sendVideo: true,
    receiveVideo: true,
    stream: videoStream,
  });
  setTimeout(() => {
    console.log('second update');
    meetings.second.updateVideo({sendVideo:true, receiveVideo: true, stream:videoStream});
  }, 2000);
}

function updateSecondLegAudio(){
  console.log("streams.third");
  console.log(streams.third);
  audioStream = new MediaStream();
  audioStream.addTrack(streams.third.getAudioTracks()[0])
  console.log("audioStream");
  console.log(audioStream);
  meetings.second.updateAudio({
    sendAudio: true,
    receiveAudio: true,
    stream: audioStream,
  });
  setTimeout(() => {
    console.log('second update');
    meetings.second.updateAudio({sendAudio:true, receiveAudio: true, stream:audioStream});
  }, 2000);
}


function addTrack(main_stream, media){
  if(streams[main_stream] == null){
    streams[main_stream] = media.stream;
  } else {
    let new_track = media.stream.getTracks()[0]
    console.log('new_track')
    console.log(new_track)
    let remove_track = [];
    if(new_track.kind == "audio"){
      remove_track = streams[main_stream].getAudioTracks();
    } else if (new_track.kind == "video"){
      remove_track = streams[main_stream].getVideoTracks();
    }
    removeTrack(main_stream, remove_track);
    streams[main_stream].addTrack(new_track);
  }
  console.log(`${main_stream} tracks`);
  let stream_tracks = streams[main_stream].getTracks();
  console.log(stream_tracks);
  console.log(stream_tracks.length);
  if(stream_tracks.length == 2){
    if(main_stream == "first" && secondLegDestination != null){
      console.log('auto starting second leg to: '+ secondLegDestination);
      secondLeg(secondLegDestination);
    } else if (main_stream == "second"){
        if(launchedFrom == "webkit"){
          mainLeg(firstLegDestination, "third");
        } else {
          updateFirstLeg();
        }
    } else if (main_stream == "third"){
      updateSecondLegAV();
      meetings.first.leave().catch(err => {
        console.log("error leaving first/initial meeting! This shouldn't happen.");
      });
    }
  }
}

function removeTrack(main_stream, track){
  if(track.length > 0){
    console.log(`removing ${track[0].kind} track`);
    streams[main_stream].removeTrack(track[0]);
  }
}

function endCall(meeting, fromFirst){
  meeting.leave().catch(err => {
    console.log('error leaving meeting in endCall');
    console.log(err);
  });
  let meetingKeys = Object.keys(meetings);
  let cleanupCounter = 0;
  for(let key of meetingKeys){
    console.log('endCall');
    console.log(key);
    if(meetings[key] != null) {console.log(meetings[key].state);}
    if( meetings[key] == null || (["LEFT", "INACTIVE"].indexOf(meetings[key].state) >= 0) ){
      cleanupCounter += 1;
    }
  }
  if(cleanupCounter == 3){
    console.log("time to deregister!");
    cleanup();
  }
}

function handleMediaReady(main_stream, media){
  if (!media) {
    console.log('doing nothing, returning...')
    return;
  }
  if (media.type === "remoteVideo") {
    addTrack(main_stream, media);
  }
  if (media.type === "remoteAudio") {
    addTrack(main_stream, media);
  }
}

function handleMediaStopped(main_stream, media){
  if(streams[main_stream] != null){
    if (media.type === "remoteVideo") {
      remove_track = streams[main_stream].getVideoTracks();
      removeTrack(main_stream, remove_track);
    }
    if (media.type === "remoteAudio") {
      remove_track = streams[main_stream].getAudioTracks();
      removeTrack(main_stream, remove_track);
    }
    if(streams[main_stream].getTracks().length == 0){
      console.log(`resetting ${main_stream} stream to null`);
      streams[main_stream] = null;
      if(main_stream == "second"){ //first call stopped, so we also need to kill second.
        console.log('leaving meetings.third');
        endCall(meetings.third);
        endCall(meetings.first);//Most of the time, this is pointless, but we want to make sure to remove the first leg user if second leg immediately declines the call.
      } else if (main_stream == "third"){ //second call stopped, so we also need to kill first
        console.log('leaving meetings.second');
        endCall(meetings.second);
        endCall(meetings.first);//Most of the time, this is pointless, but we want to make sure to remove the first leg user if second leg immediately declines the call.
      } else if (main_stream == "first"){
        console.log('leaving meetings.first');
        endCall(meetings.first);
      }
    }
  }
}

function bindMainMeetingEvents(meeting, place){
  if(place == "first"){
    bindFirstMeetingEvents(meeting);
  } else {
    bindThirdMeetingEvents(meeting);
  }
}

function bindFirstMeetingEvents(meeting){
  // Handle media streams changes to ready state
  meeting.on("media:ready", media => {
    console.log('first media:ready', media);
    handleMediaReady('first', media);
  });

  // Handle media streams stopping
  meeting.on("media:stopped", media => {
    console.log('first media:stopped', media);
    handleMediaStopped('first', media);
  });

  //meeting:stateChange
  meeting.on('meeting:stateChange', (payload) => {
    console.log("First Meeting State Change", payload);
    console.log(payload.payload.currentState);
    console.log(payload.payload.previousState);
  });

  meeting.on('meeting:actionsUpdate', (payload) => {
    console.log(`meeting:actionsUpdate - ${JSON.stringify(payload)}`);
    console.log(`meeting:actionsUpdate - meeting.state: ${meeting.state}`);
    console.log(meeting);
  });

  meeting.on('members:self:update', (payload) => {
    console.log("members:self:update", payload);
  });

  meeting.on('members:update', (payload) => {
    console.log("members:update", payload);
  });

  meeting.on('meeting:self:guestAdmitted', (payload) => {
    console.log("First Meeting guestAdmitted", payload);
  });

  meeting.on('meeting:self:lobbyWaiting', (payload) => {
    console.log("First Meeting Lobby Waiting", payload);
  });
}

function bindSecondMeetingEvents(meeting){
  // Handle media streams changes to ready state
  meeting.on("media:ready", media => {
    console.log('second media:ready', media);
    handleMediaReady('second', media);
  });

  // Handle media streams stopping
  meeting.on("media:stopped", media => {
    console.log('second media:stopped', media);
    handleMediaStopped('second', media);
  });

  //meeting:stateChange
  meeting.on('meeting:stateChange', (payload) => {
    console.log("Second Meeting State Change", payload);
    console.log("currentState: " + payload.payload.currentState);
    if(payload.payload.currentState == "INACTIVE"){
      if(meetings.third != null && meetings.third.state != "LEFT"){
        console.log("second leg inactive, leaving third leg");
        endCall(meetings.third);
      }
    }
  });
}

function bindThirdMeetingEvents(meeting){
  // Handle media streams changes to ready state
  meeting.on("media:ready", media => {
    console.log('third media:ready', media);
    handleMediaReady('third', media);
  });

  // Handle media streams stopping
  meeting.on("media:stopped", media => {
    console.log('third media:stopped', media);
    handleMediaStopped('third', media);
  });

  //meeting:stateChange
  meeting.on('meeting:stateChange', (payload) => {
    console.log("Third Meeting State Change", payload);
    console.log("currentState: " + payload.payload.currentState);
    if(payload.payload.currentState == "INACTIVE"){
      if(meetings.second != null && meetings.second.state != "LEFT"){
        console.log("third leg inactive, leaving second leg");
        endCall(meetings.second);
      }
    }
  });
}

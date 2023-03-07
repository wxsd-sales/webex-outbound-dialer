const { webkit } = require('playwright');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  //headless: true hangs when trying to initialize the browser in the AWS MacOS environment.
  //My assumption is this has to do with GPU/Monitor (or lack of?)
  //It isn't clear why headless:false does work, but it causes other problems.
  const browser = await webkit.launch({ headless: true , args: [
  ],
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(60000);

  let meetingToken = null;
  let msg = ""; //response message to our parent process
  let loadSuccess = null;
  let complete = false;
  let legCompleted = 0; //used to keep track of where we are if browser takes too long to initialize and we need to reply.
  let cleanup = false;

  console.log(process.argv);
  //node is argument 0, this file is argument 1, so argv starts at index 2
  let serverPort = process.argv[2]
  let initialToken = process.argv[3];
  let endpointToken = process.argv[4];
  let meeting = process.argv[5];
  let endpointSIP = process.argv[6];
  if(process.argv.length > 7){
    meetingToken = process.argv[7];
  }

  let config = {
                "meetingSIP":meeting,
                "endpointSIP":endpointSIP,
                "launcher":"webkit",
               };

  page.on("console", (msg) => {
    console.log(msg)
  })

  page.on("pageerror", (err) => {
    console.log(err)
  })

  function setLoadStatus(resultObject){
    console.log('setting load status');
    let tokenPositions = {"first":"initialToken", "second":"endpointToken", "third":"meetingToken"};
    console.log(Object.keys(resultObject));
    for(let key of Object.keys(resultObject)){
      console.log(resultObject[key]);
      if(resultObject[key].success !== true){
        loadSuccess = false;
        console.log('load failure!')
        console.log(resultObject[key])
        let tokenPosition = tokenPositions[key];
        if(resultObject[key].code == 401){
          msg += `The ${tokenPosition} is unauthorized. (401)`;
        } else {
          msg += `The ${tokenPosition} is not valid. `;
        }
      }
    }
    if(loadSuccess == null){
      loadSuccess = true;
    }
  }

  function waitForEnd(){
    if(msg != ""){
      console.log('calling cleanup!');
      result = page.evaluate(() => cleanup());
    }
    console.log("Final MSG:");
    console.log(msg);
    process.send(msg); //send this to parent process

    let cleanupInterval = setInterval(function(){
      if(cleanup){ //can't use any counters here because the call duration is not known (could be long).
        clearInterval(cleanupInterval);
        console.log('cleanup complete.');
        console.log('closing browser.');
        browser.close();
        process.exit();
      }
    }, 2000);
  }

  //Normally, we should use functions in playwright like page.innerHTML(), or page.waitForFunction()
  //However, in our headless:false mode in AWS (that isn't really headful), the waitFor functions of playwright timeout.
  //As a workaround, we use inbound requests from the browser to notify us of completion status(es).
  page.on("request", (req) => {
    var pathname = new URL(req.url()).pathname;
    if(pathname == "/listener"){
      console.log("REQUEST");
      console.log(req.postDataJSON());
      let resultObject = req.postDataJSON();
      console.log(req.headers());
      if(req.headers()['element-id'] == "loadedStatus"){
        setLoadStatus(resultObject);
      } else {
        if(req.headers()['element-id'] == "firstLegStatus"){
          legCompleted = 1;
          if(resultObject.result != "success"){
            msg = `${config.meetingSIP} could not be joined: ${resultObject.message}`;
          }
        } else if (req.headers()['element-id'] == "secondLegStatus"){
          legCompleted = 2;
          if(resultObject.result != "success"){
            msg = `${config.endpointSIP} could not be joined because ${resultObject.message}`;
          }
        } else if (req.headers()['element-id'] == "thirdLegStatus"){
          legCompleted = 3;
          if(resultObject.result != "success"){
            msg = `${config.meetingSIP} could not be joined: ${resultObject.message}`;
          } else {
            complete = true;
          }
        } else if (req.headers()['element-id'] == "cleanup"){
          cleanup = true;
        }
      }
    }
  })

  if(meetingToken != initialToken){
    let argumentString = `initialToken=${initialToken}&endpointToken=${endpointToken}`;
    if(meetingToken != null){
      console.log("meetingToken is not null.  Setting in argumentString.");
      argumentString += `&meetingToken=${meetingToken}`;
    }
    //let gotoURL = `http://localhost:${process.env.HIDDEN_PORT}?${argumentString}`;
    //let gotoURL = `file://${__dirname}/launch.html?${argumentString}`;
    let gotoURL = `http://localhost:${serverPort}/launch.html?${argumentString}`;
    console.log(gotoURL);
    await page.goto(gotoURL);
    console.log('page loaded')

    let loadStatusCounter = 0;
    let loadInterval = setInterval(function(){
      loadStatusCounter += 1;
      if(loadSuccess != null || loadStatusCounter >= 30){
        clearInterval(loadInterval);
        if(loadSuccess == true){
          let statusCounter = 0;
          result = page.evaluate((config) => operator(config), config)
          let statusInterval = setInterval(function(){
            statusCounter += 1;
            console.log(`webkit.js statusCounter: ${statusCounter}`);
            if(msg != "" || statusCounter >= 30 || complete){
              clearInterval(statusInterval);
              if(msg == "" && !complete){
                if(legCompleted == 0){
                  msg = "Timeout waiting for initialToken user to be let into meetingSIP. ";
                } else if (legCompleted == 1){
                  msg = "Timeout waiting for endpointToken to dial endpointSIP";
                } else if(legCompleted == 2){
                  msg = "Timeout waiting for endpointToken user to be let into meetingSIP. ";
                  if(meetingToken != null){
                    msg = "Timeout waiting for meetingToken user to be let into meetingSIP. ";
                  }
                }
              }
              waitForEnd();
            }
          }, 2000);
        } else {
          if(loadSuccess == null){//this would mean we timedout trying to load.
            msg = "Timeout waiting for Webex session to initialize.  Are your tokens correct?";
          }
          waitForEnd();
        }
      }
    }, 2000);
    console.log("Moving on.");
  } else {
    msg = "meetingToken cannot be the same as initialToken";
  }
})();

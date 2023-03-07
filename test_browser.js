const { webkit } = require('playwright');

async function openBrowser() {
  //headless: true hangs when trying to initialize the browser in the AWS MacOS environment.
  //My assumption is this has to do with GPU/Monitor (or lack of?)
  //It isn't clear why headless:false does work, but it causes other problems.
  const browser = await webkit.launch({ headless: false , args: [
  ],
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(60000);
  console.log('done');
};

openBrowser();
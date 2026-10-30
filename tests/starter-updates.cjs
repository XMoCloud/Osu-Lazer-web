/* Existing-library regression using the real tutorial and 1207609 archives.
 * OSU_TEST_NEW_MAP can point to a no-video 1207609.osz downloaded separately.
 * All network responses are isolated fixtures; player storage is never touched.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.OSU_PLAYWRIGHT_PATH||'playwright');
const base=process.env.OSU_TEST_URL||'http://127.0.0.1:8765';
(async()=>{
  const archive=fs.readFileSync(process.env.OSU_TEST_NEW_MAP||path.join(os.tmpdir(),'osu-starter-1207609.osz'));
  const browser=await chromium.launch({headless:true,executablePath:process.env.OSU_CHROME,args:['--autoplay-policy=no-user-gesture-required']});
  let releaseFirst,releaseNext;
  const firstGate=new Promise(resolve=>{releaseFirst=resolve;}),nextGate=new Promise(resolve=>{releaseNext=resolve;});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/__tutorial.osz',route=>route.fulfill({body:fs.readFileSync(process.env.OSU_TEST_MAP||path.join(os.tmpdir(),'osu-showroom-tutorial.osz')),contentType:'application/octet-stream'}));
    await page.route('**/api/v2/s/*',route=>route.fulfill({json:{id:Number(route.request().url().split('/').pop()),status:'ranked',beatmaps:[]}}));
    await page.route('**/api/v1/hinai/d/*',async route=>{
      const id=route.request().url().split('/').pop();requests.push(id);
      await(id==='1207609n'?firstGate:nextGate);
      try{await route.fulfill({body:archive,contentType:'application/octet-stream'});}catch{}
    });
    await page.goto(base);await page.waitForFunction(()=>window.osuStarterMaps);
    await page.evaluate(async()=>{
      await osuLibrary.ready;
      const map=await osuImportOsz(new File([await(await fetch('/__tutorial.osz')).blob()],'1011011.osz'),{metadata:{id:'1011011',beatmaps:[]}});
      for(const[id]of osuStarterMaps.maps.slice(0,17)){
        if(id===map.id)continue;
        const copy={...map,id};await osuMapStore.saveMap(copy);document.dispatchEvent(new CustomEvent('osu:map-installed',{detail:copy}));
      }
    });
    await page.locator('#startOverlay').click();
    await page.evaluate(()=>document.getElementById('introVideo').dispatchEvent(new Event('ended')));
    await page.waitForSelector('#starterStatus');
    assert.equal(await page.locator('#starterText').innerText(),'17/31 downloaded');
    const position=await page.locator('#starterStatus').evaluate(node=>{const r=node.getBoundingClientRect();return{right:innerWidth-r.right,top:r.top};});
    assert.equal(position.right,20);assert.equal(position.top,72);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-starter-progress-top-right.png')});
    await page.waitForFunction(()=>document.getElementById('starterDetail').textContent.includes('1207609'));
    releaseFirst();
    await page.waitForFunction(()=>osuLibrary.maps.has('1207609'));
    assert.equal(await page.locator('#starterText').innerText(),'18/31 downloaded');
    assert.ok(await page.evaluate(()=>osuLibrary.maps.get('1207609').difficulties.some(diff=>diff.bid==='2514778')),'requested difficulty exists in the real archive');
    await page.locator('#starterDismiss').click();
    releaseNext();
    await page.waitForFunction(()=>document.getElementById('starterStatus').dataset.state==='paused');
    assert.ok(await page.locator('#starterRetry').isVisible());
    await page.locator('#logo').click({force:true});
    await page.getByRole('button',{name:'Play',exact:true}).first().click();
    await page.locator('.searchBox').fill('blinding lights');
    const added=page.locator('.mapSet[data-id="1207609"]');
    assert.ok(await added.isVisible(),'newly installed map appears in song selection');
    assert.match(await added.innerText(),/blinding lights/i);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-starter-new-map-selection.png')});
    assert.equal(requests.filter(id=>id==='1207609n').length,1);
    assert.ok(requests.every(id=>!osuStarterOldIds.includes(id.replace(/n$/,''))),'existing maps never re-download');
    await page.setViewportSize({width:390,height:844});
    const box=await page.locator('#starterStatus').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
    assert.deepEqual(errors,[]);
    console.log('PASS: existing 17-map library gets the real new map and requested difficulty; live 17→18/31 counter, visible song-selection entry, pause/resume button and mobile bounds.');
  }finally{releaseFirst();releaseNext();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
const osuStarterOldIds=['1011011','1627313','1859697','2385328','2047602','199535','936345','2184140','874602','576030','998953','1317896','50763','375201','444632','59345','1201974'];

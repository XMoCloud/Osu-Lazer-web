/* Optional network checks. Uses an isolated profile and real public providers. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.OSU_PLAYWRIGHT_PATH||'playwright');
const base=process.env.OSU_TEST_URL||'http://127.0.0.1:8765';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.OSU_CHROME,args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.waitForFunction(()=>window.osuLibrary);
    await page.evaluate(async()=>{
      await osuLibrary.ready;
      await osuMenuAudio.playPreview(osuBeatmaps.normalize({id:1627313,title:'Preview check',bpm:160}));
    });
    await page.waitForFunction(()=>osuMenuAudio.playing&&osuMenuAudio.clock>.2);
    assert.ok(await page.evaluate(()=>{const bins=new Float32Array(osuMenuAudio.analyser.frequencyBinCount);osuMenuAudio.analyser.getFloatFrequencyData(bins);return bins.some(value=>value>-90);}),'live CORS preview reaches the audio analyser');
    await page.evaluate(()=>osuMenuAudio.stopPreview(false));
    // Make only the CORS proxy fail; the official clip must play without CORS.
    await page.route('**/v3/osu/music/preview/1011011',route=>route.fulfill({status:503,body:''}));
    let officialRequests=0;page.on('request',request=>{if(request.url().includes('b.ppy.sh/preview/1011011'))officialRequests++;});
    await page.evaluate(()=>osuMenuAudio.playPreview(osuBeatmaps.normalize({id:1011011,title:'Fallback preview check'})));
    await page.waitForFunction(()=>osuMenuAudio.current?.id==='1011011'&&osuMenuAudio.playing&&osuMenuAudio.clock>.2);
    assert.ok(officialRequests>0,'official clip plays as a native media fallback');
    await page.evaluate(()=>osuMenuAudio.stopPreview(false));
    const result=await page.evaluate(async()=>{
      const start=performance.now(),map=await osuDownloads.install('1627313',{includeVideo:false,metadata:{id:1627313,status:'ranked',beatmaps:[]}});
      const archive=new zip.fs.FS();await new Promise((resolve,reject)=>archive.root.importBlob(map.oszBlob,resolve,reject));
      const files=dir=>dir.children.flatMap(entry=>entry.directory?files(entry):[entry.name]);
      return {seconds:(performance.now()-start)/1000,bytes:map.oszBlob.size,music:map.audioBlob.size,cover:map.coverBlob.size,videos:files(archive.root).filter(name=>/\.(?:mp4|avi|wmv|mkv|webm|mov|flv|mpeg)$/i.test(name))};
    });
    assert.deepEqual(result.videos,[]);assert.ok(result.music>0&&result.cover>0);
    console.log('Live no-video download/import',result);
    // Prepopulate the other starter IDs only in this disposable test profile,
    // so checking a script-opened tab does not trigger ten extra downloads.
    await page.evaluate(async()=>{const map=await osuMapStore.getMap('1627313');for(const[id]of osuStarterMaps.maps)if(id!==map.id)await osuMapStore.saveMap({...map,id});});
    const popupPromise=page.waitForEvent('popup');await page.evaluate(url=>window.open(url,'_blank'),base);const popup=await popupPromise;
    await popup.waitForFunction(()=>window.osuLibrary);
    await popup.locator('#startOverlay').click();await popup.evaluate(()=>document.getElementById('introVideo').dispatchEvent(new Event('ended')));
    await popup.locator('#logo').click({force:true});await popup.waitForTimeout(700);
    await popup.locator('.menuBtn.exit').click();
    const closed=popup.waitForEvent('close');await popup.evaluate(()=>{const clip=document.getElementById('outroVideo');clip.pause();clip.dispatchEvent(new Event('ended'));});await closed;
    assert.deepEqual(errors,[]);
    console.log('PASS: live CORS preview, official native fallback, no-video download/import, and closing a script-opened tab after the outro.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

/* Development-only: no test library is loaded by the game. Uses an isolated profile. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require(process.env.OSU_PLAYWRIGHT_PATH||'playwright');
const base=process.env.OSU_TEST_URL||'http://127.0.0.1:8765';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.OSU_CHROME,args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>{errors.push(error.stack);console.error('Browser:',error.message);});
    await page.route('**/__fixture-cover/*',route=>{
      const file=path.join(os.tmpdir(),'osu-design-cover-'+route.request().url().split('/').pop()+'.jpg');
      return fs.existsSync(file)?route.fulfill({body:fs.readFileSync(file),contentType:'image/jpeg'}):route.fulfill({body:fs.readFileSync(path.join(process.cwd(),'assets/background.png')),contentType:'image/png'});
    });
    await page.goto(base);
    await page.evaluate(async()=>{
      await osuLibrary.ready;
      const audioBlob=await (await fetch('hitsounds/Trinagles.mp3')).blob();
      const ids=osuStarterMaps.maps.map(([id])=>id);
      const titles=['SAVE (Encore)',"Virtual Paradise","Kimi no Kokoro wa Kagayaiteru kai?","Have Faith in Me","Replica feat. mami","Vanity Clock","Team Magma - Adventure!","System Zero","new beginnings","AIR","Monochrome Butterfly"];
      const artists=['DM DOKURO','AK X LYNX ft. Veela','Aqours','A Day to Remember','UKRampage','love solfege','Unofficial','-45','nekodex','my sound life','Aitsuki Nakuru'];
      const names=['Normal',"Fatfan's Hard","browiec & Kuki's Insane","Fatfan's Expert","Reform's Extra","Extreme","Fatfan & browiec's Determination"];
      for(let i=0;i<ids.length;i++){
        const coverBlob=await (await fetch('/__fixture-cover/'+ids[i])).blob();
        document.dispatchEvent(new CustomEvent('osu:map-installed',{detail:{id:ids[i],title:titles[i%titles.length],artist:artists[i%artists.length],creator:'browiec',status:i===5?'loved':'ranked',audioBlob,coverBlob,
          timingPoints:[{offset:15,beatLength:375}],effectPoints:[],previewTime:32000,
          difficulties:(i===0?[2.34,3.37,4.11,4.69,5.01,5.62,6.16]:[2.1,3.3,4.9]).map((stars,j)=>({bid:1000+i*10+j,name:names[j],creator:'browiec',stars,od:8,ar:9,cs:4,hp:5}))}}));
      }
    });
    assert.equal(await page.locator('#skipIntro').count(),0);
    assert.equal(await page.locator('#main').evaluate(node=>getComputedStyle(node).userSelect),'none');
    assert.equal(await page.locator('.searchBox').evaluate(node=>getComputedStyle(node).userSelect),'text');
    await page.locator('#startOverlay').click();
    await page.evaluate(()=>document.getElementById('introVideo').dispatchEvent(new Event('ended')));
    await page.waitForSelector('#main.active');
    await page.mouse.move(1700,850);
    await page.evaluate(async()=>{
      const blob=await (await fetch('hitsounds/Trinagles.mp3')).blob();
      await osuMenuAudio.playTrack({...osuMenuAudio.defaultTrack,src:URL.createObjectURL(blob),previewTime:32},{seek:true});
    });
    await page.waitForTimeout(1500);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-refined-logo.png')});
    const metrics=await page.evaluate(()=>{
      const a=osuMenuAudio.analyser,bins=new Float32Array(a.frequencyBinCount);a.getFloatFrequencyData(bins);
      const segments=document.getElementById('spectrum-bars').getAttribute('d').split('M').slice(1).map(s=>{const p=s.split('L').map(v=>v.split(',').map(Number));return Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]);});
      return {clock:osuMenuAudio.clock,peak:osuVisualizer.peak,fft:a.fftSize,maxBin:Math.max(...bins),rays:segments.length,maxRay:Math.max(...segments),meanRay:segments.reduce((a,b)=>a+b,0)/segments.length};
    });
    console.log('Spectrum sample',metrics);assert.equal(metrics.fft,512);
    await page.evaluate(()=>{window.visualizerCosts=[];const original=osuVisualizer.update;osuVisualizer.update=function(...args){const start=performance.now();const value=original.apply(this,args);visualizerCosts.push(performance.now()-start);return value;};});
    const before=await page.evaluate(()=>getComputedStyle(document.getElementById('menuBackground')).filter);
    await page.mouse.wheel(0,-120);
    await page.waitForSelector('#volumeOverlay.visible');
    assert.equal(await page.evaluate(()=>osuVolume.value),.18);
    assert.ok(await page.locator('#volumeArc').evaluate(n=>parseFloat(getComputedStyle(n).strokeDasharray)<31),'volume arc follows the value');
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-refined-volume.png')});
    await page.locator('#volumeMute').click();assert.equal(await page.evaluate(()=>osuVolume.value),0);
    await page.locator('#volumeMute').click();assert.equal(await page.evaluate(()=>osuVolume.value),.18);
    await page.locator('#volumeMeter').focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>osuVolume.value),1);
    await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>osuVolume.value),0);
    await page.keyboard.press('PageUp');assert.equal(await page.evaluate(()=>osuVolume.value),.1);
    await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>osuVolume.value),.11);
    await page.locator('#logo').click({force:true});await page.mouse.move(1700,850);await page.waitForTimeout(1000);
    assert.equal(await page.locator('#logo').evaluate(n=>getComputedStyle(n).outlineStyle),'none','pointer clicks do not draw square focus rings');
    const sizes=await page.evaluate(()=>({row:document.getElementById('menuStrip').offsetHeight,button:document.querySelector('.menuBtn.browse').offsetWidth,tutorial:document.getElementById('tutorialTile').offsetHeight}));
    assert.equal(sizes.row,134);assert.equal(sizes.button,187);assert.equal(sizes.tutorial,64);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-refined-menu.png')});
    await page.locator('#musicToggle').click();await page.waitForTimeout(300);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-refined-player.png')});
    await page.getByRole('button',{name:'Pause music',exact:true}).click();await page.waitForTimeout(120);assert.ok(await page.evaluate(()=>osuMenuAudio.audio.paused));
    await page.getByRole('button',{name:'Play music',exact:true}).click();assert.ok(await page.evaluate(()=>!osuMenuAudio.audio.paused));
    await page.locator('#ctrlShuffle').click();assert.ok(await page.evaluate(()=>osuMenuAudio.shuffle));
    await page.locator('#musicSeek').evaluate(n=>{n.value=500;n.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>osuMenuAudio.audio.currentTime/osuMenuAudio.audio.duration>.49));
    const previousSource=await page.evaluate(()=>osuMenuAudio.current.src);
    await page.locator('#ctrlNext').click();await page.waitForFunction(src=>osuMenuAudio.current.src!==src,previousSource);
    assert.equal(await page.locator('#songTitle').textContent(),await page.evaluate(()=>osuMenuAudio.current.title));
    await page.keyboard.press('Escape');assert.ok(await page.locator('#musicPopover').evaluate(n=>n.hidden));assert.ok(await page.locator('#menuStrip').evaluate(n=>n.classList.contains('open')));
    assert.notEqual(await page.evaluate(()=>getComputedStyle(document.getElementById('menuBackground')).filter),before,'background hue advances');
    await page.getByRole('button',{name:'Play',exact:true}).first().click();
    await page.evaluate(()=>osuLibrary.selectSet('1011011',1006,{center:true}));await page.mouse.move(700,800);await page.waitForTimeout(1300);
    const rows=await page.evaluate(()=>{
      const selected=document.querySelector('.mapSet.selected'),boxes=[...selected.querySelectorAll('.difficultyBox')];
      return {height:boxes[0].offsetHeight,extension:boxes[0].getBoundingClientRect().left-boxes.at(-1).getBoundingClientRect().left,gap:parseFloat(getComputedStyle(selected.nextElementSibling).marginTop),font:getComputedStyle(document.querySelector('.infoTitle')).fontFamily};
    });
    assert.equal(rows.height,59);assert.ok(rows.extension>=90);assert.ok(rows.gap<=0);assert.ok(!/Torus|DEMO/i.test(rows.font));
    await page.screenshot({path:path.join(os.tmpdir(),'osu-refined-selection.png')});
    await page.locator('#musicToggle').click();
    const previousMap=await page.evaluate(()=>osuMenuAudio.current?.mapId);
    await page.locator('#ctrlNext').click();
    await page.waitForFunction(previous=>osuMenuAudio.current?.mapId!==previous&&osuMenuAudio.current?.mapId===document.querySelector('.mapSet.selected')?.dataset.id,previousMap);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      const map=osuLibrary.maps.get('1011011'),base=map.difficulties[0];
      map.difficulties=Array.from({length:40},(_,i)=>({...base,bid:2000+i,name:'Difficulty '+(i+1)}));
      document.dispatchEvent(new CustomEvent('osu:map-installed',{detail:map}));osuLibrary.selectSet('1011011',2000,{center:true,silent:true});
    });
    await page.waitForTimeout(700);
    for(let i=0;i<30;i++)await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    let visible=await page.evaluate(()=>{const box=document.querySelector('.mapSet.selected .extended').getBoundingClientRect(),list=document.querySelector('.beatmapListContainer').getBoundingClientRect();return box.top>=list.top&&box.bottom<=list.bottom;});
    assert.ok(visible,'keyboard selection scrolls lower difficulties into view');
    for(let i=0;i<30;i++)await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(700);
    visible=await page.evaluate(()=>{const box=document.querySelector('.mapSet.selected .extended').getBoundingClientRect(),list=document.querySelector('.beatmapListContainer').getBoundingClientRect();return box.top>=list.top&&box.bottom<=list.bottom;});
    assert.ok(visible,'keyboard selection scrolls upper difficulties into view');
    await page.mouse.wheel(0,120);assert.equal(await page.evaluate(()=>osuVolume.value),.11,'song list scrolling does not change master volume');
    const costs=await page.evaluate(()=>visualizerCosts.sort((a,b)=>a-b));
    console.log('Visualizer update milliseconds',{mean:costs.reduce((a,b)=>a+b,0)/costs.length,p95:costs[Math.floor(costs.length*.95)]});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#musicToggle').click();await page.waitForTimeout(250);
    assert.ok(await page.locator('#musicPopover').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
    await page.screenshot({path:path.join(os.tmpdir(),'osu-refined-mobile.png')});
    await page.reload();assert.equal(await page.evaluate(()=>osuVolume.value),.11,'master volume survives navigation');
    assert.deepEqual(errors,[]);
    // This tab intentionally refuses close so the fallback is deterministic.
    await page.evaluate(()=>{window.closeAttempts=0;window.close=()=>closeAttempts++;});
    await page.locator('#startOverlay').click();await page.evaluate(()=>document.getElementById('introVideo').dispatchEvent(new Event('ended')));
    await page.locator('#logo').click({force:true});await page.waitForTimeout(700);
    await page.locator('.menuBtn.exit').click();
    await page.evaluate(()=>{const clip=document.getElementById('outroVideo');clip.pause();clip.dispatchEvent(new Event('ended'));});
    await page.waitForFunction(()=>closeAttempts===1&&document.getElementById('outro').hidden);
    assert.match(await page.locator('#notificationHistory').innerText(),/prevented this tab from closing/);
    assert.deepEqual(errors,[]);
    console.log('PASS: volume controls/persistence, music transport, auto-scroll, hue/menu geometry, and blocked tab-close fallback after the outro.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

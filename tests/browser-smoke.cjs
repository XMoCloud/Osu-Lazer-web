/* Development-only browser checks; Playwright is never loaded by the game.
 * OSU_PLAYWRIGHT_PATH points to an external Playwright installation.
 * OSU_TEST_MAP points to the full 1011011 tutorial archive (not committed).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.OSU_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.OSU_TEST_URL || 'http://127.0.0.1:8765';
const archive = fs.readFileSync(process.env.OSU_TEST_MAP || path.join(os.tmpdir(),'osu-showroom-tutorial.osz'));
const set = id => ({ id: Number(id), title: id === '42' ? 'Browser download fixture' : 'new beginnings', artist: 'nekodex', creator: 'pishifat', bpm: 130, status: 'ranked',
  preview_url: base + '/hitsounds/Trinagles.mp3', covers: {card: base + '/assets/background.png'}, beatmaps: [{id:2116202,mode:'osu',version:'tutorial',difficulty_rating:1.167}] });

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.OSU_CHROME ? {executablePath:process.env.OSU_CHROME} : {}),
    args:['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080}});
    const page = await context.newPage();
    const errors = [], downloads = new Map(), variants = new Map();
    page.on('pageerror', error => {errors.push(error.stack);console.error('Browser:',error.message);});
    await page.route('**/api/v2/s/*',route=>route.fulfill({json:set(route.request().url().split('/').pop())}));
    await page.route('**/api/v2/search?*',route=>route.fulfill({json:[set('42'),set('1011011')]}));
    await page.route('**/api/v1/hinai/d/*',route=>{
      const variant=route.request().url().split('/').pop(),id=variant.replace(/n$/,''); downloads.set(id,(downloads.get(id)||0)+1);variants.set(id,variant);
      return route.fulfill({body:archive,contentType:'application/octet-stream'});
    });
    await page.route('**/v3/osu/music/preview/*',route=>route.fulfill({body:fs.readFileSync(path.join(process.cwd(),'hitsounds/Trinagles.mp3')),contentType:'audio/mpeg'}));
    await page.goto(base);
    assert.equal(await page.evaluate(()=>osuVolume.value),.15,'music defaults to 15 percent');
    assert.equal(await page.locator('#skipIntro').count(),0);
    await page.locator('#startOverlay').click();
    await page.evaluate(()=>document.getElementById('introVideo').dispatchEvent(new Event('ended')));
    await page.waitForSelector('#main.active');
    await page.waitForFunction(()=>window.osuLibrary.maps.size===osuStarterMaps.maps.length,null,{timeout:45000}).catch(async error=>{console.error(await page.evaluate(()=>({maps:window.osuLibrary?.maps.size,notifications:document.getElementById('notificationHistory')?.innerText,starter:document.getElementById('starterText')?.textContent})));throw error;});
    assert.equal(downloads.size,await page.evaluate(()=>osuStarterMaps.maps.length),'all configured starter sets install');
    assert.equal(downloads.has('2443120'),false,'removed mapset is not automatically downloaded');
    assert.ok([...downloads.values()].every(count=>count===1),'starter installs deduplicate');
    assert.equal(variants.get('1011011'),'1011011','tutorial keeps the full archive');
    assert.ok([...variants].every(([id,variant])=>id==='1011011'||variant===id+'n'),'other starters omit video during transfer');
    assert.equal(await page.evaluate(()=>window.osuLibrary.maps.get('1011011').difficulties[0].od),0);
    await page.waitForFunction(()=>document.querySelector('#spectrum-bars').getAttribute('d')?.length>100);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-final-menu.png')});
    await page.locator('#logo').click({force:true});
    await page.getByRole('button',{name:'Browse',exact:true}).first().click();
    await page.waitForSelector('.onlineMapCard');
    assert.equal(await page.locator('.onlineMapCard').count(),2);
    await page.locator('.cardPreview').first().click();
    await page.waitForFunction(()=>document.querySelector('.cardPreview').getAttribute('aria-pressed')==='true');
    await page.locator('#browseSearch').fill('nekodex');
    await page.waitForTimeout(450);
    await page.locator('.cardDownload').first().click();
    await page.waitForFunction(()=>window.osuLibrary.maps.has('42'));
    assert.equal(downloads.get('42'),1);
    assert.match(await page.locator('.cardDownload').first().innerText(),/Installed/);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-final-browse.png')});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.getByRole('button',{name:'Play',exact:true}).first().click();
    await page.waitForSelector('.mapSet.selected');
    await page.locator('.searchBox').fill('no match here');
    assert.equal(await page.locator('.mapSet:visible').count(),0);
    await page.locator('.searchBox').fill('');
    await page.locator('.searchBox').blur();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-final-selection.png')});
    await page.locator('.backButton').click();
    await page.waitForTimeout(400);
    await page.locator('#logo').click({force:true});
    await page.waitForTimeout(400);
    await page.evaluate(()=>osuVolume.set(.41));
    await page.locator('#tutorialTile').click();
    await page.waitForFunction(()=>window.osuApp.phase==='playing');
    await page.waitForFunction(()=>window.playback?.started,null,{timeout:30000});
    assert.equal(await page.evaluate(()=>game.musicVolume),.41,'gameplay uses the saved music volume');
    assert.ok(await page.evaluate(()=>Math.abs(playback.osu.audio.gain.gain.value-.41)<.00001));
    const separatedAudio=await page.evaluate(()=>{
      osuVolume.set(0);
      const hit=playback.hits.find(hit=>hit.type==='circle');
      playback.playHitsound(hit,0,hit.time);
      const timing=playback.track.timingPoints[playback.curtimingid],sampleSet=hit.hitSample.normalSet||timing.sampleSet||game.sampleSet;
      const hitVolume=game.sample[sampleSet].hitnormal.volume;
      const expectedHitVolume=.3*(hit.hitSample.volume||timing.volume)/100;
      const slider=playback.hits.find(hit=>hit.type==='slider');playback.playTicksound(slider,slider.time);
      const tickTiming=playback.track.timingPoints[playback.curtimingid];
      const tickVolume=game.sample[tickTiming.sampleSet||game.sampleSet].slidertick.volume;
      const expectedTickVolume=.3*(slider.hitSample.volume||tickTiming.volume)/100;
      playback.scoreOverlay.combo=21;playback.scoreOverlay.hit(0,300,hit.time);
      const comboVolume=game.sampleComboBreak.volume;
      const mutedMusic=playback.osu.audio.gain.gain.value;
      osuVolume.set(.41);
      return{mutedMusic,hitVolume,expectedHitVolume,tickVolume,expectedTickVolume,comboVolume,ui:[...document.querySelectorAll('audio[id^="sfx"],#introVideo,#outroVideo')].map(sound=>sound.volume)};
    });
    assert.equal(separatedAudio.mutedMusic,0,'volume changes reach the active gameplay music');
    assert.ok(separatedAudio.hitVolume>0,'hit sounds remain audible with music muted');
    assert.ok(Math.abs(separatedAudio.hitVolume-separatedAudio.expectedHitVolume)<.00001,'hit sounds use 30% of their authored level');
    assert.ok(Math.abs(separatedAudio.tickVolume-separatedAudio.expectedTickVolume)<.00001,'slider ticks use 30% of their authored level');
    assert.equal(separatedAudio.comboVolume,.5,'combo-break effect uses the independent 50% level');
    assert.ok(separatedAudio.ui.length>0&&separatedAudio.ui.every(volume=>volume===.5),'UI effects and intro/outro cues use the independent 50% level');
    const tutorial=await page.evaluate(()=>({hp:playback.HP,od:playback.OD,end:playback.endTime,sprites:playback.storyboard.sprites.length,height:document.getElementById('game-area').getBoundingClientRect().height}));
    assert.equal(tutorial.hp,0); assert.equal(tutorial.od,0); assert.equal(tutorial.end,133818); assert.ok(tutorial.sprites>100); assert.equal(tutorial.height,1080);
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>game.paused),true);
    const score=await page.evaluate(()=>playback.scoreOverlay.score);
    await page.keyboard.press('z'); await page.keyboard.press('x');
    assert.equal(await page.evaluate(()=>playback.scoreOverlay.score),score);
    await page.locator('#pausebtn-retry').click();
    await page.waitForFunction(()=>playback.started&&!game.paused);
    assert.equal(await page.evaluate(()=>playback.scoreOverlay.score),0);
    assert.ok(await page.evaluate(()=>playback.storyboard.sprites.length>100),'retry reloads the tutorial storyboard');
    await page.waitForTimeout(7500);
    await page.screenshot({path:path.join(os.tmpdir(),'osu-final-tutorial.png')});
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{window.beatsAfterReturn=0;document.addEventListener('osu:beat',()=>beatsAfterReturn++);});
    await page.locator('#pausebtn-quit').click();
    await page.waitForFunction(()=>window.osuApp.phase==='menu');
    assert.equal(new URL(page.url()).pathname,new URL(base+'/').pathname.replace(/\/{2,}/g,'/'),'gameplay returns without document navigation');
    await page.waitForSelector('.mapSet.selected');
    assert.equal(await page.evaluate(()=>document.getElementById('intro').hidden&&document.getElementById('introVideo').paused),true);
    await page.waitForTimeout(400);
    await page.waitForFunction(()=>beatsAfterReturn>0);
    assert.equal(await page.evaluate(()=>osuMenuAudio.current.mapId),'1011011');
    assert.equal(downloads.get('1011011'),1,'returning does not download an installed starter again');
    // Launch from selection as well: its completed exit animations must be
    // removed before the menu and cookie are drawn again.
    await page.evaluate(()=>osuLibrary.selectSet('42','2116202',{center:true}));await page.waitForTimeout(900);
    await page.locator('.mapSet.selected .difficultyBox.extended').click();
    await page.waitForFunction(()=>osuApp.phase==='playing'&&playback.started);
    await page.keyboard.press('Escape');await page.locator('#pausebtn-quit').click();
    await page.waitForFunction(()=>osuApp.phase==='menu');await page.waitForTimeout(1000);
    const visible=await page.evaluate(()=>['logoVisual','beatmapInfoBox'].every(id=>getComputedStyle(document.getElementById(id)).opacity==='1')&&getComputedStyle(document.querySelector('.beatmapListContainer')).opacity==='1');
    assert.ok(visible,'menu panels and logo recover their opacity after a selection-launched map');
    await page.evaluate(()=>osuLibrary.selectSet('1011011','2116202',{center:true}));
    await page.waitForTimeout(900);
    await page.locator('.mapSet:not(.selected) > .beatmapItem').first().click();
    assert.notEqual(await page.locator('.mapSet.selected').getAttribute('data-id'),'1011011','another map remains selectable after quit');
    await page.locator('.backButton').click();await page.waitForTimeout(1000);
    assert.equal(await page.locator('#logoVisual').evaluate(node=>getComputedStyle(node).opacity),'1','main-menu logo remains visible after quit');
    await page.getByRole('button',{name:'Play',exact:true}).first().click();await page.waitForTimeout(900);
    assert.deepEqual(errors,[],'no uncaught browser errors');
    await page.setViewportSize({width:390,height:844});
    await page.locator('#localBrowse').click();
    await page.waitForTimeout(450);
    assert.ok(await page.locator('.browsePanel').evaluate(node=>node.getBoundingClientRect().right<=innerWidth));
    await page.screenshot({path:path.join(os.tmpdir(),'osu-final-mobile.png')});
    console.log('PASS: starter video modes, deduplication, search, preview, download, selection, tutorial, pause/retry, repeated quit with visible panels/logo, intro bypass and mobile overlay.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

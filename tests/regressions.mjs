import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = { currentFrameInterval: 16 };
globalThis.AudioContext = class { state = 'running'; };
const { default: setPlayerActions } = await import('../scripts/Engine/playerActions.js');
const { default: Osu } = await import('../scripts/Engine/osu.js');

function inputFixture(overrides = {}) {
  const listeners = new Map();
  const win = {
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type,new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); }
  };
  const hits = [];
  const game = { window: win, mouseX: 256, mouseY: 192, K1keycode: 90, K2keycode: 88, allowMouseButton: false, paused: false };
  const pb = { game, audioReady: true, started: true, osu: { audio: { getPosition: () => 1 } },
    upcomingHits: [{ x:256, y:192, time:1000, type:'spinner', score:-1 }, { x:256, y:192, time:1000, type:'circle', score:-1 }],
    circleRadius:30, GreatTime:50, GoodTime:100, MehTime:150,
    hitSuccess: (...args) => hits.push(args), pause() { game.paused = true; }, resume() { game.paused = false; }, ...overrides };
  setPlayerActions(pb);
  const key = code => { for (const callback of listeners.get('keydown') || []) callback({keyCode:code,preventDefault(){},stopPropagation(){}}); };
  return { pb, game, key, hits, listeners };
}
test('paused, failed, ended and not-yet-started sessions cannot award hits', () => {
  for (const state of ['paused','failed','ended','loading','unstarted']) {
    const fixture = inputFixture();
    if (state === 'paused') fixture.game.paused = true;
    if (state === 'failed') fixture.pb.failed = true;
    if (state === 'ended') fixture.pb.ended = true;
    if (state === 'loading') fixture.pb.audioReady = false;
    if (state === 'unstarted') fixture.pb.started = false;
    fixture.key(90);
    assert.equal(fixture.hits.length,0,state);
  }
});
test('a spinner cannot swallow an overlapping circle click', () => {
  const fixture = inputFixture(); fixture.key(90);
  assert.equal(fixture.hits.length,1); assert.equal(fixture.hits[0][0].type,'circle'); assert.equal(fixture.hits[0][1],300);
});
test('input handlers detach completely and key state resets on retry', () => {
  const fixture = inputFixture(); fixture.key(90); fixture.game.cleanupPlayerActions();
  assert.equal([...fixture.listeners.values()].reduce((sum,set)=>sum+set.size,0),0);
  setPlayerActions(fixture.pb); assert.equal(fixture.game.K1down,false); assert.equal(fixture.game.down,false);
});
function mapText({ mode = 0, difficulty = '', objects = '256,192,1000,1,0,0:0:0:0:' } = {}) {
  return `osu file format v14\n[General]\nAudioFilename: audio.mp3\nMode: ${mode}\n[Metadata]\nTitle: Fixture\nVersion: Test\nBeatmapID: 1\n[Difficulty]\nOverallDifficulty: 0\nHPDrainRate: 0\nApproachRate: 0\nCircleSize: 0\n${difficulty}\n[TimingPoints]\n0,500,4,1,0,100,1,0\n[HitObjects]\n${objects}\n`;
}
function parse(texts) {
  const zip = {children:texts.map((text,index)=>({name:`${index}.osu`,getText:callback=>callback(text)}))};
  const osu = new Osu(zip); let decoded = 0, error;
  osu.ondecoded = () => decoded++; osu.onerror = value => { error = value; }; osu.load();
  return { osu, decoded, error };
}
test('zero difficulty values survive parsing', () => {
  const {osu,decoded,error} = parse([mapText()]); assert.equal(error,undefined); assert.equal(decoded,1);
  const diff=osu.tracks[0].difficulty;
  for (const key of ['OverallDifficulty','HPDrainRate','ApproachRate','CircleSize']) assert.equal(diff[key],0,key);
});
test('mixed archives exclude non-standard difficulties without hanging decode', () => {
  const {osu,decoded} = parse([mapText(),mapText({mode:3})]); assert.equal(decoded,1); assert.equal(osu.tracks.length,1);
});
test('empty difficulties return a useful parser error', () => {
  const {error} = parse([mapText({objects:''})]); assert.match(error,/no playable objects/i);
});
test('ZIP reader reports truncated archives rather than hanging', async () => {
  const context = {window:{},Blob,Response,DecompressionStream,DataView,Uint8Array,TextDecoder,console};
  vm.runInNewContext(fs.readFileSync(new URL('../scripts/loaders/minizip.js',import.meta.url),'utf8'),context);
  const zip = new context.window.zip.fs.FS();
  await assert.rejects(new Promise((resolve,reject)=>zip.root.importBlob(new Blob(['not a zip']),resolve,reject)),/EOCD/);
});

function serviceFixture(fetchImpl) {
  const stored = new Map(), events = [];
  const context = {
    window: { osuMapStore: { getMap: async id => stored.get(id) }, osuImportOsz: async (file,{metadata}) => {
      const map = { id:String(metadata.id), oszBlob:file }; stored.set(map.id,map); return map;
    } }, document: { dispatchEvent(event) { events.push(event.detail); } },
    fetch:fetchImpl, AbortController, DOMException, CustomEvent, File, Response, Uint8Array, URL, URLSearchParams, setTimeout, clearTimeout, console
  };
  vm.runInNewContext(fs.readFileSync(new URL('../scripts/loaders/beatmapService.js',import.meta.url),'utf8'),context);
  return {service:context.window.osuDownloads,beatmaps:context.window.osuBeatmaps,stored,events};
}
const archiveResponse = () => new Response(new Uint8Array([80,75,3,4,...Array(18).fill(0)]),{headers:{'content-length':'22'}});
test('concurrent requests for the same map share one download and save', async () => {
  let requests=0;
  const {service,stored}=serviceFixture(async()=>{requests++;return archiveResponse();});
  const first=service.install('1',{metadata:{id:1}}),second=service.install('1',{metadata:{id:1}});
  assert.equal(first,second); await first; assert.equal(requests,1); assert.equal(stored.size,1);
  await service.install('1',{metadata:{id:1}}); assert.equal(requests,1,'installed maps do not download again');
});
test('cancelling a queued map prevents download and installation', async () => {
  let release,requests=0;
  const {service,stored}=serviceFixture(async()=>{requests++;return new Promise(resolve=>{release=()=>resolve(archiveResponse());});});
  const first=service.install('1',{metadata:{id:1}});
  const second=service.install('2',{metadata:{id:2}});
  const cancelled=assert.rejects(second,error=>error.name==='AbortError');
  service.cancel('2');
  await new Promise(resolve=>setImmediate(resolve)); release();
  await first; await cancelled;
  assert.equal(requests,1); assert.equal(stored.has('2'),false);
});
test('provider errors leave downloads retryable', async () => {
  let available=false;
  const {service}=serviceFixture(async()=>available?archiveResponse():new Response('',{status:503}));
  await assert.rejects(service.install('3',{metadata:{id:3}}),/503/);
  assert.equal(service.isActive('3'),false);
  available=true;
  assert.equal((await service.install('3',{metadata:{id:3}})).id,'3');
});

test('no-video downloads retain their mode when a provider fails',async()=>{
  const urls=[];
  const {service}=serviceFixture(async url=>{urls.push(url);return urls.length===1?new Response('',{status:503}):archiveResponse();});
  await service.install('1627313',{metadata:{id:1627313},includeVideo:false});
  assert.deepEqual(urls,['https://mirror.hinamizawa.ai/api/v1/hinai/d/1627313n','https://dl.sayobot.cn/beatmaps/download/novideo/1627313']);
});

test('tutorial/full downloads and CORS-enabled preview URLs retain the set ID',async()=>{
  const urls=[];
  const {service,beatmaps}=serviceFixture(async url=>{urls.push(url);return archiveResponse();});
  await service.install('1011011',{metadata:{id:1011011},includeVideo:true});
  assert.equal(urls[0],'https://mirror.hinamizawa.ai/api/v1/hinai/d/1011011');
  const set=beatmaps.normalize({id:1011011,preview_url:'//b.ppy.sh/preview/1011011.mp3'});
  assert.equal(set.preview_url,'https://mirror.hinamizawa.ai/v3/osu/music/preview/1011011');
  assert.equal(set.preview_fallback,'https://b.ppy.sh/preview/1011011.mp3');
});

test('logo beat phase stays aligned to the audio clock and tempo changes', () => {
  const node=()=>({setAttribute(){},append(){}});
  const context={window:{},document:{getElementById:node,createElementNS:node,addEventListener(){}},matchMedia:()=>({matches:false}),Float32Array};
  vm.runInNewContext(fs.readFileSync(new URL('../scripts/UI/visualizer.js',import.meta.url),'utf8'),context);
  const beatAt=context.window.osuVisualizer.beatAt;
  const points=[{offset:15,beatLength:375},{offset:750015,beatLength:500}];
  for(const index of [0,1,100,1999]){
    const time=15+index*375;
    assert.equal(beatAt(points,time).strength,1);
    assert.equal(beatAt(points,time).time,time);
    assert.ok(beatAt(points,time+100).strength<1);
    assert.ok(beatAt(points,time-30).strength<beatAt(points,time-60).strength,'recovery continues until the next beat, without an early pulse');
  }
  assert.equal(beatAt(points,751015).time,751015);
  assert.equal(beatAt(points,751015).length,500);
  assert.equal(beatAt([],1000),null);
});

test('saved input preferences are validated and applied to gameplay',()=>{
  const stored=new Map();
  const context={window:{dispatchEvent(){}},localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},CustomEvent:class{}};
  vm.runInNewContext(fs.readFileSync(new URL('../scripts/UI/settings.js',import.meta.url),'utf8'),context);
  const settings=context.window.osuSettings;
  settings.update({key1:'KeyA',key1KeyCode:65,disableMouseButtons:true,cursorSize:50,cursorSensitivity:.01});
  const game={};settings.applyToGame(game);
  assert.equal(game.K1code,'KeyA');assert.equal(game.K1keycode,65);assert.equal(game.allowMouseButton,false);assert.equal(game.cursorSize,2);assert.equal(game.cursorSensitivity,.4);
  const saved=JSON.parse(stored.get('osu:settings'));assert.equal(saved.key1,'KeyA');
  settings.update({key2:'KeyA',key2KeyCode:65});assert.notEqual(settings.value.key1,settings.value.key2);
});

test('custom physical hit keys work and disabled mouse buttons have no click handler',()=>{
  const fixture=inputFixture();fixture.game.K1code='KeyA';fixture.game.K2code='KeyS';
  fixture.key(90);assert.equal(fixture.hits.length,0);
  for(const handler of fixture.listeners.get('keydown'))handler({code:'KeyA',keyCode:65,preventDefault(){},stopPropagation(){}});
  assert.equal(fixture.hits.length,1);assert.equal(fixture.listeners.has('mousedown'),false);
});

test('captured mouse deltas apply sensitivity consistently to aim coordinates',()=>{
  const fixture=inputFixture();fixture.game.cursorSensitivity=2;
  const previousDocument=globalThis.document,previousGfx=globalThis.gfx;
  globalThis.document={pointerLockElement:{}};globalThis.gfx={width:512,height:384,xoffset:0,yoffset:0};
  try{
    for(const handler of fixture.listeners.get('mousemove'))handler({type:'mousemove',movementX:10,movementY:-15});
    assert.equal(fixture.game.mouseX,276);assert.equal(fixture.game.mouseY,162);
  }finally{globalThis.document=previousDocument;globalThis.gfx=previousGfx;}
});

function musicFixture(){
  class Events{
    listeners=new Map();
    addEventListener(type,handler,options={}){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add({handler,once:options.once});}
    removeEventListener(type,handler){for(const item of this.listeners.get(type)||[])if(item.handler===handler)this.listeners.get(type).delete(item);}
    fire(type,values={}){for(const item of [...this.listeners.get(type)||[]]){if(item.once)this.listeners.get(type).delete(item);item.handler({type,...values});}}
    dispatchEvent(event){this.fire(event.type,event);}
  }
  const media=[];
  class Media extends Events{
    constructor(){super();media.push(this);}
    paused=true;currentTime=0;duration=120;readyState=0;played=[];
    set src(value){this._src=value;this.currentTime=0;this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.fire('loadedmetadata');});}
    get src(){return this._src;}
    getAttribute(){return this._src;}
    async play(){await Promise.resolve();this.paused=false;this.played.push(this.src);this.fire('play');}
    pause(){this.paused=true;this.fire('pause');}
  }
  class Context{
    state='running';currentTime=0;closed=0;
    createGain(){return {gain:{value:1,cancelAndHoldAtTime(){},linearRampToValueAtTime(value){this.value=value;}},connect(){}};}
    createAnalyser(){return{connect(){}};}createMediaElementSource(){return{connect(){}};}
    async resume(){this.state='running';}close(){this.closed++;this.state='closed';}
  }
  const audio=new Media(),win=new Events(),doc=new Events(),changes=[];
  win.AudioContext=Context;win.osuVolume={value:.38};
  doc.getElementById=id=>id==='bgm'?audio:{classList:{toggle(){}},setAttribute(){}};
  doc.addEventListener('osu:track-changed',event=>changes.push(event.detail));
  const context={window:win,document:doc,Audio:Media,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},setTimeout:callback=>setTimeout(callback,0)};
  vm.runInNewContext(fs.readFileSync(new URL('../scripts/UI/menuAudio.js',import.meta.url),'utf8'),context);
  const music=win.osuMenuAudio;
  for(const id of ['a','b','c'])music.registerTrack(id,{src:id+'.mp3',title:id,previewTime:42,timingPoints:[{offset:0,beatLength:500}]});
  return {music,audio,preview:media[1],directPreview:media[2],win,doc,changes};
}
test('intro music never re-enters the library playlist and menu tracks start at zero',async()=>{
  const {music,audio}=musicFixture();await music.playTrack(music.defaultTrack,{seek:false});
  await music.next(1);assert.equal(music.current.mapId,'a');assert.equal(audio.currentTime,0);assert.equal(music.introRetired,true);
  await music.playTrack(music.defaultTrack,{seek:false});assert.equal(music.current.mapId,'a');
  await music.next(1);await music.next(1);await music.next(1);assert.equal(music.current.mapId,'a');assert.equal(audio.played.filter(src=>src.includes('Trinagles')).length,1);
});
test('selection controls announce the matching map and selection looping uses its preview',async()=>{
  const {music,audio,changes}=musicFixture();music.setMode('selection');await music.playMap('b');
  assert.equal(audio.currentTime,42);await music.next(1);assert.equal(music.current.mapId,'c');assert.equal(changes.at(-1).mapId,'c');
  await music.next(1,{automatic:true});assert.equal(music.current.mapId,'c');assert.equal(audio.currentTime,42);
  music.setMode('menu');await music.next(1,{automatic:true});assert.equal(music.current.mapId,'a');assert.equal(audio.currentTime,0);
});
test('rapid song changes only commit the newest request',async()=>{
  const {music,audio}=musicFixture();await music.playMap('a');
  const previous=music.playMap('b'),latest=music.playMap('c');await Promise.all([previous,latest]);
  assert.equal(music.current.mapId,'c');assert.equal(audio.played.includes('b.mp3'),false);
});
test('gameplay handoff cancels queued previews and page restoration keeps the audio graph',async()=>{
  const {music,audio,preview,win}=musicFixture();await music.playMap('a');
  const pending=music.playPreview({id:'online',preview_url:'online.mp3'});music.suspend();await pending;
  assert.equal(audio.paused,true);assert.equal(preview.paused,true);assert.equal(music.mode,'gameplay');
  audio.fire('ended');await new Promise(resolve=>setTimeout(resolve,5));assert.equal(music.current.mapId,'a');
  const graph=music.context;win.fire('pagehide',{persisted:true});win.fire('pageshow',{persisted:true});assert.equal(graph.closed,0);
  music.setMode('selection');await music.playMap('a');assert.equal(music.context,graph);assert.equal(audio.paused,false);
});

test('a failed CORS preview falls back to native playback and honors master volume',async()=>{
  const {music,audio,preview,directPreview,win}=musicFixture();await music.playMap('a');
  preview.play=async()=>{throw new Error('CORS preview unavailable');};
  await music.playPreview({id:'123',preview_url:'proxy.ogg',preview_fallback:'official.ogg'});
  assert.equal(directPreview.src,'official.ogg');assert.equal(directPreview.paused,false);assert.equal(audio.paused,true);assert.equal(music.playing,true);assert.equal(directPreview.volume,.38);
  win.fire('osu:volume-changed',{detail:{value:.2}});assert.equal(directPreview.volume,.2);
  music.suspend();assert.equal(directPreview.paused,true);assert.equal(music.playing,false);
});

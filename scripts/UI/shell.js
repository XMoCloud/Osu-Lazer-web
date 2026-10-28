/* Lazer-style settings, notification history and top-right toast tray. */
(() => {
  const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const gearPoints=[];
  for(let tooth=0;tooth<8;tooth++)for(const [angle,radius] of [[-16,8],[-10,10],[10,10],[16,8]]){
    const rad=(tooth*45+angle)*Math.PI/180;gearPoints.push(`${(12+Math.cos(rad)*radius).toFixed(2)},${(12+Math.sin(rad)*radius).toFixed(2)}`);
  }
  const icons={settings:svg(`<path d="M${gearPoints.join('L')}Z"/><circle cx="12" cy="12" r="3.4"/>`),bell:svg('<path d="M5 10a7 7 0 0 1 14 0c0 7 3 7 3 8H2c0-1 3-1 3-8m4 11h6"/>'),home:svg('<path d="m3 10 9-7 9 7M5 9v12h14V9"/>'),close:svg('<path d="m6 6 12 12M6 18 18 6"/>'),check:svg('<path d="m5 12 5 5L20 6"/>'),info:svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'),download:svg('<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'),keyboard:svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/>'),cursor:svg('<path d="m5 2 14 12-7 1-3 7z"/>'),shuffle:svg('<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>'),back:svg('<path d="m15 4-8 8 8 8"/>'),folder:svg('<path d="M3 6h7l2 3h9v12H3z"/>'),play:svg('<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>')};
  window.osuIcons=icons;
  const makeButton=(id,label,icon)=>`<button id="${id}" type="button" class="toolbarButton" aria-label="${label}">${icons[icon]}</button>`;
  let toolbar=document.getElementById('topBar');
  if(!toolbar){
    toolbar=document.createElement('header');toolbar.id='resultToolbar';toolbar.className='shellToolbar';
    toolbar.innerHTML=`<div class="left">${makeButton('toolbarSettings','Settings','settings')}${makeButton('resultHome','Return to song selection','home')}</div><div class="right"><span class="resultPlayer">osuPlayer1</span><img src="assets/pfp.png" alt=""/>${makeButton('notificationToggle','Notifications','bell')}</div>`;
    document.body.append(toolbar);
    document.getElementById('resultHome').onclick=()=>window.playback?.quit();
  }else{
    toolbar.querySelector('.left').insertAdjacentHTML('afterbegin',makeButton('toolbarSettings','Settings','settings'));
    toolbar.querySelector('.right').insertAdjacentHTML('beforeend',makeButton('notificationToggle','Notifications','bell'));
  }
  const menuSettings=document.getElementById('menuSettings');
  if(menuSettings)menuSettings.setAttribute('aria-label','Settings');
  if(menuSettings)menuSettings.innerHTML=`<span class="menuSettingsContent">${icons.settings}<span>settings</span></span>`;
  const shell=document.createElement('div');shell.id='shellOverlays';
  shell.innerHTML=`<div id="shellScrim" hidden></div>
    <section id="settingsPanel" class="sidePanel settingsPanel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle" hidden>
      <nav class="settingsNav" aria-label="Settings categories"><button type="button" data-section="inputSettings" class="active">${icons.keyboard}<span>Input</span></button><button type="button" data-section="cursorSettings">${icons.cursor}<span>Cursor</span></button></nav>
      <div class="settingsBody"><header class="settingsHeader"><button class="panelClose" type="button" aria-label="Close settings">${icons.close}</button><h1 id="settingsTitle">settings</h1><p>change the way osu! behaves</p><input id="settingsSearch" type="search" placeholder="type to search" aria-label="Search settings"/></header>
      <div class="settingsScroll"><section id="inputSettings" class="settingsSection"><h2>Input</h2><h3>Keyboard</h3><div class="settingRow" data-search="keyboard key binding input"><span>Primary hit key</span><button class="keyBinding" id="bindKey1" type="button" data-binding="1"></button></div><div class="settingRow" data-search="keyboard key binding input"><span>Secondary hit key</span><button class="keyBinding" id="bindKey2" type="button" data-binding="2"></button></div><p id="bindingHint" role="status">Select a key to change its binding.</p><h3>Mouse</h3><label class="settingRow" data-search="disable mouse buttons clicks input"><span>Disable mouse buttons in gameplay</span><input id="disableMouseButtons" type="checkbox" class="toggleSwitch"/></label></section>
      <section id="cursorSettings" class="settingsSection"><h2>Cursor</h2><div class="rangeSetting" data-search="cursor size"><label for="cursorSize">Cursor size <output id="cursorSizeValue"></output></label><input id="cursorSize" type="range" min="0.5" max="2" step="0.05"/><div class="cursorPreview"><img src="assets/cursor.png" alt="Cursor size preview"/></div></div><div class="rangeSetting" data-search="cursor sensitivity mouse"><label for="cursorSensitivity">Cursor sensitivity <output id="cursorSensitivityValue"></output></label><input id="cursorSensitivity" type="range" min="0.4" max="3" step="0.05"/><p>Custom sensitivity captures the mouse during play. Press Esc to pause.</p></div></section><button id="resetInputSettings" type="button">Restore defaults</button></div></div>
    </section>
    <section id="notificationsPanel" class="sidePanel notificationsPanel" role="dialog" aria-modal="true" aria-label="Notifications" hidden><button class="panelClose" type="button" aria-label="Close notifications">${icons.close}</button><header class="notificationHeading"><h2>NOTIFICATIONS <span id="notificationCount">0</span></h2><button id="clearNotifications" type="button">CLEAR ALL</button></header><div id="notificationHistory"></div><header class="notificationHeading"><h2>RUNNING TASKS <span id="taskCount">0</span></h2><button id="cancelTasks" type="button">CANCEL ALL</button></header><div id="runningTasks"></div></section>
    <div id="notificationToasts" aria-live="polite" aria-relevant="additions"></div>`;
  document.body.append(shell);
  const settings=document.getElementById('settingsPanel'),notifications=document.getElementById('notificationsPanel'),scrim=document.getElementById('shellScrim');
  const toggles={settings:document.getElementById('toolbarSettings'),notifications:document.getElementById('notificationToggle')};
  for(const [name,button] of Object.entries(toggles)){button.setAttribute('aria-controls',name+'Panel');button.setAttribute('aria-expanded','false');}
  let active=null,origin=null,binding=null,closeToken=0;
  function close(){
    if(!active)return;
    const panel=active==='settings'?settings:notifications;active=null;binding=null;++closeToken;
    panel.classList.remove('open');panel.inert=true;scrim.classList.remove('open');document.body.classList.remove('shell-open');
    for(const button of Object.values(toggles))button.setAttribute('aria-expanded','false');
    const token=closeToken;setTimeout(()=>{if(token===closeToken){panel.hidden=true;scrim.hidden=true;}},350);
    origin?.focus({preventScroll:true});renderSettings();
  }
  function open(name,source){
    if(active===name)return close();
    ++closeToken;
    settings.hidden=true;notifications.hidden=true;settings.classList.remove('open');notifications.classList.remove('open');
    window.osuMusicPlayer?.close();window.osuBrowse?.close();
    origin=source||document.activeElement;active=name;
    const panel=name==='settings'?settings:notifications;panel.hidden=false;panel.inert=false;scrim.hidden=false;
    document.body.classList.add('shell-open');
    for(const [key,button] of Object.entries(toggles))button.setAttribute('aria-expanded',String(key===name));
    if(name==='notifications'){history.forEach(note=>note.read=true);saveHistory();renderNotifications();document.getElementById('notificationToasts').replaceChildren();}
    requestAnimationFrame(()=>{panel.classList.add('open');scrim.classList.add('open');(name==='settings'?document.getElementById('settingsSearch'):panel.querySelector('.panelClose')).focus({preventScroll:true});});
  }
  window.osuShell={openSettings:source=>open('settings',source),openNotifications:source=>open('notifications',source),close,get active(){return active;}};
  toggles.settings.onclick=()=>open('settings',toggles.settings);toggles.notifications.onclick=()=>open('notifications',toggles.notifications);
  if(menuSettings)menuSettings.onclick=()=>open('settings',menuSettings);
  scrim.onclick=close;shell.querySelectorAll('.panelClose').forEach(button=>button.onclick=close);
  const formatKey=code=>code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ').replace('Space','Space');
  function renderSettings(){
    const state=window.osuSettings.value;
    for(const n of [1,2]){const button=document.getElementById('bindKey'+n);button.textContent=binding===n?'Press a key…':formatKey(state['key'+n]);button.classList.toggle('listening',binding===n);}
    document.getElementById('disableMouseButtons').checked=state.disableMouseButtons;
    for(const key of ['cursorSize','cursorSensitivity']){document.getElementById(key).value=state[key];document.getElementById(key+'Value').value=Number(state[key]).toFixed(2)+'x';}
    settings.querySelector('.cursorPreview img').style.width=48*state.cursorSize+'px';
  }
  for(const n of [1,2])document.getElementById('bindKey'+n).onclick=()=>{binding=n;document.getElementById('bindingHint').textContent='Press a key. Esc cancels.';renderSettings();};
  document.getElementById('disableMouseButtons').onchange=event=>window.osuSettings.update({disableMouseButtons:event.target.checked});
  for(const key of ['cursorSize','cursorSensitivity'])document.getElementById(key).oninput=event=>window.osuSettings.update({[key]:Number(event.target.value)});
  window.addEventListener('osu:settings-changed',renderSettings);
  document.getElementById('resetInputSettings').onclick=()=>{binding=null;window.osuSettings.reset();};
  document.getElementById('settingsSearch').oninput=event=>{
    const query=event.target.value.trim().toLowerCase();settings.querySelectorAll('[data-search]').forEach(row=>row.hidden=!row.dataset.search.includes(query));
  };
  settings.querySelectorAll('[data-section]').forEach(button=>button.onclick=()=>{settings.querySelectorAll('[data-section]').forEach(item=>item.classList.toggle('active',item===button));document.getElementById(button.dataset.section).scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(binding){
      event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
      if(event.key==='Escape'){binding=null;renderSettings();document.getElementById('bindingHint').textContent='Binding unchanged.';return;}
      const other=window.osuSettings.value['key'+(binding===1?2:1)];
      if(event.ctrlKey||event.metaKey||event.altKey||['Tab','Control','Alt','Meta','Unidentified'].includes(event.key)||!event.code||!event.keyCode||event.code===other){document.getElementById('bindingHint').textContent='Choose an unused key without Ctrl, Alt or Meta.';return;}
      const n=binding;binding=null;window.osuSettings.update({['key'+n]:event.code,['key'+n+'KeyCode']:event.keyCode});document.getElementById('bindingHint').textContent='Key binding saved.';return;
    }
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
    if(event.key==='Tab'){
      const panel=active==='settings'?settings:notifications;const items=[...panel.querySelectorAll('button,input,[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length);
      if(items.length && (event.shiftKey?document.activeElement===items[0]:document.activeElement===items.at(-1))){event.preventDefault();(event.shiftKey?items.at(-1):items[0]).focus();}
    }
  },true);
  let history=[];
  try{history=JSON.parse(sessionStorage.getItem('osu:notifications')||'[]');if(!Array.isArray(history))history=[];history=history.filter(note=>typeof note.message==='string').slice(-60);}catch{}
  const tasks=new Map();
  let taskFrame=0;
  function saveHistory(){try{sessionStorage.setItem('osu:notifications',JSON.stringify(history));}catch{}}
  function dismiss(id){history=history.filter(note=>note.id!==id);saveHistory();renderNotifications();}
  function card(note,{task=false}={}){
    const node=document.createElement('article');node.className='notificationCard'+(note.error?' error':'')+(!note.read?' unread':'');
    node.innerHTML=`<span class="notificationIcon">${icons[task?'download':note.error?'info':'check']}</span><div class="notificationContent"><p></p></div><button type="button" class="notificationDismiss" aria-label="${task?'Cancel download':'Dismiss notification'}">${task?icons.close:icons.check}</button>`;
    node.querySelector('p').textContent=note.message;
    node.querySelector('button').onclick=()=>task?window.osuDownloads?.cancel(note.id):dismiss(note.id);
    if(task){const progress=document.createElement('progress');progress.max=1;if(note.fraction!=null)progress.value=note.fraction;node.querySelector('.notificationContent').append(progress);}
    return node;
  }
  function renderNotifications(){
    document.getElementById('notificationCount').textContent=history.length;
    document.getElementById('notificationHistory').replaceChildren(...[...history].reverse().map(note=>card(note)));
    const unread=history.filter(note=>!note.read).length;
    toggles.notifications.dataset.count=unread?String(unread):'';
    toggles.notifications.setAttribute('aria-label',`Notifications${unread?', '+unread+' unread':''}`);
    document.getElementById('clearNotifications').disabled=!history.length;renderTasks();
  }
  function renderTasks(){
    document.getElementById('taskCount').textContent=tasks.size;
    document.getElementById('runningTasks').replaceChildren(...[...tasks.values()].map(note=>card(note,{task:true})));
    document.getElementById('cancelTasks').disabled=!tasks.size;
  }
  function post(message,error=false,{quiet=false}={}){
    const note={id:crypto.randomUUID(),message:String(message),error:Boolean(error),read:active==='notifications',time:Date.now()};
    history.push(note);history=history.slice(-60);saveHistory();renderNotifications();
    if(quiet||active==='notifications')return;
    const tray=document.getElementById('notificationToasts'),node=card(note);node.querySelector('button').onclick=()=>{note.read=true;saveHistory();renderNotifications();node.remove();};
    tray.prepend(node);while(tray.children.length>3)tray.lastElementChild.remove();
    const hide=()=>{if(node.matches(':hover')||node.contains(document.activeElement)){setTimeout(hide,2000);return;}node.classList.add('leaving');setTimeout(()=>node.remove(),400);};
    setTimeout(hide,error?12000:5000);
  }
  window.osuToast=post;
  document.getElementById('clearNotifications').onclick=()=>{history=[];saveHistory();renderNotifications();};
  document.getElementById('cancelTasks').onclick=()=>{for(const id of tasks.keys())window.osuDownloads?.cancel(id);};
  document.addEventListener('osu:download-progress',event=>{
    const {id,state,fraction,message,background}=event.detail;
    if(['installed','error','cancelled'].includes(state)){
      tasks.delete(id);
      const text=state==='installed'?`Beatmap ${id} is ready to play.`:state==='error'?`Could not download beatmap ${id}. ${message||''}`:`Beatmap ${id} download cancelled.`;
      post(text,state==='error',{quiet:background||state==='cancelled'});
    }else{
      tasks.set(id,{id,message:`${state==='queued'?'Queued':state==='importing'?'Importing':'Downloading'} beatmap ${id}`,fraction,read:true});
      if(!taskFrame)taskFrame=requestAnimationFrame(()=>{taskFrame=0;renderTasks();});
    }
  });
  const starter=document.getElementById('starterStatus');if(starter){starter.classList.add('starterTask');notifications.append(starter);}
  document.getElementById('toast')?.remove();renderSettings();renderNotifications();
})();

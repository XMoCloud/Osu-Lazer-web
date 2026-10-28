/* Shared, validated preferences. No framework or account is required. */
(() => {
  const defaults={key1:'KeyZ',key2:'KeyX',key1KeyCode:90,key2KeyCode:88,disableMouseButtons:false,cursorSize:1.15,cursorSensitivity:1};
  const storageKey='osu:settings';
  const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
  function validate(input={}){
    const next={...defaults};
    for(const n of [1,2])if(typeof input['key'+n]==='string' && /^[A-Za-z][A-Za-z0-9]{0,24}$/.test(input['key'+n]) && !['Escape','Tab','MetaLeft','MetaRight','ControlLeft','ControlRight','AltLeft','AltRight'].includes(input['key'+n])){
      next['key'+n]=input['key'+n];next['key'+n+'KeyCode']=Math.round(clamp(input['key'+n+'KeyCode'],1,255,defaults['key'+n+'KeyCode']));
    }
    if(next.key1===next.key2 || next.key1KeyCode===next.key2KeyCode){next.key1=defaults.key1;next.key2=defaults.key2;next.key1KeyCode=90;next.key2KeyCode=88;}
    next.disableMouseButtons=input.disableMouseButtons===true;
    next.cursorSize=clamp(input.cursorSize,.5,2,defaults.cursorSize);
    next.cursorSensitivity=clamp(input.cursorSensitivity,.4,3,defaults.cursorSensitivity);
    return next;
  }
  let state=validate();
  try{state=validate(JSON.parse(localStorage.getItem(storageKey)||'{}'));}catch{}
  window.osuSettings={get value(){return {...state};},update(patch){
    state=validate({...state,...patch});
    try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}
    window.dispatchEvent(new CustomEvent('osu:settings-changed',{detail:{...state}}));return {...state};
  },reset(){return this.update(defaults);},applyToGame(game){
    Object.assign(game,{K1code:state.key1,K2code:state.key2,K1keycode:state.key1KeyCode,K2keycode:state.key2KeyCode,allowMouseButton:!state.disableMouseButtons,cursorSize:state.cursorSize,cursorSensitivity:state.cursorSensitivity});
  }};
})();

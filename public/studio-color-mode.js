(() => {
  const storageKey = 'monowear-studio-appearance';
  const modes = [{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'wine',label:'Deep wine'}];
  function setup(){
    const actions=document.querySelector('.studio-app-actions');
    if(!actions || document.getElementById('studioThemeMode')) return;
    const wrap=document.createElement('div'); wrap.className='studio-theme-switch';
    wrap.innerHTML='<label for="studioThemeMode">STUDIO MODE</label><select id="studioThemeMode" aria-label="Studio appearance mode"></select>';
    const select=wrap.querySelector('select');
    modes.forEach(m=>{const o=document.createElement('option');o.value=m.value;o.textContent=m.label;select.appendChild(o)});
    let saved='dark'; try{saved=localStorage.getItem(storageKey)||'dark'}catch(e){}
    function apply(mode){if(!modes.some(m=>m.value===mode))mode='dark';document.body.dataset.studioMode=mode;select.value=mode;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=mode==='light'?'#f5f6f4':mode==='wine'?'#1b0910':'#111210';try{localStorage.setItem(storageKey,mode)}catch(e){}}
    select.addEventListener('change',()=>apply(select.value)); actions.insertBefore(wrap,actions.firstChild); apply(saved);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
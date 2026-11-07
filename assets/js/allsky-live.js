(() => {
  'use strict';
  const root = document.currentScript?.closest('.asotg-public') || document.querySelector('.asotg-public');
  if (!root || root.dataset.initialized === '1') return;
  root.dataset.initialized = '1';
  // Preserved from the user's customized allsky_live.html.
  const WORKER_BASE = 'https://asotg-allsky.observatoriotresgarcas.workers.dev';
  const INTERVAL_MS = 30000;
  const SITE = {
    mini: { lat:-23.209107, lon:-45.862162 },
    otg:  { lat:-22.5505,   lon:-44.6333 }
  };
  // Match the original ASOTG defaults. Set separately after physical calibration.
  const DEFAULT_CALIBRATIONS = {
    mini: {cx_norm:.5,cy_norm:.5,radius_norm:.43,rotation_deg:0,horizon_zenith_angle_deg:90,projection:'equidistant',flip_x:false,flip_y:false},
    otg:  {cx_norm:.5,cy_norm:.5,radius_norm:.43,rotation_deg:0,horizon_zenith_angle_deg:90,projection:'equidistant',flip_x:false,flip_y:false}
  };
  const cards = [...root.querySelectorAll('[data-asotg-site]')];
  const states = new Map();
  const DEG=Math.PI/180, RAD=180/Math.PI;
  const finite=x=>Number.isFinite(x);
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const pick=(card,role)=>card.querySelector(`[data-role="${role}"]`);
  const getSaved=(key,fallback)=>{try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw)}catch{return fallback}};
  const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
  const fmtTime=iso=>{
    if(!iso)return 'Not available';
    const d=new Date(iso);
    if(!finite(d.getTime()))return 'Not available';
    return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)+' BRT';
  };
  const isoTime=state=>{
    const t=Date.parse(state.data?.last_capture_utc||'');
    return finite(t)?new Date(t):null;
  };
  function imageUrl(site,view,version){const name=view==='annotated'?'latest_annotated.jpg':'latest.jpg';return `${WORKER_BASE}/image/${site}/${name}?v=${encodeURIComponent(version||'0')}`;}
  const setMessage=(card,msg)=>{pick(card,'target-status').textContent=msg;};

  // J2000 equatorial coordinates from the catalog are precessed to the observation date.
  // This is a lightweight Earth-rotation model for browser viewing, not a precise astrometric fit.
  function precess(raDeg,decDeg,date){
    const jd=date.getTime()/86400000+2440587.5,T=(jd-2451545)/36525;
    const zeta=(2306.2181*T+.30188*T*T+.017998*T*T*T)/3600*DEG;
    const z=(2306.2181*T+1.09468*T*T+.018203*T*T*T)/3600*DEG;
    const theta=(2004.3109*T-.42665*T*T-.041833*T*T*T)/3600*DEG;
    const ra=raDeg*DEG,dec=decDeg*DEG;
    const A=Math.cos(dec)*Math.sin(ra+zeta);
    const B=Math.cos(theta)*Math.cos(dec)*Math.cos(ra+zeta)-Math.sin(theta)*Math.sin(dec);
    const C=Math.sin(theta)*Math.cos(dec)*Math.cos(ra+zeta)+Math.cos(theta)*Math.sin(dec);
    return {ra:(Math.atan2(A,B)+z),dec:Math.asin(clamp(C,-1,1))};
  }
  function altAz(raDeg,decDeg,date,site){
    const loc=SITE[site], eq=precess(raDeg,decDeg,date), jd=date.getTime()/86400000+2440587.5;
    const gmst=(280.46061837+360.98564736629*(jd-2451545)+.000387933*((jd-2451545)/36525)**2)%360;
    const ha=(gmst+loc.lon)*DEG-eq.ra, lat=loc.lat*DEG,dec=eq.dec;
    const sa=Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha);
    const alt=Math.asin(clamp(sa,-1,1));
    const north=Math.cos(lat)*Math.sin(dec)-Math.sin(lat)*Math.cos(dec)*Math.cos(ha);
    const east=-Math.cos(dec)*Math.sin(ha);
    return {alt:alt*RAD,az:((Math.atan2(east,north)*RAD)%360+360)%360};
  }
  function projectionFactor(alt,cal){
    const theta=(90-alt)*DEG,edge=cal.horizon_zenith_angle_deg*DEG;
    switch(cal.projection){
      case'equisolid':return Math.sin(theta/2)/Math.max(1e-9,Math.sin(edge/2));
      case'stereographic':return Math.tan(theta/2)/Math.max(1e-9,Math.tan(edge/2));
      case'orthographic':return Math.sin(theta)/Math.max(1e-9,Math.sin(edge));
      default:return theta/Math.max(1e-9,edge);
    }
  }
  function project(alt,az,state,layout){
    const c=state.cal,r=Math.min(layout.iw,layout.ih)*c.radius_norm*projectionFactor(alt,c),a=(az+c.rotation_deg)*DEG;
    let x=-r*Math.sin(a),y=-r*Math.cos(a);
    if(c.flip_x)x=-x;if(c.flip_y)y=-y;
    const ix=c.cx_norm*layout.iw+x,iy=c.cy_norm*layout.ih+y;
    return {x:layout.ox+ix*layout.scale,y:layout.oy+iy*layout.scale};
  }
  function layoutFor(card){
    const media=pick(card,'media'),img=pick(card,'image');
    const w=media.clientWidth,h=media.clientHeight,iw=img.naturalWidth||w,ih=img.naturalHeight||h;
    const scale=Math.min(w/iw,h/ih);
    return {w,h,iw,ih,scale,ox:(w-iw*scale)/2,oy:(h-ih*scale)/2};
  }
  function draw(card,state){
    const canvas=pick(card,'canvas'),ctx=canvas.getContext('2d');if(!ctx)return;
    const L=layoutFor(card),dpr=Math.min(window.devicePixelRatio||1,2.5);
    const pw=Math.round(L.w*dpr),ph=Math.round(L.h*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,L.w,L.h);
    if(!state.overlayEnabled || !state.data?.image_available || !pick(card,'image').naturalWidth)return;
    const color=getComputedStyle(root).getPropertyValue('--a-path').trim()||'#f6c96d';
    const past=getComputedStyle(root).getPropertyValue('--a-past').trim()||'#8fd6ed';
    const outline=getComputedStyle(root).getPropertyValue('--a-image-bg').trim()||'#000';
    const time=isoTime(state);if(!time)return;
    // Calibration guide, shown only while the alignment drawer is open.
    if(pick(card,'calibration-panel').open){
      ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.36;ctx.setLineDash([5,7]);ctx.lineWidth=1.5;
      let started=false;ctx.beginPath();
      for(let az=0;az<=360;az+=3){const p=project(0,az,state,L);if(!started){ctx.moveTo(p.x,p.y);started=true;}else ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.setLineDash([]);
      for(const [label,az] of [['N',0],['E',90],['S',180],['W',270]]){
        const p=project(5,az,state,L);ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.strokeStyle=outline;ctx.lineWidth=3;ctx.strokeText(label,p.x,p.y);ctx.fillStyle=color;ctx.globalAlpha=.9;ctx.fillText(label,p.x,p.y);
      }
      ctx.restore();
    }
    for(const t of state.targets){
      for(const [start,end,stroke,dashed] of [[-120,0,past,true],[0,360,color,false]]){
        ctx.save();ctx.strokeStyle=stroke;ctx.lineWidth=2.25;ctx.setLineDash(dashed?[6,6]:[]);ctx.beginPath();let segment=false;
        for(let m=start;m<=end;m+=10){const aa=altAz(t.ra,t.dec,new Date(time.getTime()+m*60000),state.site);
          if(aa.alt<0){segment=false;continue;}
          const p=project(aa.alt,aa.az,state,L);if(!segment){ctx.moveTo(p.x,p.y);segment=true;}else ctx.lineTo(p.x,p.y);
        }
        ctx.stroke();ctx.restore();
      }
      const aa=altAz(t.ra,t.dec,time,state.site);
      if(aa.alt>=0){
        const p=project(aa.alt,aa.az,state,L);
        ctx.save();ctx.lineWidth=2.5;ctx.strokeStyle=outline;ctx.fillStyle=color;
        ctx.beginPath();ctx.arc(p.x,p.y,6,0,2*Math.PI);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(p.x-13,p.y);ctx.lineTo(p.x+13,p.y);ctx.moveTo(p.x,p.y-13);ctx.lineTo(p.x,p.y+13);ctx.strokeStyle=color;ctx.stroke();
        ctx.font='bold 14px sans-serif';ctx.textAlign=p.x>L.w*.68?'right':'left';
        const tx=p.x+(p.x>L.w*.68?-13:13),ty=clamp(p.y-13,15,L.h-8);
        ctx.strokeStyle=outline;ctx.lineWidth=4;ctx.strokeText(t.name,tx,ty);ctx.fillText(t.name,tx,ty);ctx.restore();
      }
    }
    if(state.clickCal){
      ctx.save();ctx.fillStyle=color;ctx.font='bold 16px sans-serif';ctx.textAlign='center';
      const prompt=state.clickCal.stage===0?'Click the zenith in the image':'Click the NORTH horizon in the image';
      ctx.strokeStyle=outline;ctx.lineWidth=4;ctx.strokeText(prompt,L.w/2,32);ctx.fillText(prompt,L.w/2,32);ctx.restore();
    }
  }
  function normalizeCalibration(raw,site){
    const d=DEFAULT_CALIBRATIONS[site],o={...d};
    if(!raw||typeof raw!=='object')return o;
    for(const k of ['cx_norm','cy_norm','radius_norm','rotation_deg','horizon_zenith_angle_deg']){
      const n=Number(raw[k]);if(finite(n))o[k]=n;
    }
    o.cx_norm=clamp(o.cx_norm,0,1);o.cy_norm=clamp(o.cy_norm,0,1);
    o.radius_norm=clamp(o.radius_norm,.05,1);o.rotation_deg=clamp(o.rotation_deg,-360,360);
    o.horizon_zenith_angle_deg=clamp(o.horizon_zenith_angle_deg,30,150);
    if(['equidistant','equisolid','stereographic','orthographic'].includes(raw.projection))o.projection=raw.projection;
    if(o.projection==='orthographic')o.horizon_zenith_angle_deg=Math.min(o.horizon_zenith_angle_deg,90);
    o.flip_x=raw.flip_x===true;o.flip_y=raw.flip_y===true;return o;
  }
  const calFields=[
    {k:'cx_norm',name:'Center X',type:'range',min:0,max:1,step:.005},
    {k:'cy_norm',name:'Center Y',type:'range',min:0,max:1,step:.005},
    {k:'radius_norm',name:'Horizon radius',type:'range',min:.05,max:1,step:.005},
    {k:'rotation_deg',name:'North rotation (°)',type:'range',min:-180,max:180,step:1},
    {k:'horizon_zenith_angle_deg',name:'Lens edge angle (°)',type:'range',min:45,max:120,step:1},
    {k:'projection',name:'Projection',type:'select',options:['equidistant','equisolid','stereographic','orthographic']},
    {k:'flip_x',name:'Horizontal flip',type:'check'},
    {k:'flip_y',name:'Vertical flip',type:'check'}
  ];
  function syncCalFields(card,state){
    for(const el of pick(card,'cal-fields').querySelectorAll('[data-cal-key]')){
      const k=el.dataset.calKey;const input=el.querySelector('input, select');
      if(input.type==='checkbox')input.checked=!!state.cal[k];else input.value=state.cal[k];
      const val=el.querySelector('.asotg-cal-value');if(val)val.textContent=Number(state.cal[k]).toFixed(k==='rotation_deg'||k==='horizon_zenith_angle_deg'?0:3);
    }
  }
  function setupCalFields(card,state){
    const container=pick(card,'cal-fields');
    for(const f of calFields){
      const field=document.createElement('div');field.className='asotg-field';field.dataset.calKey=f.k;
      const label=document.createElement('label');label.textContent=f.name;const input=document.createElement(f.type==='select'?'select':'input');
      const id=`cal-${state.site}-${f.k}`;input.id=id;label.htmlFor=id;
      if(f.type==='range'){input.type='range';input.min=f.min;input.max=f.max;input.step=f.step;}
      if(f.type==='check')input.type='checkbox';
      if(f.type==='select'){for(const choice of f.options){const opt=document.createElement('option');opt.value=choice;opt.textContent=choice;input.appendChild(opt);}}
      field.append(label,input);
      if(f.type==='range'){const v=document.createElement('span');v.className='asotg-cal-value';field.append(v);}
      input.addEventListener('input',()=>{
        const val=f.type==='check'?input.checked:f.type==='range'?Number(input.value):input.value;
        state.cal[f.k]=val;
        if(state.cal.projection==='orthographic')state.cal.horizon_zenith_angle_deg=Math.min(90,state.cal.horizon_zenith_angle_deg);
        save(`asotg-web-cal-${state.site}`,state.cal);syncCalFields(card,state);draw(card,state);
      });
      container.appendChild(field);
    }
    syncCalFields(card,state);
    pick(card,'calibration-panel').addEventListener('toggle',()=>draw(card,state));
    pick(card,'two-click').addEventListener('click',()=>{
      state.clickCal={stage:0};pick(card,'media').dataset.calibrate='true';
      pick(card,'cal-status').textContent='Click the zenith on the photograph, then the northern horizon.';draw(card,state);
    });
    pick(card,'media').querySelector('canvas').addEventListener('pointerdown',ev=>{
      if(!state.clickCal)return;
      const L=layoutFor(card),rect=pick(card,'canvas').getBoundingClientRect();
      const x=(ev.clientX-rect.left-L.ox)/L.scale,y=(ev.clientY-rect.top-L.oy)/L.scale;
      if(!finite(x)||!finite(y))return;
      if(state.clickCal.stage===0){state.clickCal={stage:1,x,y};pick(card,'cal-status').textContent='Zenith registered. Click the northern horizon on the photograph.';}
      else {
        const z=state.clickCal,dx=x-z.x,dy=y-z.y;
        if(Math.hypot(dx,dy)<5){pick(card,'cal-status').textContent='Choose two different points.';return;}
        state.cal.cx_norm=clamp(z.x/L.iw,0,1);state.cal.cy_norm=clamp(z.y/L.ih,0,1);
        state.cal.radius_norm=clamp(Math.hypot(dx,dy)/Math.min(L.iw,L.ih),.05,1);
        state.cal.rotation_deg=Math.atan2(-dx,-dy)*RAD;
        state.cal.flip_x=false;state.cal.flip_y=false;
        state.cal.horizon_zenith_angle_deg=90;state.clickCal=null;
        delete pick(card,'media').dataset.calibrate;
        save(`asotg-web-cal-${state.site}`,state.cal);syncCalFields(card,state);
        pick(card,'cal-status').textContent='Calibration saved in this browser. Fine-tune the projection and sliders if necessary.';
      }
      draw(card,state);
    });
    pick(card,'cal-reset').addEventListener('click',()=>{
      state.cal=normalizeCalibration(DEFAULT_CALIBRATIONS[state.site],state.site);
      save(`asotg-web-cal-${state.site}`,state.cal);state.clickCal=null;delete pick(card,'media').dataset.calibrate;
      syncCalFields(card,state);draw(card,state);pick(card,'cal-status').textContent='Original ASOTG default calibration restored.';
    });
    pick(card,'cal-copy').addEventListener('click',async()=>{
      const txt=`${state.site}: ${JSON.stringify(state.cal)}`;
      try{await navigator.clipboard.writeText(txt);pick(card,'cal-status').textContent='Copied. Paste these values into DEFAULT_CALIBRATIONS in allsky_live.html to publish the same calibration for all visitors.';}
      catch{pick(card,'cal-status').textContent=txt;}
    });
  }
  function parseCoordinates(value){
    const s=value.trim().replace(/\u2212/g,'-');
    // Decimal RA/Dec in degrees (comma, semicolon, or whitespace separated).
    const dec=s.match(/^([+\-]?\d+(?:\.\d+)?)\s*[,;\s]+\s*([+\-]?\d+(?:\.\d+)?)\s*(?:deg|°)?$/i);
    if(dec){const ra=+dec[1],d=+dec[2];if(ra>=0&&ra<=360&&Math.abs(d)<=90)return {ra,dec:d};}
    // Sexagesimal RA in hours and declination in degrees (with colon or spaces).
    const cleaned=s.replace(/[hmsd°′″]/gi,' ').replace(/\s*[:]\s*/g,' ').trim();
    const pieces=cleaned.split(/[\s,;]+/).filter(Boolean);
    if(pieces.length===6 && pieces[3].match(/^[+\-]?\d+$/)){
      const [h,m,sec,dd,dm,ds]=pieces.map(Number);
      if([h,m,sec,dd,dm,ds].every(finite) && h>=0&&h<=24&&m>=0&&m<60&&sec>=0&&sec<60&&Math.abs(dd)<=90&&dm>=0&&dm<60&&ds>=0&&ds<60){
        const sign=pieces[3].startsWith('-')?-1:1,ra=15*(h+m/60+sec/3600),dec=sign*(Math.abs(dd)+dm/60+ds/3600);
        if(ra<=360&&Math.abs(dec)<=90)return {ra,dec};
      }
    }
    return null;
  }
  async function simbadTap(adql){
    const base='https://simbad.cds.unistra.fr/simbad/sim-tap/sync';
    const params=new URLSearchParams({request:'doQuery',lang:'adql',format:'json',query:adql});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
    try{
      const r=await fetch(`${base}?${params}`,{signal:controller.signal,mode:'cors',cache:'no-store'});
      if(!r.ok)throw Error(`SIMBAD returned HTTP ${r.status}`);
      const j=await r.json();if(!Array.isArray(j.data)||!j.data.length)return null;
      const row=j.data[0];const columns=(j.metadata||[]).map(m=>String(m.name||'').toLowerCase());
      const get=(name,index)=>Array.isArray(row)?row[columns.indexOf(name)>=0?columns.indexOf(name):index]:row[name];
      const name=String(get('main_id',0)||'').trim(),ra=Number(get('ra',1)),dec=Number(get('dec',2));
      return name&&finite(ra)&&finite(dec)?{name,ra,dec}:null;
    }finally{clearTimeout(timer);}
  }
  async function resolveName(name){
    const escaped=name.replace(/'/g,"''");
    return simbadTap(`SELECT TOP 1 b.main_id, b.ra, b.dec FROM basic AS b JOIN ident AS i ON b.oid = i.oidref WHERE LOWER(i.id) = LOWER('${escaped}')`);
  }
  async function identifyCoordinates(p){
    const ra=Number(p.ra.toFixed(7)),dec=Number(p.dec.toFixed(7));
    return simbadTap(`SELECT TOP 1 main_id, ra, dec FROM basic WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, 0.00833333)) ORDER BY DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', ${ra}, ${dec}))`);
  }
  function renderTargets(card,state){
    const list=pick(card,'targets');list.replaceChildren();
    for(const t of state.targets){
      const chip=document.createElement('span');chip.className='asotg-target-chip';
      const at=isoTime(state),aa=at?altAz(t.ra,t.dec,at,state.site):null;
      const label=document.createElement('span');label.textContent=`${t.name} | ${aa?`Alt ${aa.alt.toFixed(1)}° / Az ${aa.az.toFixed(1)}°`:`RA ${t.ra.toFixed(3)}°`}`;
      const del=document.createElement('button');del.type='button';del.textContent='×';del.title=`Remove ${t.name}`;
      del.addEventListener('click',()=>{state.targets=state.targets.filter(x=>x.id!==t.id);save(`asotg-web-targets-${state.site}`,state.targets);renderTargets(card,state);draw(card,state);});
      chip.append(label,del);list.append(chip);
    }
  }
  function setupTargets(card,state){
    pick(card,'target-form').addEventListener('submit',async ev=>{
      ev.preventDefault();if(state.searchBusy)return;
      const q=pick(card,'query').value.trim(),custom=pick(card,'custom-name').value.trim();if(!q)return;
      state.searchBusy=true;pick(card,'search').disabled=true;
      setMessage(card,'Resolving target...');
      try{
        const coords=parseCoordinates(q);let obj=null,warning='';
        if(coords){
          try{obj=await identifyCoordinates(coords);}catch(e){warning='SIMBAD unavailable; using the entered coordinates. ';}
          if(!obj)obj={...coords,name:custom||'Target'};
          // Keep the exact coordinates entered by the user; only adopt the matched catalog name.
          obj={ra:coords.ra,dec:coords.dec,name:custom||(obj.name||'Target')};
        }else{
          obj=await resolveName(q);
          if(!obj)throw new Error('No SIMBAD match. Try a recognized catalog name or J2000 coordinates.');
          if(custom)obj.name=custom;
        }
        const id=`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        state.targets.push({id,ra:obj.ra,dec:obj.dec,name:obj.name.slice(0,70)});
        if(state.targets.length>12)state.targets.shift();
        save(`asotg-web-targets-${state.site}`,state.targets);
        pick(card,'query').value='';pick(card,'custom-name').value='';
        setMessage(card,`${warning}Added ${obj.name} (J2000: ${obj.ra.toFixed(5)}°, ${obj.dec.toFixed(5)}°). Past trajectory dashed, future solid. Display uses the latest image timestamp.`);
        renderTargets(card,state);draw(card,state);
      }catch(err){setMessage(card,`Unable to plot: ${err.message}. If SIMBAD cannot be reached from your browser, enter J2000 coordinates.`);}
      finally{state.searchBusy=false;pick(card,'search').disabled=false;}
    });
    pick(card,'clear-targets').addEventListener('click',()=>{state.targets=[];save(`asotg-web-targets-${state.site}`,[]);renderTargets(card,state);draw(card,state);setMessage(card,'Targets cleared.');});
    pick(card,'overlay-enabled').addEventListener('change',e=>{state.overlayEnabled=e.target.checked;draw(card,state);});
    renderTargets(card,state);
  }
  function render(card,state){
    const d=state.data,badge=pick(card,'badge'),img=pick(card,'image');
    if(!d||!d.image_available){
      img.hidden=true;pick(card,'placeholder').hidden=false;
      pick(card,'placeholder').textContent=d?'No image has been published yet.':'Cannot reach the image gateway.';
      pick(card,'full').hidden=true;
    }else{
      const url=imageUrl(state.site,state.view,d.last_upload_utc);
      if(img.dataset.url!==url){img.dataset.url=url;img.src=url;}
      if(img.complete&&img.naturalWidth){img.hidden=false;pick(card,'placeholder').hidden=true;}
      const full=pick(card,'full');full.href=url;full.hidden=false;
    }
    const annButton=card.querySelector('[data-view="annotated"]');annButton.disabled=!(d&&d.image_available&&d.has_annotated);
    for(const btn of card.querySelectorAll('[data-view]'))btn.setAttribute('aria-pressed',String(btn.dataset.view===state.view));
    if(d){
      pick(card,'capture').textContent=fmtTime(d.last_capture_utc);pick(card,'upload').textContent=fmtTime(d.last_upload_utc);
      pick(card,'camera').textContent=d.camera_name||'Not reported';pick(card,'simulation').hidden=!d.simulated;
      pick(card,'reference').textContent=d.last_capture_utc?`${fmtTime(d.last_capture_utc)} (image time)`:'Not available';
      if(!d.online){badge.textContent='OFFLINE';badge.dataset.status='offline';pick(card,'detail').textContent=d.image_available?'Last image retained (not live).':'Waiting for first publication.';}
      else if(!d.camera_connected||!d.capturing){badge.textContent=d.camera_connected?'ONLINE / IDLE':'CAMERA OFF';badge.dataset.status='idle';pick(card,'detail').textContent=d.camera_connected?'ASOTG online, but no recent captures.':'ASOTG online, camera disconnected.';}
      else if(d.simulated){badge.textContent='SIMULATION';badge.dataset.status='simulation';pick(card,'detail').textContent='Simulated stream, not a physical sky observation.';}
      else if(!d.image_recent){badge.textContent='UPLOAD DELAY';badge.dataset.status='idle';pick(card,'detail').textContent='Camera running, public image not updated recently.';}
      else{badge.textContent='LIVE';badge.dataset.status='live';pick(card,'detail').textContent='Camera online and public image recently updated.';}
    }else{
      badge.textContent='UNAVAILABLE';badge.dataset.status='offline';pick(card,'detail').textContent='Public status service unreachable.';
      pick(card,'camera').textContent='Not available';pick(card,'reference').textContent='Not available';
    }
    renderTargets(card,state);draw(card,state);
  }
  async function refresh(card,state){
    if(state.busy)return;state.busy=true;
    try{
      const response=await fetch(`${WORKER_BASE}/api/status/${state.site}?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      state.data=await response.json();if(state.view==='annotated'&&!state.data.has_annotated)state.view='clean';
    }catch(_){state.data=null;}
    finally{state.busy=false;render(card,state);}
  }
  const themeSelect=pick(root,'theme');
  const loadedTheme=getSaved('asotg-web-theme','original');
  const applyTheme=t=>{if(!['original','light','black','night'].includes(t))t='original';root.dataset.theme=t;themeSelect.value=t;save('asotg-web-theme',t);for(const c of cards){const s=states.get(c.dataset.asotgSite);if(s)draw(c,s);}};
  themeSelect.addEventListener('change',()=>applyTheme(themeSelect.value));
  for(const card of cards){
    const site=card.dataset.asotgSite;
    if(root.dataset.pageSite===site){
      const link=card.querySelector('.asotg-open-monitor');
      link.textContent='All observatories';link.href=root.dataset.figuresUrl || '/figures.html';
      link.removeAttribute('target');link.removeAttribute('rel');
    }
    const initialTargets=getSaved(`asotg-web-targets-${site}`,[]);
    const state={site,view:'clean',data:null,busy:false,searchBusy:false,overlayEnabled:true,clickCal:null,
      targets:Array.isArray(initialTargets)?initialTargets.filter(t=>t&&finite(t.ra)&&finite(t.dec)&&typeof t.name==='string').slice(0,12):[],
      cal:normalizeCalibration(getSaved(`asotg-web-cal-${site}`,DEFAULT_CALIBRATIONS[site]),site)};
    states.set(site,state);
    setupCalFields(card,state);setupTargets(card,state);
    for(const button of card.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{
      if(button.disabled)return;state.view=button.dataset.view;render(card,state);
    });
    const image=pick(card,'image');
    image.addEventListener('load',()=>{image.hidden=false;pick(card,'placeholder').hidden=true;draw(card,state);});
    image.addEventListener('error',()=>{image.hidden=true;pick(card,'placeholder').hidden=false;pick(card,'placeholder').textContent='Image unavailable. The published status may be newer than the image object.';draw(card,state);});
    if(typeof ResizeObserver!=='undefined'){new ResizeObserver(()=>draw(card,state)).observe(pick(card,'media'));}
    if(WORKER_BASE.includes('REPLACE-WITH-YOUR-WORKER')){
      pick(card,'placeholder').textContent='Configure WORKER_BASE in _includes/allsky_live.html';
      pick(card,'badge').textContent='NOT CONFIGURED';continue;
    }
    refresh(card,state);
  }
  applyTheme(loadedTheme);
  if(!WORKER_BASE.includes('REPLACE-WITH-YOUR-WORKER')){
    setInterval(()=>{if(!document.hidden)for(const card of cards)refresh(card,states.get(card.dataset.asotgSite));},INTERVAL_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const card of cards)refresh(card,states.get(card.dataset.asotgSite));});
  }
})();

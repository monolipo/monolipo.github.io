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
    if(!state.overlayEnabled || !state.cal || !state.data?.image_available || !pick(card,'image').naturalWidth)return;
    const color=getComputedStyle(root).getPropertyValue('--a-path').trim()||'#f6c96d';
    const past=getComputedStyle(root).getPropertyValue('--a-past').trim()||'#8fd6ed';
    const outline=getComputedStyle(root).getPropertyValue('--a-image-bg').trim()||'#000';
    const time=isoTime(state);if(!time)return;
    const display = state.data?.display || {};
    const targetAlpha = typeof display.opacity === 'number' ? clamp(display.opacity,.10,1) : 1;
    for(const t of state.targets){
      if(display.trajectories !== false) for(const [start,end,stroke,dashed] of [[-120,0,past,true],[0,360,color,false]]){
        ctx.save();ctx.globalAlpha=targetAlpha;ctx.strokeStyle=stroke;ctx.lineWidth=2.25;ctx.setLineDash(dashed?[6,6]:[]);ctx.beginPath();let segment=false;
        for(let m=start;m<=end;m+=10){const aa=altAz(t.ra,t.dec,new Date(time.getTime()+m*60000),state.site);
          if(aa.alt<0){segment=false;continue;}
          const p=project(aa.alt,aa.az,state,L);if(!segment){ctx.moveTo(p.x,p.y);segment=true;}else ctx.lineTo(p.x,p.y);
        }
        ctx.stroke();ctx.restore();
      }
      const aa=altAz(t.ra,t.dec,time,state.site);
      if(aa.alt>=0){
        const p=project(aa.alt,aa.az,state,L);
        ctx.save();ctx.globalAlpha=targetAlpha;ctx.lineWidth=2.5;ctx.strokeStyle=outline;ctx.fillStyle=color;
        ctx.beginPath();ctx.arc(p.x,p.y,6,0,2*Math.PI);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(p.x-13,p.y);ctx.lineTo(p.x+13,p.y);ctx.moveTo(p.x,p.y-13);ctx.lineTo(p.x,p.y+13);ctx.strokeStyle=color;ctx.stroke();
        if(display.labels !== false){
          ctx.font='bold 14px sans-serif';ctx.textAlign=p.x>L.w*.68?'right':'left';
          const tx=p.x+(p.x>L.w*.68?-13:13),ty=clamp(p.y-13,15,L.h-8);
          ctx.strokeStyle=outline;ctx.lineWidth=4;ctx.strokeText(t.name,tx,ty);ctx.fillText(t.name,tx,ty);
        }
        ctx.restore();
      }
    }
  }

  // Use only the original camera geometry published by ASOTG through the Worker.
  // Never display guessed target positions when no valid calibration is available.
  function validateRemoteCalibration(raw){
    if(!raw || typeof raw!=='object' || Array.isArray(raw))return null;
    const keys=['cx_norm','cy_norm','radius_norm','rotation_deg','horizon_zenith_angle_deg'];
    if(!keys.every(k=>typeof raw[k]==='number'&&finite(raw[k])))return null;
    if(raw.cx_norm<0||raw.cx_norm>1||raw.cy_norm<0||raw.cy_norm>1||
       raw.radius_norm<.02||raw.radius_norm>2||Math.abs(raw.rotation_deg)>360||
       raw.horizon_zenith_angle_deg<15||raw.horizon_zenith_angle_deg>180)return null;
    if(!['equidistant','equisolid','stereographic','orthographic'].includes(raw.projection))return null;
    if(raw.projection==='orthographic'&&raw.horizon_zenith_angle_deg>90)return null;
    if(raw.projection==='stereographic'&&raw.horizon_zenith_angle_deg>=180)return null;
    if(typeof raw.flip_x!=='boolean'||typeof raw.flip_y!=='boolean')return null;
    return Object.fromEntries([...keys.map(k=>[k,raw[k]]),['projection',raw.projection],
                               ['flip_x',raw.flip_x],['flip_y',raw.flip_y]]);
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
  // The Worker is the normal SIMBAD resolver. A local bright-star catalog is
  // a bounded fallback when the external astronomy service is unresponsive.
  // These coordinates were already distributed with the ASOTG sky catalog.
  const BRIGHT_STAR_FALLBACK = {"sirius":[101.287155333,-16.7161158611],"canopus":[95.9879578335,-52.6956613889],"rigil kentaurus":[219.9008500005,-60.8356194444],"arcturus":[213.915300291,19.1824091667],"vega":[279.2347347915,38.7836889444],"capella":[79.172327958,45.9979914722],"rigel":[78.634467084,-8.2016383611],"procyon":[114.825497916,5.2249875556],"betelgeuse":[88.7929390005,7.407064],"achernar":[24.4285228335,-57.2367528056],"hadar":[210.9558556245,-60.3730351667],"altair":[297.6958272915,8.8683211944],"acrux":[186.649563417,-63.0990928611],"aldebaran":[68.980162791,16.5093023611],"antares":[247.351915416,-26.4320026111],"spica":[201.2982473745,-11.1613194722],"pollux":[116.328957792,28.0261988889],"fomalhaut":[344.412692709,-29.6222370278],"deneb":[310.3579797495,45.2803388056],"mimosa":[191.9302865415,-59.688772],"regulus":[152.092962459,11.9672087778],"adara":[104.656453167,-28.9720861667],"castor":[113.6494716255,31.8882822222],"shaula":[263.402167167,-37.1038235556],"gacrux":[187.791498375,-57.1132134444],"bellatrix":[81.282763542,6.3497032778],"elnath":[81.5729713335,28.6074517222],"miaplacidus":[138.2999060835,-69.7172075833],"alnilam":[84.0533889585,-1.2019191389],"alnair":[332.058269709,-46.9609743889],"alioth":[193.507289958,55.9598229722],"mirfak":[51.080708709,49.8611793056],"dubhe":[165.931964667,61.7510346944],"alnitak":[85.1896944165,-1.9425735833],"suhail al muhlif":[122.3831255415,-47.3365863333],"wezen":[107.097850209,-26.3931995833],"kaus australis":[276.042993333,-34.3846164722],"alkaid":[206.885157333,49.3132667222],"sargas":[264.3297077085,-42.997828],"menkalinan":[89.8821788745,44.9474325833],"peacock":[306.4119043755,-56.7350897222],"atria":[252.1662295005,-69.0277118333],"alhena":[99.427960416,16.3992804167],"alsephina":[131.1759440835,-54.70881925],"avior":[125.6284802505,-59.5094841944],"alphard":[141.8968445835,-8.6585995278],"mirzam":[95.6749389585,-17.9559186944],"algieba":[154.9934458335,19.8412583333],"hamal":[31.7933570835,23.4624175556],"diphda":[10.8973787505,-17.9866063056],"polaris":[37.954560666,89.2641089722],"mirach":[17.433016167,35.6205576389],"menkent":[211.6706146665,-36.36995475],"alpheratz":[2.0969161665,29.0904311111],"saiph":[86.939120166,-9.6696049167],"nunki":[283.816360416,-26.2967241111],"rasalhague":[263.7336227085,12.5600373889],"kochab":[222.6763575,74.1555039444],"almach":[30.974804583,42.3297247222],"gruid":[340.666876125,-46.8845764444],"algol":[47.042218542,40.9556466667],"denebola":[177.26490975,14.5720580556],"muhlifain":[190.379333667,-48.9598715278],"alsuhail":[136.998991125,-43.4325909167],"schedar":[10.126837791,56.5373311667],"sador":[305.5570909995,40.2566791667],"eltanin":[269.151541167,51.4888956111],"alphecca":[233.67195,26.7146927778],"naos":[120.896031417,-40.0031478056],"scutulum":[139.2725285835,-59.2752320278],"caph":[2.294521584,59.1497811111],"mizar":[200.981418666,54.9253519722],"kakkab":[220.482315792,-47.38819875],"wei":[252.5408783745,-34.2932315833],"birdun":[204.9719072505,-53.4663911389],"etcen":[218.8767673335,-42.1578252222],"dschubba":[240.083355333,-22.6217064167],"ankaa":[6.5710474995,-42.3059871944],"merak":[165.460318917,56.3824260833],"girtab":[265.62198,-39.0299830833],"izar":[221.246739417,27.0742249722],"enif":[326.0464839165,9.8750086389],"gamma cas":[14.177215416,60.7167402778],"mintaka":[83.001667041,-0.2990951111],"scheat":[345.94357275,28.0827871111],"sabik":[257.594528709,-15.7249066389],"phecda":[178.4576971665,53.6947597222],"aludra":[111.0237595005,-29.3031055],"alderamin":[319.644884709,62.5855744722],"markeb":[140.528406708,-55.0106671389],"markab":[346.190222709,15.2052671389],"gienah cygni":[311.552843166,33.9702569444],"decen":[182.0895735,-50.7224273889],"menkar":[45.569887791,4.0897387778],"zosma":[168.5270892495,20.5237181389],"zecen":[208.884940209,-47.2883745],"han":[249.289746042,-10.5670915278],"arneb":[83.182567167,-17.8222892778],"gienah":[183.9515450415,-17.5419304444],"ascella":[285.653042667,-29.8800633056],"graffias":[241.359299916,-19.8054527778],"zubeneshamali":[229.2517242495,-9.3829144167],"bogardus":[89.9302921665,37.2125846389],"unukalhai":[236.066976291,6.4256286944],"kraz":[188.5968118335,-23.3967603889],"alpha mus":[189.2959078755,-69.1355647778],"phact":[84.912254292,-34.0741097222],"sheratan":[28.660045791,20.8080314722],"kaus media":[275.2485147495,-29.8281016389],"kekouan":[224.633022333,-43.1339638611],"ruchbah":[21.453964458,60.2352840278],"mufrid":[208.6711621665,18.3977207222],"hasseleh":[74.248421208,33.1660995833],"peregrini":[161.692411542,-49.4202567778],"ahadi":[109.2856532505,-37.0974711667],"lesath":[262.6909879995,-37.2958134722],"tarazed":[296.564917875,10.6132613333],"alhakim":[200.149239042,-36.7122901944],"aldhibain":[245.997858084,61.5142138611],"porrima":[190.415181,-1.4493728056],"zubenelgenubi":[222.7196378745,-16.0417765278],"celbalrai":[265.868136042,4.5673043056],"yed prior":[243.5864105415,-3.6943225556],"delta cru":[183.7863197085,-58.7489269167],"vathorz posterior":[160.7391748755,-64.3944502222],"thusia":[233.785201458,-41.1667568611],"kornephoros":[247.5549981255,21.4896113333],"hatsya":[83.858257959,-5.9099009722],"cursa":[76.962439542,-5.0864459722],"behyi":[6.4377931665,-77.2542461111],"vindemiatrix":[195.544157709,10.9591504167],"rutilicus":[250.3215043335,31.6027186944],"alwaid":[262.6081737495,52.3013886944],"kaus borealis":[276.992669667,-25.4216985],"turais":[121.8860367495,-24.3043244167],"tasco":[248.9706368745,-28.2160170833],"alpha tuc":[334.6253949165,-60.2595906389],"deneb algedi":[326.7601843335,-16.1272870833],"hydrus":[29.692477791,-61.5698596667],"nihal":[82.0613464995,-20.7594410556],"algenib":[3.3089634585,15.1835935556],"beara":[261.324951459,-55.5298852222],"betra":[238.7856752505,-63.4307265278],"zeper":[58.5330103335,31.8836336667],"ruc":[296.243660583,45.1308100278],"alcyone":[56.871152292,24.1051356389],"tejat":[95.740111917,22.51358275],"cor caroli":[194.006942583,38.3183761389],"albaldah":[287.440970541,-21.0236139722],"sadalsuud":[322.889715459,-5.5711755556],"gomeisa":[111.787673916,8.2893157778],"epper":[59.463466875,40.0102153333],"gatra":[229.7274249165,-68.6795459444],"alniyat":[245.297148792,-25.5927920833],"fang":[239.7129718335,-26.1141079444],"gaper":[46.199128083,53.50643575],"al rihla":[102.4840352505,-50.6145676944],"sadalmelek":[331.4459833335,-0.31985],"algorab":[187.466063208,-16.51543125],"zaurak":[59.5073622915,-13.5085193889],"ara":[262.9603813755,-49.876145],"matar":[340.7505726255,30.2212450556],"vathorz prior":[146.775507084,-65.0720074167],"minkar":[182.531169084,-22.6197672222],"mebsuta":[100.9830260835,25.1311254167],"ras elased australis":[146.462805417,23.7742557778],"xamidimura":[252.9676296255,-38.0473803889],"maaz":[75.492218541,43.8233071944],"alnasl":[271.45203375,-30.4240898611],"deneb el okab australis":[286.352533416,13.8634772778],"io-1sco":[266.8961713755,-40.1269970278],"betri":[32.3859463335,34.9872970556],"cauda hydrae":[199.730404959,-23.1715142778],"furud":[95.078300166,-30.0633667222],"pherkad":[230.182150167,71.8340165556],"deper":[55.73126775,47.7875485],"aldhanab":[328.4821924995,-37.3648552778],"psuma":[167.4158695005,44.4984866667],"seginus":[218.019465834,38.3082511944],"omi-2cma":[105.756133791,-23.8332923056],"al hecka":[84.4111892505,21.1425441111],"tania australis":[155.5822489995,41.4995191944],"ras algethi":[258.661909083,14.3903406111],"bemus":[191.570017083,-68.1081156667],"nodus ii":[288.138758208,67.6615404444],"zeara":[254.655050709,-55.9901445278],"dabih":[305.2528052505,-14.7813830833],"albireo":[292.6803355005,27.9596800833],"hydrobius":[133.8484422495,5.9455653889],"alind":[309.391800042,-47.2915007222],"sephdar":[274.4068127085,-36.7616851944],"pleura":[162.4062031245,-16.1936488889],"wazn":[87.7399675005,-35.7683097778],"sarin":[258.7579607505,24.8392069722],"ke kwan":[224.790353916,-42.1041963611],"alvashak":[140.263753083,34.3925623611],"talitha":[134.801890083,48.0418261389],"ma ti":[173.945355417,-63.0198420278],"nanto":[281.4141087495,-26.9907762222],"kaimana":[99.440297292,-43.1959333889],"nodus i":[257.196649833,65.7146842778],"sasin":[76.3652723745,-22.3710344167],"hoedus ii":[76.6287223755,41.23447575],"fudail":[258.761809833,36.8091623056],"acamar":[44.565479166,-40.3047305556],"al haud":[143.214307917,51.6773003056],"alcir":[220.6267482495,-64.9751370556],"hilasmus":[230.3430070005,-40.6475205],"tabit":[72.801519666,5.6051034167],"helkath":[254.4170743755,9.3750312778],"brachium":[226.017567,-25.2819612778],"zecyg":[318.234108084,30.2269154722],"alrai":[354.8368813755,77.6322743333],"tseen foo":[302.826108333,-0.821475],"alphirk":[322.1649868755,70.5607151944],"yed posterior":[244.5803739165,-4.6925095833],"tang":[275.327502333,-2.8988268333],"sulaphat":[284.7359267085,32.6895556389],"sipup":[112.3076270415,-43.30143325],"gahyi":[56.8097525835,-74.2389635],"imad":[260.502413958,-24.9995463889],"aldor":[68.499071625,-55.0449789722],"deand":[9.831979917,30.86102175],"skat":[343.6625562915,-15.8208272778],"propus":[93.719404791,22.5067943333],"sataghni":[211.592906208,-26.6823617778],"edasich":[231.232394292,58.9660651111],"mulep":[78.232923666,-16.2054690278],"alpic":[102.047729667,-61.9413891111],"bephe":[16.5209980005,-46.7184106944],"azmidiske":[117.323565291,-24.85978625],"hecatebolus":[286.7350373745,-27.6704219167],"megrez":[183.856502625,57.0326154444],"etsco":[258.038315208,-43.2391918056],"simiram":[153.434239125,-70.0379045278],"gaara":[261.348580458,-56.3777263333],"sinistra":[269.756632959,-9.7736332778],"al-1her":[258.6618874995,14.3903722222],"ensis":[85.6192363335,-2.3971475278],"qcar":[154.2707304165,-61.3323023056],"coxa":[168.560018583,15.4295705833],"kurhah":[332.713653792,58.2012626667],"alret":[63.6061839165,-62.4738588056],"delta aquilae":[291.3745891245,3.1147794722],"alzirr":[101.322351333,12.8955919722],"eplup":[230.6702844165,-44.6896151667],"segin":[28.5988569585,63.6701007778],"auva":[193.9008692085,3.3974703333],"ashlesha":[131.693800959,6.4188015278],"heze":[203.6739375,-0.5959388889],"kabkent secunda":[207.3761518335,-41.6877089167],"gorgona tertia":[46.294141041,38.8402761944],"bepav":[311.2395582915,-66.2032141111],"alagemin":[311.3223981255,61.8387824167],"al jabhah":[151.83313275,16.7626611944],"etlup":[240.0305327505,-38.3967086944],"gaphe":[22.091363625,-43.3182361667],"althaur":[60.1700655,12.4903405278],"phaesula":[67.16558625,15.8708818056],"adhafera":[154.172566542,23.4173116944],"zelup":[228.071233125,-52.09924775],"homam":[340.3655500005,10.8312888889],"ras mutallah":[28.2704462505,29.5788278056],"sheliak":[282.519980208,33.3626694444],"melkarth":[266.6146944585,27.7206771944],"muscida":[127.5661276665,60.7181698611],"al thalimaim anterior":[286.5622457505,-4.88255575],"mucen":[207.4041192915,-42.4737304444],"drus":[119.1946415835,-52.9823527778],"achird":[12.2762112495,57.8151877222],"deneb algenubi":[17.1474645,-10.1822658333],"tania borealis":[154.2740952915,42.9143557778],"tseen ke":[149.215590291,-54.5677886111],"altel":[276.7434001665,-45.9684582778],"epgru":[342.1387430415,-51.3168611389],"kaffaljidhma":[40.825162917,3.2358163889],"gasge":[299.689285959,19.4921466944],"unurgunite":[105.4297824585,-27.9348305],"mupeg":[342.5008047915,24.6015828889],"princeps":[228.875678958,33.3148312778],"alula borealis":[169.619736,33.0943085278],"sofian":[250.724021208,38.9222535833],"tacet":[26.017014084,-15.9374795],"xi-2sgr":[284.4324961665,-21.1066559167],"nehushtan":[264.396665958,-15.3985538889],"nekkar":[225.486509916,40.3905668333],"al tarf":[124.1288375415,9.1855438611],"subra":[145.2876377085,9.8923083889],"zelep":[86.7389206665,-14.8219499722],"wasat":[110.030749083,21.9823160278],"ain":[67.1541617505,19.1804290556],"leiolepis":[237.4050289995,-3.4302043889],"rana":[55.812087,-9.7633912222],"alvahet":[342.420070584,66.2004065556],"xihya":[173.2504793745,-31.8576231944],"pipirima":[253.0839388335,-38.0175349444],"ph-1lup":[230.451540291,-36.2613756944],"deneb kaitos":[4.856975667,-8.82391975],"talitha australis":[135.9063650835,47.1565247222],"biham":[332.5499386665,6.1978632778],"labrum":[169.835198166,-14.77853925],"depav":[302.1817063755,-66.1820676667],"up-4eri":[64.4735933745,-33.7983491389],"nembus":[24.498154125,48.62821375],"al krikab":[116.1118898745,24.3979964444],"pheri":[34.127440125,-51.5121654167],"algedi":[304.513566459,-12.5448523333],"batentaban borealis":[275.264093958,72.7328477222],"etpav":[266.433275208,-64.7238720556],"kebash":[109.5232490415,16.54038625],"uplib":[234.2560425,-28.1350812778],"epsilon cru":[185.340039,-60.4011469722],"hemelein prima":[217.9574567505,30.3714383611],"taori":[79.4016190005,-6.8444083889],"altawk":[21.005855334,-8.1832558889],"bharani":[42.4959718335,27.2605072222],"zavijava":[177.6738259995,1.7647197222],"galep":[86.115795375,-22.4483835556],"atirsagne":[51.2033248335,9.0288746944],"psvel":[142.67499825,-40.4667393333],"nageba":[103.197245292,33.9612548611],"lahya":[152.6469861255,-12.3540816111],"deara":[262.7746363335,-60.6838478333],"demus":[195.5677697505,-71.5488542222],"al pherg":[22.870876083,15.3458245833],"omiand":[345.4802691255,42.3259815],"ze-2sco":[253.645851459,-42.3613168611],"atlas":[57.2905940835,24.05341675],"rotanev":[309.387255417,14.59508875],"xestus":[130.0732730415,-52.9218889444],"88aqr":[347.3616533745,-21.1724114444],"talib":[234.664039584,-29.7777487778],"beind":[313.702511583,-58.4541560556],"prima hyadum":[64.9483493745,15.6276431667],"lamus":[176.4017464995,-66.7287622222],"meissa":[83.784490041,9.9341558611],"thara":[271.657797042,-50.0914756944],"fulu":[9.242850792,53.8969075833],"23uma":[142.882119708,63.0618614722],"chow":[236.546893125,15.4218321944],"nashira":[325.022735334,-16.6623075556],"thuban":[211.0972914585,64.3758505278],"alpyx":[130.8980731665,-33.1863860556],"nusakan":[231.9572147085,29.1057006667],"nulla pambu":[237.7040259165,4.4777308611],"electra":[56.2189036665,24.1133364444],"cheri":[28.989467166,-51.6088979167],"simmah":[349.291406208,3.2822883333],"ka-1lup":[227.983636917,-48.7378247778],"ta-4eri":[49.879176,-21.7578624722],"xiher":[269.441190459,29.2478798611],"alshain":[298.828302333,6.4067618056],"el kophrah":[176.5125586245,47.7794062778],"prijipati":[89.881800042,54.2846584167],"etlep":[89.1012208335,-14.1676996944],"baten kaitos":[27.8651450835,-10.3350358056],"109vir":[221.562189,1.8928845833],"ran":[53.232687333,-9.4582586667],"pi-5ori":[73.562900166,2.4406730833],"xicyg":[316.232759541,43.9278512222],"bemon":[97.2044571255,-7.0330583611],"marakk":[321.6667764165,-22.4113345],"nuoct":[325.369374042,-77.3900434167],"etara":[252.446485542,-59.0413770833],"ga-2vol":[107.1869465835,-70.4989338889],"alradif":[337.292770917,58.4151983056],"al durajah":[266.9731655415,2.7072777778],"grumium":[268.3822067505,56.8726428611],"ushakaron":[51.7922946255,9.7326761944],"haedi":[75.619530792,41.0758388889],"io-2cyg":[292.426494666,51.7297793889],"bevol":[126.434144667,-66.1368902778],"bedor":[83.406322041,-62.4898247778],"secunda hyadum":[65.733718875,17.5425135278],"gaher":[245.4800599995,19.1531282778],"kacyg":[289.275702708,53.3684592778],"allac":[337.8229221255,50.2824911667],"albali":[311.918969166,-9.4957743611],"iopeg":[331.7527748745,25.3451124444],"manubrium":[286.1707573755,-21.7414956944],"qin":[233.700615084,10.538868],"miram":[42.6742066245,55.8954965556],"propus iotgem":[111.431647167,27.7980813611],"ekkhysis":[343.1536433745,-7.5795983889],"alula australis":[169.5455500005,31.5292888889],"mekbuda":[106.027211625,20.5702983056],"zeboo":[220.2872982495,13.7283046389],"alaps":[221.9654667915,-79.0447508889],"sualocin":[309.9095299995,15.91207325],"bazak":[298.118198958,1.0056582222],"al jathiyah":[264.8661920415,46.0063333611],"nuper":[56.298466833,42.5785508056],"kabkent tertia":[209.567778333,-42.1007539722],"misam":[47.374048167,44.8575406389],"muhya":[156.5226095835,-16.8362896944],"upuma":[147.7473208335,59.0387357222],"maculosa":[139.7110159995,36.8025925278],"alrischa":[30.5117488335,2.7637613889],"desge":[296.846927208,18.5342889167],"laand":[354.3910108755,46.4581494444],"theemin":[68.88765975,-30.5623415833],"omiher":[271.8856280415,28.7624910833],"alsct":[278.8017823335,-8.24407025],"atik":[56.0797168335,32.2882480278],"sadalachbia":[335.4140642505,-1.3873341944],"detra":[243.8594574585,-63.6856803333],"tyl":[297.043128333,70.2679303333],"gacrb":[235.6856896245,26.2956346389],"ainalhai":[239.113261209,15.6616168333],"pvel":[159.3255831255,-48.2256208056],"phaeo":[67.143733458,15.9621803889],"fornacis":[48.018864,-28.9876204444],"beret":[56.0498994585,-64.8069058333],"ghusn al zaitun":[95.528451291,-33.4363978611],"delep":[87.8304005415,-20.8790897778],"giansar":[172.850919792,69.3310748889],"polis":[273.440870166,-21.0588316944],"qvel":[153.6839822085,-42.1219425833],"gaaps":[248.362849125,-78.8971492222],"alhor":[63.500476875,-42.2943675556],"bepic":[86.8211987085,-51.0665114444],"iklil":[239.2211509995,-29.2140725556],"maia":[56.456694,24.3677462222],"sceptrum":[69.5451035835,-14.3040166667],"epcol":[82.8031474995,-35.4705202778],"epphe":[2.352673083,-45.7474254167],"azha":[44.1068728335,-8.8981450278],"muand":[14.188383792,38.4993438889],"shir":[158.202798666,9.3065859444],"iogru":[347.589739791,-45.2467124167],"dcen":[202.7610691665,-39.4073052778],"etcyg":[299.076550917,35.083423],"mesarthim":[28.382561625,19.2938552778],"gamus":[188.1167226255,-72.1329888056],"ras elased borealis":[148.1909022495,26.0069533056],"rijl al awwa":[220.765095084,-5.6582035278],"rukbalgethi genubi":[269.06325225,37.2505373056],"thhya":[138.591083625,2.314262],"furibundus":[60.7890819165,5.9892997778],"kacma":[102.460247208,-32.5084784722],"ketu":[188.3705968755,69.7882358333],"zaniah":[184.976475,-0.6667944444],"marfik":[247.72842975,1.9839224722],"picen":[170.251692291,-54.4910181667],"rukbalgethi shemali":[244.9351527495,46.3133645278],"zubenelakrab":[233.881578375,-14.7895355],"iohya":[144.964006041,-1.1428093056],"sicen":[187.009925334,-50.2306353333],"kajam epsher":[255.07239075,30.9264045833],"nueri":[69.0797560005,-3.3524601944],"almon":[115.3118023755,-9.5511308611],"sadalbari":[341.632824417,23.5656544722],"kitalpha":[318.9559663335,5.2478452778],"dephe":[22.812936459,-49.072703],"asellus australis":[131.171246709,18.1543065],"eppav":[300.14814825,-72.9105055],"nucyg":[314.2934127915,41.1671386389],"rukbat":[290.971561791,-40.61593625],"zevol":[115.455254166,-72.6060990556],"chlup":[237.7397428755,-33.6271653611],"nuaur":[87.872501667,39.1484841111],"bepyx":[130.025598459,-35.3083514167],"etcol":[89.786688291,-42.8151339444],"gamon":[93.7138902915,-6.2747744444],"rhcen":[182.9129904165,-52.3684564444],"taper":[43.564421166,52.7624788889],"beemim":[66.009238542,-34.0168483889],"de-1gru":[337.3173950415,-43.4955623611],"jabhat al akrab":[241.701778833,-20.6691917222],"98aqr":[350.742608583,-20.1005823056],"gatuc":[349.3573842495,-58.2357301944],"ta-2aqr":[342.3979232085,-13.5926324167],"alpha vol":[135.611649666,-66.39607575],"devol":[109.207599459,-67.9571523333],"alchiba":[182.1034021665,-24.7288751111],"gatri":[34.328612625,33.8471930556],"tse tseng":[170.981053041,10.5295054167],"mueri":[71.375626584,-3.2546601389],"jabbah":[242.998898667,-19.4607044722],"thdra":[240.4722765,58.5652515556],"zepav":[280.758897,-71.4281129167],"alcor":[201.306407625,54.9879596667],"arkab prior":[290.6595737505,-44.4589571667],"gapyx":[132.6330117495,-27.7098450278],"vernalis":[359.827877667,6.8633211667],"wurren":[17.0961729165,-55.2457580278],"decapoda":[131.6742495,28.7598941667],"bered":[285.420112791,-5.7391148333],"becam":[75.8545401255,60.4422470833],"deneb el okab borealis":[284.905661334,15.0683019722],"epmus":[184.3928215005,-67.9607357222],"ga-2nor":[244.960092792,-50.1555061944],"rhcyg":[323.49522075,45.5918383056],"abyssus aqueus":[30.001288167,-21.0778318333]};
  async function resolveName(name){
    const fallback=BRIGHT_STAR_FALLBACK[name.trim().toLowerCase()];
    const controller=new AbortController();
    // Known bright stars must not leave users waiting for an unavailable remote service.
    const timeoutMs=fallback?5500:22000;
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(`${WORKER_BASE}/api/resolve?name=${encodeURIComponent(name)}`,
                                 {signal:controller.signal,cache:'no-store'});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||`Name resolver HTTP ${response.status}`);
      if(!finite(body.ra)||!finite(body.dec))throw new Error('Resolver returned invalid coordinates');
      return {ra:body.ra,dec:body.dec,name:String(body.name||name),source:body.source||'SIMBAD'};
    }catch(error){
      if(fallback)return {ra:fallback[0],dec:fallback[1],name,source:'ASOTG bright-star catalog (fallback)'};
      if(error.name==='AbortError')throw new Error('Name resolver timed out. Retry or enter J2000 coordinates');
      throw new Error(error.message||'Name resolver unavailable');
    }finally{clearTimeout(timer);}
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
      setMessage(card,'Parsing J2000 coordinates or resolving a name...');
      try{
        const coords=parseCoordinates(q);let obj=null;
        if(coords){
          // Pure local path: NO SIMBAD, Worker, or network request for RA/Dec input.
          obj={ra:coords.ra,dec:coords.dec,name:custom||'Target'};
        }else{
          if(/^[+\-\d:.\s,;]+$/.test(q))throw new Error('Invalid J2000 coordinates. Use HH:MM:SS.ss +/-DD:MM:SS.ss or decimal degrees');
          obj=await resolveName(q);
          if(custom)obj.name=custom;
        }
        const id=`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        state.targets.push({id,ra:obj.ra,dec:obj.dec,name:obj.name.slice(0,70)});
        if(state.targets.length>12)state.targets.shift();
        save(`asotg-web-targets-${state.site}`,state.targets);
        pick(card,'query').value='';pick(card,'custom-name').value='';
        const imageTime=isoTime(state);
        const altitude=imageTime?altAz(obj.ra,obj.dec,imageTime,state.site).alt:null;
        const below=altitude!==null && altitude<0 ? ` The target is currently below the horizon (Alt ${altitude.toFixed(1)}°), so its present marker is not visible.` : '';
        setMessage(card,`Added ${obj.name} (J2000: ${obj.ra.toFixed(5)}°, ${obj.dec.toFixed(5)}°). ${coords?'Coordinates plotted locally, without a SIMBAD request.':`Name resolved by ${obj.source||'SIMBAD'}.`} Past trajectory dashed, future solid. Position is computed at the latest image timestamp.${below}`);
        renderTargets(card,state);draw(card,state);
        if(!state.cal)setMessage(card,'Target saved. Waiting for the ASOTG calibration from Cloudflare before drawing on the photograph.');
      }catch(err){setMessage(card,`Unable to plot: ${err.message}. Names require the Worker resolver. J2000 coordinates work offline.`);}
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
      pick(card,'projection').textContent=state.cal?`${state.cal.projection}, north ${state.cal.rotation_deg.toFixed(1)}°, radius ${state.cal.radius_norm.toFixed(3)} (ASOTG synchronized)`:'Unavailable. Custom targets are not drawn until ASOTG sends calibration.';
      if(!d.online){badge.textContent='OFFLINE';badge.dataset.status='offline';pick(card,'detail').textContent=d.image_available?'Last image retained (not live).':'Waiting for first publication.';}
      else if(!d.camera_connected||!d.capturing){badge.textContent=d.camera_connected?'ONLINE / IDLE':'CAMERA OFF';badge.dataset.status='idle';pick(card,'detail').textContent=d.camera_connected?'ASOTG online, but no recent captures.':'ASOTG online, camera disconnected.';}
      else if(d.simulated){badge.textContent='SIMULATION';badge.dataset.status='simulation';pick(card,'detail').textContent='Simulated stream, not a physical sky observation.';}
      else if(!d.image_recent){badge.textContent='UPLOAD DELAY';badge.dataset.status='idle';pick(card,'detail').textContent='Camera running, public image not updated recently.';}
      else{badge.textContent='LIVE';badge.dataset.status='live';pick(card,'detail').textContent='Camera online and public image recently updated.';}
    }else{
      badge.textContent='UNAVAILABLE';badge.dataset.status='offline';pick(card,'detail').textContent='Public status service unreachable.';
      pick(card,'camera').textContent='Not available';pick(card,'reference').textContent='Not available';
      pick(card,'projection').textContent=state.cal?'Last ASOTG calibration retained while the status service is unavailable':'ASOTG calibration unavailable';
    }
    renderTargets(card,state);draw(card,state);
  }
  async function refresh(card,state){
    if(state.busy)return;state.busy=true;
    try{
      const response=await fetch(`${WORKER_BASE}/api/status/${state.site}?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      state.data=await response.json();
      if(state.view==='annotated'&&!state.data.has_annotated)state.view='clean';
      // Calibration metadata is site-specific and can change while the camera is idle.
      // The Worker may serve a previous frame while ASOTG is offline.
      // Keep the most recently verified ASOTG calibration, never a browser guess.
      const receivedCal=validateRemoteCalibration(state.data.calibration);
      if(receivedCal)state.cal=receivedCal;
    }catch(_){state.data=null;}
    finally{state.busy=false;render(card,state);}
  }
  const themeSelect=pick(root,'theme');
  const loadedTheme=getSaved('asotg-web-theme','original');
  const applyTheme=t=>{if(!['original','light','black','night'].includes(t))t='original';root.dataset.theme=t;if(document.body.classList.contains('asotg-standalone'))document.body.dataset.theme=t;themeSelect.value=t;save('asotg-web-theme',t);for(const c of cards){const s=states.get(c.dataset.asotgSite);if(s)draw(c,s);}};
  themeSelect.addEventListener('change',()=>applyTheme(themeSelect.value));
  for(const card of cards){
    const site=card.dataset.asotgSite;
    const initialTargets=getSaved(`asotg-web-targets-${site}`,[]);
    const state={site,view:'clean',data:null,busy:false,searchBusy:false,overlayEnabled:true,
      targets:Array.isArray(initialTargets)?initialTargets.filter(t=>t&&finite(t.ra)&&finite(t.dec)&&typeof t.name==='string').slice(0,12):[],
      cal:null};
    states.set(site,state);
    setupTargets(card,state);
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

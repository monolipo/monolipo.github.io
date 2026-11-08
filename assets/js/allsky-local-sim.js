/* ASOTG browser-only contingency simulator. No Python, Worker, or private credentials.
   Frozen ASOTG V2.1.2 settings, sky map and 498-star catalog. */
(() => {
'use strict';
const DEG=Math.PI/180, RAD=180/Math.PI, TAU=2*Math.PI;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mod=(v,m)=>((v%m)+m)%m;
const sin=x=>Math.sin(x*DEG),cos=x=>Math.cos(x*DEG);
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const jd=date=>date.getTime()/86400000+2440587.5;
function gmst(date){const d=jd(date)-2451545,T=d/36525;return mod(280.46061837+360.98564736629*d+.000387933*T*T-T*T*T/38710000,360);}
function precess(ra,dec,date){
  const t=(jd(date)-2451545)/36525;
  const zeta=(2306.2181*t+.30188*t*t+.017998*t*t*t)/3600*DEG;
  const z=(2306.2181*t+1.09468*t*t+.018203*t*t*t)/3600*DEG;
  const theta=(2004.3109*t-.42665*t*t-.041833*t*t*t)/3600*DEG;
  const a=ra*DEG,d=dec*DEG;
  const A=Math.cos(d)*Math.sin(a+zeta);
  const B=Math.cos(theta)*Math.cos(d)*Math.cos(a+zeta)-Math.sin(theta)*Math.sin(d);
  const C=Math.sin(theta)*Math.cos(d)*Math.cos(a+zeta)+Math.cos(theta)*Math.sin(d);
  return [mod((Math.atan2(A,B)+z)*RAD,360),Math.asin(clamp(C,-1,1))*RAD];
}
function horizon(ra,dec,date,site,epochJ2000=false){
  if(epochJ2000)[ra,dec]=precess(ra,dec,date);
  const lat=site.lat*DEG,d=dec*DEG,ha=(gmst(date)+site.lon-ra)*DEG;
  const a=Math.asin(clamp(Math.sin(lat)*Math.sin(d)+Math.cos(lat)*Math.cos(d)*Math.cos(ha),-1,1));
  const n=Math.cos(lat)*Math.sin(d)-Math.sin(lat)*Math.cos(d)*Math.cos(ha);
  const e=-Math.cos(d)*Math.sin(ha);
  return {alt_deg:a*RAD,az_deg:mod(Math.atan2(e,n)*RAD,360)};
}
function eclToEq(lon,lat,date){
  const t=(jd(date)-2451545)/36525,ob=(23.439291-0.0130042*t)*DEG;
  const l=lon*DEG,b=lat*DEG;
  const x=Math.cos(b)*Math.cos(l),y=Math.cos(b)*Math.sin(l)*Math.cos(ob)-Math.sin(b)*Math.sin(ob);
  const z=Math.cos(b)*Math.sin(l)*Math.sin(ob)+Math.sin(b)*Math.cos(ob);
  return [mod(Math.atan2(y,x)*RAD,360),Math.asin(clamp(z,-1,1))*RAD];
}
function sunEq(date){
  const t=(jd(date)-2451545)/36525;
  const L=mod(280.46646+36000.76983*t+.0003032*t*t,360);
  const M=mod(357.52911+35999.05029*t-.0001537*t*t,360);
  const C=(1.914602-.004817*t-.000014*t*t)*sin(M)+(.019993-.000101*t)*sin(2*M)+.000289*sin(3*M);
  const omega=125.04-1934.136*t,lon=L+C-.00569-.00478*sin(omega);
  const ob=23.439291-.0130042*t+.00256*cos(omega);
  return {ra:mod(Math.atan2(cos(ob)*sin(lon),cos(lon))*RAD,360),dec:Math.asin(sin(ob)*sin(lon))*RAD,lon,mean_anomaly:M};
}
function kepler(M,e){M=mod(M,360)*DEG;let E=M;for(let i=0;i<8;i++){const q=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));E-=q;if(Math.abs(q)<1e-10)break;}return E;}
function elements(body,d){
  switch(body){
    case 'Mercury':return [48.3313+3.24587e-5*d,7.0047+5e-8*d,29.1241+1.01444e-5*d,.387098,.205635+.559e-9*d,168.6562+4.0923344368*d];
    case 'Venus':return [76.6799+2.46590e-5*d,3.3946+2.75e-8*d,54.8910+1.38374e-5*d,.723330,.006773-1.302e-9*d,48.0052+1.6021302244*d];
    case 'Sun':return [0,0,282.9404+4.70935e-5*d,1,.016709-1.151e-9*d,356.0470+.9856002585*d];
    case 'Mars':return [49.5574+2.11081e-5*d,1.8497-1.78e-8*d,286.5016+2.92961e-5*d,1.523688,.093405+2.516e-9*d,18.6021+.5240207766*d];
    case 'Jupiter':return [100.4542+2.76854e-5*d,1.3030-1.557e-7*d,273.8777+1.64505e-5*d,5.20256,.048498+4.469e-9*d,19.8950+.0830853001*d];
    case 'Saturn':return [113.6634+2.38980e-5*d,2.4886-1.081e-7*d,339.3939+2.97661e-5*d,9.55475,.055546-9.499e-9*d,316.9670+.0334442282*d];
    case 'Uranus':return [74.0005+1.3978e-5*d,.7733+1.9e-8*d,96.6612+3.0565e-5*d,19.18171-1.55e-8*d,.047318+7.45e-9*d,142.5905+.011725806*d];
    case 'Neptune':return [131.7806+3.0173e-5*d,1.7700-2.55e-7*d,272.8461-6.027e-6*d,30.05826+3.313e-8*d,.008606+2.15e-9*d,260.2471+.005995147*d];
  }
  throw Error('Unknown planetary body: '+body);
}
function orbital(body,date){
  const d=jd(date)-2451543.5,[N,i,w,a,e,M]=elements(body,d);
  const E=kepler(M,e),x=a*(Math.cos(E)-e),y=a*Math.sqrt(1-e*e)*Math.sin(E);
  const v=Math.atan2(y,x),r=Math.hypot(x,y),u=v+w*DEG;
  return [r*(cos(N)*Math.cos(u)-sin(N)*Math.sin(u)*cos(i)),
          r*(sin(N)*Math.cos(u)+cos(N)*Math.sin(u)*cos(i)),
          r*Math.sin(u)*sin(i)];
}
function planetEq(body,date){
  const d=jd(date)-2451543.5;
  const sun=orbital('Sun',date),p=orbital(body,date);
  const x=p[0]+sun[0],y=p[1]+sun[1],z=p[2]+sun[2];
  const l=Math.atan2(y,x)*RAD,b=Math.atan2(z,Math.hypot(x,y))*RAD;
  const [ra,dec]=eclToEq(l,b,date);
  return {ra,dec,lon:l};
}
function moonEq(date,sun){
  const d=jd(date)-2451543.5;
  const N=125.1228-.0529538083*d,i=5.1454,w=318.0634+.1643573223*d;
  const e=.0549,M=mod(115.3654+13.0649929509*d,360),E=kepler(M,e);
  const x=60.2666*(Math.cos(E)-e),y=60.2666*Math.sqrt(1-e*e)*Math.sin(E);
  const v=Math.atan2(y,x)*RAD,r=Math.hypot(x,y);
  const lon0=mod(Math.atan2(r*(sin(N)*cos(v+w)+cos(N)*sin(v+w)*cos(i)),r*(cos(N)*cos(v+w)-sin(N)*sin(v+w)*cos(i)))*RAD,360);
  const lat0=Math.asin(clamp(sin(v+w)*sin(i),-1,1))*RAD;
  const Lm=mod(N+w+M,360),Ls=mod(sun.lon,360),D=Lm-Ls,F=Lm-N,Ms=sun.mean_anomaly;
  const corr=-1.274*sin(M-2*D)+.658*sin(2*D)-.186*sin(Ms)-.059*sin(2*M-2*D)-.057*sin(M-2*D+Ms)+.053*sin(M+2*D)+.046*sin(2*D-Ms)+.041*sin(M-Ms)-.035*sin(D)-.031*sin(M+Ms)-.015*sin(2*F-2*D)+.011*sin(M-4*D);
  const bl=-.173*sin(F-2*D)-.055*sin(M-F-2*D)-.046*sin(M+F-2*D)+.033*sin(F+2*D)+.017*sin(2*M+F);
  const lon=lon0+corr,lat=lat0+bl;
  const [ra,dec]=eclToEq(lon,lat,date);
  const phase=clamp((1-Math.cos(mod(lon-sun.lon,360)*DEG))/2,0,1);
  return {ra,dec,lon,illum_frac:phase};
}
function rawPoint(alt,az,w,h,c){
  const theta=(90-alt)*DEG,edge=c.horizon_zenith_angle_deg*DEG;
  let rho;
  switch(c.projection){case'equisolid':rho=Math.sin(theta/2)/Math.sin(edge/2);break;
    case'stereographic':rho=Math.tan(theta/2)/Math.tan(edge/2);break;
    case'orthographic':rho=Math.sin(theta)/Math.sin(edge);break;
    default:rho=theta/edge;}
  const r=Math.min(w,h)*c.radius_norm*rho,a=(az+c.rotation_deg)*DEG;
  let x=-r*Math.sin(a),y=-r*Math.cos(a);
  if(c.flip_x)x=-x;if(c.flip_y)y=-y;
  return [c.cx_norm*w+x,c.cy_norm*h+y];
}
function inversePixel(x,y,w,h,c){
  let dx=x+.5-c.cx_norm*w,dy=y+.5-c.cy_norm*h;
  if(c.flip_x)dx=-dx;if(c.flip_y)dy=-dy;
  const rho=Math.hypot(dx,dy)/(Math.min(w,h)*c.radius_norm),edge=c.horizon_zenith_angle_deg*DEG;
  let theta;
  switch(c.projection){case'equisolid':theta=2*Math.asin(clamp(rho*Math.sin(edge/2),-1,1));break;
    case'stereographic':theta=2*Math.atan(rho*Math.tan(edge/2));break;
    case'orthographic':theta=Math.asin(clamp(rho*Math.sin(edge),-1,1));break;
    default:theta=rho*edge;}
  return {alt:Math.PI/2-theta,az:Math.atan2(-dx,-dy)-c.rotation_deg*DEG,r:rho};
}
function twilightColors(a){
  const mix=(x,y,t)=>x.map((v,i)=>v*(1-t)+y[i]*t);
  if(a>=6)return [[112,183,238],[86,156,224],[176,218,249]];
  if(a>=0){const t=(6-a)/6;return [mix([89,163,230],[54,93,177],t),mix([93,150,215],[85,83,178],t),mix([255,218,137],[255,142,67],t)];}
  if(a>=-3){const t=-a/3;return [mix([50,84,170],[24,44,112],t),mix([86,73,168],[48,41,116],t),mix([245,111,75],[151,69,151],t)];}
  if(a>=-6){const t=(-a-3)/3;return [mix([23,43,105],[14,31,84],t),mix([48,41,116],[24,30,83],t),mix([126,57,142],[61,52,119],t)];}
  if(a>=-12){const t=(-a-6)/6;return [mix([13,30,80],[7,19,61],t),mix([21,29,78],[8,17,53],t),mix([39,44,102],[10,24,70],t)];}
  if(a>=-18){const t=(-a-12)/6;return [mix([7,19,61],[4,13,42],t),mix([8,17,53],[4,11,35],t),mix([8,19,57],[3,9,31],t)];}
  return [[3,12,38],[4,10,31],[2,7,25]];
}
function mapVisibility(a){if(a>=0)return 0;if(a>=-6)return -a/6*.12;if(a>=-12)return .12+(-a-6)/6*.48;if(a>=-18)return .60+(-a-12)/6*.4;return 1;}
function magLimit(a){if(a>=0)return -99;if(a>=-6)return Math.min(5,-1.5+(-a/6)*1.5);if(a>=-12)return (-a-6)/6*2.2;if(a>=-18)return 2.2+(-a-12)/6*1.8;return 5;}
function solarEvents(date,location){
  const center=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
  const start=center-86400000,step=300000,n=864,ev=[];
  let prevDate=new Date(start),prev=horizon(sunEq(prevDate).ra,sunEq(prevDate).dec,prevDate,location).alt_deg;
  for(let i=1;i<=n;i++){
    const t=start+i*step,dd=new Date(t),s=sunEq(dd),a=horizon(s.ra,s.dec,dd,location).alt_deg;
    for(const [level,up,down] of [[0,'sunrise','sunset'],[-18,'astronomical_dawn','astronomical_dusk']]){
      const q=prev-level,r=a-level;
      if((q<0&&r>=0)||(q>=0&&r<0)){
        const crossing=t-step+step*clamp(-q/(r-q),0,1);
        ev.push({t:crossing,type:q<r?up:down});
      }
    }
    prev=a;
  }
  return ev.sort((a,b)=>a.t-b.t);
}
function transitions(events,display){
  const early=(display.sim_landscape_early_darkening_min||0)*60000;
  const factor=clamp(display.sim_landscape_night_factor??1,0,1);
  const result=[];
  for(const e of events){
    if(e.type==='sunset'){
      const twilight=events.find(x=>x.type==='astronomical_dusk'&&x.t>e.t&&x.t<e.t+5*3600000);
      if(!twilight)continue;
      const begin=e.t-early,end=begin+Math.max(1000,twilight.t-begin)*factor;
      result.push({begin,end,from:1,to:0});
    }else if(e.type==='sunrise'){
      const dawn=events.filter(x=>x.type==='astronomical_dawn'&&x.t<e.t&&x.t>e.t-5*3600000).at(-1);
      if(!dawn)continue;
      const end=Math.min(e.t-early,e.t),begin=end-Math.max(1000,end-dawn.t)*factor;
      result.push({begin,end,from:0,to:1});
    }
  }
  return result.sort((a,b)=>a.begin-b.begin);
}
function landscapeBrightness(sky,display,events,date){
  if(!display.sim_landscape_daynight_effect)return 1;
  const tr=transitions(events,display),time=date.getTime();
  let sunlight=tr.length?tr[0].from:(sky.sun.alt_deg>=0?1:0);
  for(const t of tr){
    if(time<t.begin)break;
    if(time>=t.end){sunlight=t.to;continue;}
    const f=smooth((time-t.begin)/Math.max(1,t.end-t.begin));sunlight=t.from+(t.to-t.from)*f;break;
  }
  const floor=clamp(display.sim_landscape_night_floor??0,0,1);
  const base=floor+(1-floor)*sunlight;
  let moon=0;
  if(display.sim_landscape_moonlight&&sky.moon?.alt_deg>0){
    moon=clamp(display.sim_landscape_moonlight_strength??.38,0,1)*sky.moon.illum_frac*Math.pow(Math.sin(sky.moon.alt_deg*DEG),1.25);
  }
  return clamp(Math.max(base,floor+moon),0,1);
}
function glowIntensity(sky,display,events,date){
  if(!display.sim_landscape_antisolar_glow||sky.sun.alt_deg<0)return 0;
  const window=(display.sim_landscape_glow_window_min??30)*60000,time=date.getTime();
  const distances=[];
  for(const ev of events){const d=ev.t-time;
    if(ev.type==='sunset'&&d>=0&&d<=window)distances.push(d);
    else if(ev.type==='sunrise'&&d<=0&&d>=-window)distances.push(-d);
  }
  if(!distances.length)return 0;
  return smooth(1-Math.min(...distances)/window)*clamp(display.sim_landscape_glow_strength??.58,0,1);
}
function skyData(date,loc,stars,con){
  const se=sunEq(date),su={name:'Sun',...horizon(se.ra,se.dec,date,loc)};
  const me=moonEq(date,se),mo={name:'Moon',illum_frac:me.illum_frac,...horizon(me.ra,me.dec,date,loc)};
  const planets=['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'].map(name=>{
    const p=planetEq(name,date);return {name,...horizon(p.ra,p.dec,date,loc)};
  });
  const starPoints=stars.map(st=>({id:st[0],name:st[1],mag:st[4],...horizon(st[2]*15,st[3],date,loc,true)})).filter(s=>s.alt_deg>=-5);
  return {utc:date.toISOString(),sun:su,moon:mo,planets,stars:starPoints,constellations:con,phase:su.alt_deg>=0?'day':su.alt_deg>=-6?'civil':su.alt_deg>=-12?'nautical':su.alt_deg>=-18?'astronomical':'night'};
}
function image(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Cannot load local image asset: '+url));im.src=url;});}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function drawBackground(c,site,sky,cal,display,texture,date){
  const w=c.width,h=c.height,cc=c.getContext('2d'),out=cc.createImageData(w,h),data=out.data;
  const tcan=canvas(texture.width,texture.height),tctx=tcan.getContext('2d',{willReadFrequently:true});
  tctx.drawImage(texture,0,0);const tex=tctx.getImageData(0,0,texture.width,texture.height).data;
  const Twidth=texture.width,Theight=texture.height;
  const sunAlt=sky.sun.alt_deg,colors=twilightColors(sunAlt),strength=display.sim_galaxy_background?clamp(display.sim_galaxy_opacity??.55,0,1)*mapVisibility(sunAlt)*.85:0;
  const lat=site.lat*DEG,sinlat=Math.sin(lat),coslat=Math.cos(lat),lst=gmst(date)+site.lon;
  const sx=rawPoint(clamp(sunAlt,0,8),sky.sun.az_deg,w,h,cal),radius=Math.min(w,h)*cal.radius_norm*1.18;
  const haloStrength=(sunAlt>-13&&sunAlt<10)?clamp(1-Math.abs(sunAlt+1.2)/11.5,0,1):0;
  const ringStrength=(sunAlt>=-5.2&&sunAlt<=0)?clamp(1-Math.abs(sunAlt+1.7)/4.2,0,1):0;
  let k=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=inversePixel(x,y,w,h,cal),a=p.alt,az=p.az,radial=clamp(p.r,0,1);
    let rgb;
    if(a<0){rgb=[2,5,11];}
    else if(radial<.62){const u=clamp(radial/.62,0,1);rgb=colors[0].map((v,i)=>v*(1-u)+colors[1][i]*u);}
    else{const v=clamp((radial-.62)/.38,0,1);rgb=colors[1].map((v,i)=>v*(1-v)+colors[2][i]*v);}
    if(haloStrength){const rr=Math.hypot(x-sx[0],y-sx[1])/radius,halo=Math.exp(-3.2*rr*rr)*haloStrength*.24;
      rgb=rgb.map((v,i)=>v*(1-halo)+[255,130,76][i]*halo);}
    if(ringStrength){const ring=Math.exp(-Math.pow((radial-.89)/.13,2))*ringStrength*.18;
      rgb=rgb.map((v,i)=>v*(1-ring)+[239,109,94][i]*ring);}
    if(strength&&a>=0){
      const sinAlt=Math.sin(a),cosAlt=Math.cos(a),ca=Math.cos(az);
      const dec=Math.asin(clamp(sinAlt*sinlat+cosAlt*coslat*ca,-1,1));
      const ha=Math.atan2(-Math.sin(az)*cosAlt,sinAlt*coslat-cosAlt*sinlat*ca);
      const ra=mod((lst*DEG-ha),TAU),tx=Math.floor(mod(.5-ra/TAU,1)*Twidth)%Twidth;
      const ty=clamp(Math.floor((Math.PI/2-dec)/Math.PI*(Theight-1)),0,Theight-1),idx=(ty*Twidth+tx)*4;
      for(let ch=0;ch<3;ch++)rgb[ch]+=Math.max(0,tex[idx+ch]-7)*strength;
    }
    data[k++]=clamp(rgb[0],0,255);data[k++]=clamp(rgb[1],0,255);data[k++]=clamp(rgb[2],0,255);data[k++]=255;
  }
  cc.putImageData(out,0,0);
}
function landscapeOn(ctx,src,site,sky,cal,display,date,events,w,h){
  const lc=canvas(w,h),lctx=lc.getContext('2d');
  const factor=src.width/(Math.min(w,h)*cal.radius_norm/.485);
  const a=cal.rotation_deg*DEG,co=Math.cos(a),si=Math.sin(a),fx=cal.flip_x?-1:1,fy=cal.flip_y?-1:1;
  const m1=co/factor/fx,m2=-si/factor/fy,m3=si/factor/fx,m4=co/factor/fy;
  const ox=cal.cx_norm*w-m1*src.width/2-m3*src.height/2;
  const oy=cal.cy_norm*h-m2*src.width/2-m4*src.height/2;
  lctx.setTransform(m1,m2,m3,m4,ox,oy);lctx.drawImage(src,0,0);lctx.setTransform(1,0,0,1,0,0);
  const brightness=landscapeBrightness(sky,display,events,date),glow=glowIntensity(sky,display,events,date);
  if(brightness<.9999||glow>0){
    const im=lctx.getImageData(0,0,w,h),data=im.data;
    const anti=(sky.sun.az_deg+180)*DEG;
    const hangle=(display.sim_landscape_glow_angular_width_deg??105)*DEG;
    const inner=display.sim_landscape_glow_inner_radius??.67,fade=display.sim_landscape_glow_fade_width??.7;
    const er=cal.horizon_zenith_angle_deg*DEG;
    let horizonRho=1;
    if(cal.projection==='equisolid')horizonRho=Math.sin(Math.PI/4)/Math.sin(er/2);
    if(cal.projection==='stereographic')horizonRho=Math.tan(Math.PI/4)/Math.tan(er/2);
    if(cal.projection==='orthographic')horizonRho=1/Math.sin(er);
    if(cal.projection==='equidistant')horizonRho=(Math.PI/2)/er;
    const divisor=Math.min(w,h)*cal.radius_norm*horizonRho;
    for(let y=0,k=0;y<h;y++)for(let x=0;x<w;x++,k+=4){
      if(!data[k+3])continue;
      if(brightness<.9999){data[k]*=brightness;data[k+1]*=brightness;data[k+2]*=brightness;}
      if(glow>0){
        let dx=x+.5-cal.cx_norm*w,dy=y+.5-cal.cy_norm*h;
        if(cal.flip_x)dx=-dx;if(cal.flip_y)dy=-dy;
        const az=Math.atan2(-dx,-dy)-cal.rotation_deg*DEG;
        const separation=Math.abs(mod(az-anti+Math.PI,TAU)-Math.PI);
        const angular=smooth(1-separation/Math.max(1e-6,hangle));
        const rad=Math.hypot(dx,dy)/divisor;
        const radial=1-smooth((rad-inner)/Math.max(fade,1e-4));
        const f=clamp(glow*angular*radial,0,1);
        data[k]=data[k]*(1-f)+255*f;data[k+1]=data[k+1]*(1-f)+131*f;data[k+2]=data[k+2]*(1-f)+54*f;
      }
    }
    lctx.putImageData(im,0,0);
  }
  ctx.drawImage(lc,0,0);
}
function renderStars(ctx,sky,cal,w,h){
  const a=sky.sun.alt_deg,limit=magLimit(a);
  for(const st of sky.stars){if(st.alt_deg<0||st.mag>limit)continue;
    const [x,y]=rawPoint(st.alt_deg,st.az_deg,w,h,cal);if(x<0||y<0||x>=w||y>=h)continue;
    const r=clamp(1+(4-st.mag)*.48,1,4.2);
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle='rgb(242 245 244)';ctx.fill();
  }
  if(a<4)for(const b of [sky.moon,...sky.planets])if(b?.alt_deg>=0){
    const [x,y]=rawPoint(b.alt_deg,b.az_deg,w,h,cal);if(x<0||y<0||x>=w||y>=h)continue;
    ctx.beginPath();ctx.arc(x,y,b.name==='Moon'?5:3,0,TAU);ctx.fillStyle='rgb(236 226 199)';ctx.fill();
  }
  if(sky.sun.alt_deg>=0){const [x,y]=rawPoint(sky.sun.alt_deg,sky.sun.az_deg,w,h,cal);
    ctx.beginPath();ctx.arc(x,y,13,0,TAU);ctx.fillStyle='rgb(255 240 166)';ctx.fill();}
}
function drawPath(ctx,points,c,w,h,stroke,width){
  ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();let last=null;
  for(const p of points){if(p.alt_deg<0||p.alt_deg>90){last=null;continue;}
    const xy=rawPoint(p.alt_deg,p.az_deg,w,h,c);
    if(last&&Math.hypot(xy[0]-last[0],xy[1]-last[1])<w*.3){ctx.moveTo(last[0],last[1]);ctx.lineTo(xy[0],xy[1]);}
    last=xy;
  }ctx.stroke();
}
function annotations(ctx,sky,cal,display,location,w,h){
  ctx.save();ctx.globalAlpha=clamp(display.opacity??.75,0,1);
  const path=(ps,color,width=2)=>drawPath(ctx,ps,cal,w,h,color,width);
  if(display.altaz_grid){for(const alt of [20,40,60,80])path(Array.from({length:61},(_,i)=>({alt_deg:alt,az_deg:i*6})),'#82aac8',1);for(let az=0;az<360;az+=30)path(Array.from({length:31},(_,i)=>({alt_deg:i*3,az_deg:az})),'#82aac8',1);}
  if(display.equatorial_grid){for(let ra=0;ra<24;ra+=3)path(Array.from({length:61},(_,i)=>{const d=-90+i*3;return horizon(ra*15,d,new Date(sky.utc),location,true);}), '#82aac8',1);
    for(const dec of [-60,-30,0,30,60])path(Array.from({length:97},(_,i)=>horizon(i*.25*15,dec,new Date(sky.utc),location,true)), '#82aac8',1);}
  if(display.ecliptic){const date=new Date(sky.utc);path(Array.from({length:121},(_,i)=>{const eq=eclToEq(i*3,0,date);return horizon(eq[0],eq[1],date,location);}), '#ffce4e',2);}
  if(display.galactic_plane){const date=new Date(sky.utc);path(Array.from({length:121},(_,i)=>{
    const l=i*3*DEG,b=0,gl=Math.cos(l),gm=Math.sin(l);
    // IAU J2000 galactic to equatorial rotation transpose.
    const x=-.05487556*gl+.49410943*gm,y=-.87343709*gl-.44482963*gm,z=-.48383502*gl+.74698224*gm;
    return horizon(mod(Math.atan2(y,x)*RAD,360),Math.asin(clamp(z,-1,1))*RAD,date,location,true);
  }), '#a97cff',3);}
  if(display.horizon)path(Array.from({length:361},(_,i)=>({alt_deg:0,az_deg:i})), '#ffcf44',2);
  if(display.constellations){const st=new Map(sky.stars.map(s=>[s.id,s]));ctx.strokeStyle='#6ab4ff';ctx.lineWidth=1;for(const [,a,b] of sky.constellations){const p=st.get(a),q=st.get(b);if(!p||!q||p.alt_deg<0||q.alt_deg<0)continue;const [x,y]=rawPoint(p.alt_deg,p.az_deg,w,h,cal),[u,v]=rawPoint(q.alt_deg,q.az_deg,w,h,cal);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(u,v);ctx.stroke();}}
  if(display.stars)for(const st of sky.stars){if(st.alt_deg<0||st.mag>(display.star_limit??3.5))continue;const [x,y]=rawPoint(st.alt_deg,st.az_deg,w,h,cal);ctx.fillStyle='#eef2ff';ctx.beginPath();ctx.arc(x,y,clamp(3-st.mag/2,1,5),0,TAU);ctx.fill();if(display.labels&&st.mag<1.3){ctx.font='12px sans-serif';ctx.fillText(st.name,x+5,y-12);}}
  for(const [body,color,radius] of [[sky.sun,'#ffc02d',7],[sky.moon,'#d5e3ff',6],...sky.planets.map(p=>[p,'#ffab6b',4])]){
    if(!body||body.alt_deg<0||display[body.name.toLowerCase()]===false||body.name!=='Sun'&&body.name!=='Moon'&&!display.planets)continue;
    const [x,y]=rawPoint(body.alt_deg,body.az_deg,w,h,cal);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,radius,0,TAU);ctx.stroke();if(display.labels){ctx.fillStyle=color;ctx.font='13px sans-serif';ctx.fillText(body.name,x+12,y-12);}
  }
  if(display.cardinals)for(const [az,s] of [[0,'N'],[90,'E'],[180,'S'],[270,'W']]){const [x,y]=rawPoint(0,az,w,h,cal);ctx.fillStyle='#ffdc76';ctx.font='bold 15px sans-serif';ctx.fillText(s,x+3,y+3);}
  if(display.show_crosshair){const [x,y]=rawPoint(90,0,w,h,cal);ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke();}
  ctx.restore();
  ctx.fillStyle='rgba(0,0,0,.62)';ctx.fillRect(0,0,w,38);ctx.fillStyle='#ffdb6e';ctx.font='14px sans-serif';
  ctx.fillText(`ASOTG browser simulation | ${sky.utc.slice(0,19)} UTC | ${sky.phase.toUpperCase()} | SIMULATED`,14,25);
}
class LocalSimulation{
  constructor(site){this.siteId=site;this.ready=false;this.frame=null;this.latest=null;this.eventsKey='';}
  async init(){if(this.ready)return;
    const base='/assets/allsky-sim/';
    const [config,catalog,landscape,texture]=await Promise.all([
      fetch(base+'simulation-config.json').then(r=>{if(!r.ok)throw Error('Simulation profile missing');return r.json()}),
      fetch(base+'stars.json').then(r=>{if(!r.ok)throw Error('Star catalog missing');return r.json()}),
      image(base+`landscape_${this.siteId}.png`),image(base+'sky_texture_equatorial.jpg')]);
    this.profile=config.sites[this.siteId];if(!this.profile)throw Error('Missing observatory profile: '+this.siteId);
    this.catalog=catalog;this.landscape=landscape;this.texture=texture;
    this.frame=canvas(1280,720);this.back=canvas(640,360);
    this.ready=true;
  }
  render(date=new Date()){
    if(!this.ready)throw Error('Simulation assets are not initialized');
    const {calibration:cal,display:d,location:loc}=this.profile;
    const sky=skyData(date,loc,this.catalog.stars,this.catalog.constellations);
    const key=`${this.siteId}:${date.toISOString().slice(0,10)}`;
    if(this.eventsKey!==key){this.events=solarEvents(date,loc);this.eventsKey=key;}
    drawBackground(this.back,loc,sky,cal,d,this.texture,date);
    const ctx=this.frame.getContext('2d');ctx.clearRect(0,0,1280,720);ctx.drawImage(this.back,0,0,1280,720);
    renderStars(ctx,sky,cal,1280,720);
    if(d.landscape)landscapeOn(ctx,this.landscape,loc,sky,cal,d,date,this.events,1280,720);
    ctx.fillStyle='rgb(0 0 0)';ctx.fillRect(12,680,308,32);ctx.fillStyle='rgb(255 185 60)';ctx.font='14px sans-serif';ctx.fillText('SIMULATION  |  NO CAMERA DATA',22,701);
    this.latest={date,sky,cal,display:d,loc};
    return {canvas:this.frame,sky,calibration:cal,display:d,utc:date.toISOString()};
  }
  annotatedCanvas(){if(!this.latest)return null;
    const c=canvas(1280,720),ctx=c.getContext('2d');ctx.drawImage(this.frame,0,0);
    const q=this.latest;annotations(ctx,q.sky,q.cal,q.display,q.loc,1280,720);return c;
  }
}
window.ASOTGLocalSimulation={create:site=>new LocalSimulation(site),getSun:(date,loc)=>{const s=sunEq(date);return horizon(s.ra,s.dec,date,loc);},horizon,rawPoint};
})();

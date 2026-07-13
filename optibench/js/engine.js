import { add, sub, mul, len, norm, dot, perp, clamp } from './math.js';
import {
  emitSource, intersectElement, interactElement, getSegment, getPrismPolygon,
  conicPoints, conicSegments, getHandles, hitTestElement, getAxis, getTangent, normalizeElement
} from './elements.js';
import { wavelengthToRgb } from './physics.js';

export class OpticalEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = [];
    this.selectedId = null;
    this.camera = { zoom: 5.4, panX: 0, panY: 0 };
    this.settings = { showGrid:true, showLabels:true, densityMode:false, showNormals:false, quality:'normal' };
    this.traceSegments = [];
    this.detectors = new Map();
    this.stats = { rays:0, segments:0, terminated:0 };
    this.dirtyTrace = true;
    this.dirtyDraw = true;
    this.onTraceComplete = null;
    this._raf = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.requestDraw();
  }

  setScene(scene) {
    this.scene = scene.map(normalizeElement);
    this.selectedId = null;
    this.invalidateTrace();
  }

  invalidateTrace() {
    this.dirtyTrace = true;
    this.requestDraw();
  }

  requestDraw() {
    this.dirtyDraw = true;
    if (!this._raf) this._raf = requestAnimationFrame(() => {
      this._raf = null;
      if (this.dirtyTrace) this.trace();
      if (this.dirtyDraw) this.draw();
    });
  }

  trace() {
    this.dirtyTrace = false;
    this.traceSegments = [];
    this.detectors = new Map();
    for (const el of this.scene) {
      if (el.type === 'detector') {
        const pixels = clamp(Math.round(Number(el.pixels || 256)), 8, 8192);
        this.detectors.set(el.id, { element:el, spatial:new Float64Array(pixels), hits:[], total:0 });
      }
    }

    const quality = this.settings.quality;
    const maxDepth = quality === 'high' ? 32 : quality === 'fast' ? 14 : 24;
    const maxQueue = quality === 'high' ? 180000 : quality === 'fast' ? 40000 : 90000;
    const minIntensity = quality === 'high' ? 2e-8 : 1e-7;
    const far = Math.max(600, Math.hypot(this.width, this.height) / Math.max(this.camera.zoom, 0.1) * 1.8);
    const queue = [];
    for (const el of this.scene) if (el.type === 'source') queue.push(...emitSource(el, quality));
    const initialCount = queue.length;
    let qi = 0;
    let terminated = 0;

    const context = {
      recordDetector: (element, coord, wavelength, transportIntensity, point, ray) => {
        const rec = this.detectors.get(element.id);
        if (!rec || transportIntensity <= 0) return;
        const u = coord / Number(element.length) + 0.5;
        const idx = Math.floor(u * rec.spatial.length);
        if (idx >= 0 && idx < rec.spatial.length) {
          const brightness=ray?.imageMeta ? Math.max(0,Number(ray.imageMeta.brightness||0)) : 1;
          const intensity=transportIntensity*brightness;
          rec.spatial[idx] = Math.min(Number(element.saturation || Infinity), rec.spatial[idx] + intensity);
          rec.total += intensity;
          rec.hits.push({ coord, wavelength, intensity, transportIntensity, point:{...point}, pixel:idx,
            sourceId:ray?.sourceId||null,imageMeta:ray?.imageMeta?{...ray.imageMeta}:null });
        }
      }
    };

    while (qi < queue.length && qi < maxQueue) {
      const ray = queue[qi++];
      if (ray.depth > maxDepth || ray.intensity < minIntensity) { terminated++; continue; }
      let nearest = null;
      let nearestElement = null;
      for (const el of this.scene) {
        if (el.type === 'source') continue;
        const hit = intersectElement(el, ray);
        if (!hit) continue;
        if (el.id === ray.lastElementId && hit.t < 0.002) continue;
        if (!nearest || hit.t < nearest.t) { nearest = hit; nearestElement = el; }
      }
      if (!nearest) {
        const end = add(ray.pos, mul(ray.dir, far));
        this.traceSegments.push({ a:{...ray.pos}, b:end, wavelength:ray.wavelength, intensity:displayRayIntensity(ray), terminal:true });
        terminated++;
        continue;
      }
      this.traceSegments.push({ a:{...ray.pos}, b:{...nearest.point}, wavelength:ray.wavelength, intensity:displayRayIntensity(ray), elementId:nearestElement.id });
      const outs = interactElement(nearestElement, ray, nearest, context) || [];
      for (const out of outs) {
        if (!out || out.intensity < minIntensity || !Number.isFinite(out.dir.x) || !Number.isFinite(out.dir.y)) continue;
        out.pos = add(nearest.point, mul(out.dir, 0.002));
        queue.push(out);
      }
    }
    this.stats = { rays:initialCount, segments:this.traceSegments.length, terminated, queued:queue.length };
    this.dirtyDraw = true;
    if (this.onTraceComplete) this.onTraceComplete(this);
  }

  worldToScreen(p) {
    return {
      x: this.width/2 + this.camera.panX + p.x*this.camera.zoom,
      y: this.height/2 + this.camera.panY + p.y*this.camera.zoom
    };
  }

  screenToWorld(p) {
    return {
      x: (p.x - this.width/2 - this.camera.panX)/this.camera.zoom,
      y: (p.y - this.height/2 - this.camera.panY)/this.camera.zoom
    };
  }

  zoomAt(screenPoint, factor) {
    const before = this.screenToWorld(screenPoint);
    this.camera.zoom = clamp(this.camera.zoom*factor, 0.35, 60);
    const after = this.worldToScreen(before);
    this.camera.panX += screenPoint.x-after.x;
    this.camera.panY += screenPoint.y-after.y;
    this.requestDraw();
  }

  pan(dx,dy) { this.camera.panX += dx; this.camera.panY += dy; this.requestDraw(); }

  fitScene(padding=35) {
    if (!this.scene.length) { this.camera={zoom:5.4,panX:0,panY:0}; this.requestDraw(); return; }
    const pts=[];
    for(const el of this.scene) {
      if(el.type==='prism') pts.push(...getPrismPolygon(el));
      else if(el.type==='conicMirror') pts.push(...conicPoints(el,40));
      else {
        const h=getHandles(el); pts.push(...h,{x:el.x,y:el.y});
      }
    }
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of pts){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    const w=Math.max(10,maxX-minX),h=Math.max(10,maxY-minY);
    this.camera.zoom=clamp(Math.min((this.width-padding*2)/w,(this.height-padding*2)/h),0.35,40);
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    this.camera.panX=-cx*this.camera.zoom;
    this.camera.panY=-cy*this.camera.zoom;
    this.requestDraw();
  }

  findElementAt(worldPoint, tolerancePx=8) {
    const tol=tolerancePx/this.camera.zoom;
    for(let i=this.scene.length-1;i>=0;i--) if(hitTestElement(this.scene[i],worldPoint,tol)) return this.scene[i];
    return null;
  }

  findHandleAt(worldPoint, tolerancePx=9) {
    const el=this.scene.find(e=>e.id===this.selectedId);
    if(!el) return null;
    const handles=getHandles(el);
    const tol=tolerancePx/this.camera.zoom;
    for(let i=0;i<handles.length;i++) if(len(sub(worldPoint,handles[i]))<=tol) return {element:el,index:i,point:handles[i],other:handles[1-i]};
    return null;
  }

  draw() {
    this.dirtyDraw=false;
    const ctx=this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.clearRect(0,0,this.width,this.height);
    if(this.settings.showGrid) this.drawGrid(ctx);
    this.drawRays(ctx);
    for(const el of this.scene) this.drawElement(ctx,el,el.id===this.selectedId);
    ctx.restore();
  }

  drawGrid(ctx) {
    const zoom=this.camera.zoom;
    const steps=[0.1,0.2,0.5,1,2,5,10,20,50,100,200];
    let step=steps.find(s=>s*zoom>=34) || 500;
    const major=step*5;
    const left=this.screenToWorld({x:0,y:0}).x;
    const right=this.screenToWorld({x:this.width,y:0}).x;
    const top=this.screenToWorld({x:0,y:0}).y;
    const bottom=this.screenToWorld({x:0,y:this.height}).y;
    ctx.lineWidth=1;
    for(let x=Math.floor(left/step)*step;x<=right;x+=step){
      const s=this.worldToScreen({x,y:0}).x;
      const isMajor=Math.abs(x/major-Math.round(x/major))<1e-6;
      ctx.strokeStyle=isMajor?'rgba(120,155,180,.18)':'rgba(100,130,155,.075)';
      ctx.beginPath();ctx.moveTo(s,0);ctx.lineTo(s,this.height);ctx.stroke();
      if(isMajor){ctx.fillStyle='rgba(155,180,200,.55)';ctx.font='10px system-ui';ctx.fillText(`${trimNum(x)} mm`,s+3,13);}
    }
    for(let y=Math.floor(top/step)*step;y<=bottom;y+=step){
      const s=this.worldToScreen({x:0,y}).y;
      const isMajor=Math.abs(y/major-Math.round(y/major))<1e-6;
      ctx.strokeStyle=isMajor?'rgba(120,155,180,.18)':'rgba(100,130,155,.075)';
      ctx.beginPath();ctx.moveTo(0,s);ctx.lineTo(this.width,s);ctx.stroke();
      if(isMajor){ctx.fillStyle='rgba(155,180,200,.55)';ctx.font='10px system-ui';ctx.fillText(`${trimNum(y)} mm`,3,s-3);}
    }
    const origin=this.worldToScreen({x:0,y:0});
    ctx.strokeStyle='rgba(100,199,255,.26)';
    ctx.beginPath();ctx.moveTo(origin.x-7,origin.y);ctx.lineTo(origin.x+7,origin.y);ctx.moveTo(origin.x,origin.y-7);ctx.lineTo(origin.x,origin.y+7);ctx.stroke();
  }

  drawRays(ctx) {
    if(!this.traceSegments.length) return;
    let maxI=0;
    for(const s of this.traceSegments) maxI=Math.max(maxI,s.intensity);
    maxI=maxI||1;
    ctx.lineCap='round';
    ctx.globalCompositeOperation=this.settings.densityMode?'lighter':'source-over';
    for(const seg of this.traceSegments) {
      const a=this.worldToScreen(seg.a),b=this.worldToScreen(seg.b);
      const rel=Math.sqrt(clamp(seg.intensity/maxI,0,1));
      const alpha=this.settings.densityMode ? clamp(0.018+0.16*rel,0.02,0.18) : clamp(0.12+0.72*rel,0.08,0.86);
      ctx.strokeStyle=wavelengthToRgb(seg.wavelength,alpha);
      ctx.lineWidth=this.settings.densityMode?1.1:1.25;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.globalCompositeOperation='source-over';
  }

  drawElement(ctx,el,selected) {
    const color=selected?'#62c7ff':'#d3dfeb';
    const muted=selected?'rgba(98,199,255,.25)':'rgba(180,205,225,.12)';
    ctx.save();
    ctx.lineCap='round';ctx.lineJoin='round';
    if(el.type==='source') this.drawSource(ctx,el,color);
    else if(el.type==='mirror') this.drawMirror(ctx,el,color);
    else if(el.type==='conicMirror') this.drawConicMirror(ctx,el,color);
    else if(el.type==='lens') this.drawLens(ctx,el,color);
    else if(el.type==='prism') this.drawPrism(ctx,el,color,muted);
    else if(el.type==='gratingR'||el.type==='gratingT') this.drawGrating(ctx,el,color);
    else if(el.type==='slit') this.drawSlit(ctx,el,color,false);
    else if(el.type==='mirrorSlit') this.drawSlit(ctx,el,color,true);
    else if(el.type==='blocker') this.drawBlocker(ctx,el,color);
    else if(el.type==='splitter') this.drawSplitter(ctx,el,color);
    else if(el.type==='dichroic') this.drawDichroic(ctx,el,color);
    else if(el.type==='detector') this.drawDetector(ctx,el,color);
    if(this.settings.showNormals && el.type!=='source' && el.type!=='prism' && el.type!=='conicMirror') this.drawNormal(ctx,el);
    if(selected) this.drawSelection(ctx,el);
    if(this.settings.showLabels) this.drawLabel(ctx,el,selected);
    ctx.restore();
  }

  lineWorld(ctx,a,b,width=2,stroke='#fff') { const A=this.worldToScreen(a),B=this.worldToScreen(b);ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke(); }

  drawSource(ctx,el,color){
    const seg=getSegment(el);
    if(el.contentType==='image') {
      this.lineWorld(ctx,seg.a,seg.b,5,el.enabled?'#ffcf70':'#727b84');
      const cols=Array.isArray(el.imageColumnRGB)?el.imageColumnRGB:[];
      if(cols.length){
        const n=Math.min(28,cols.length),t=seg.tangent;
        const displayWidth=Number(el.imageGeometry==='astronomical'?el.aperture:el.imageWidth)||1;
        for(let i=0;i<n;i++){
          const rgb=cols[Math.round(i*(cols.length-1)/Math.max(1,n-1))]||[1,1,1];
          const p=add(seg.a,mul(t,(i+.5)*displayWidth/n));
          const q=add(p,mul(t,displayWidth/n*.82));
          const stroke=`rgb(${Math.round(rgb[0]*255)},${Math.round(rgb[1]*255)},${Math.round(rgb[2]*255)})`;
          this.lineWorld(ctx,p,q,2.2,stroke);
        }
      }
    } else this.lineWorld(ctx,seg.a,seg.b,3,el.enabled?'#ffe774':'#727b84');
    const c=this.worldToScreen({x:el.x,y:el.y});const axis=getAxis(el);const tip=this.worldToScreen(add({x:el.x,y:el.y},mul(axis,8)));
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
    drawArrowHead(ctx,tip,c,5,color);
    ctx.fillStyle=el.contentType==='image'?'#ffb85c':'#ffe774';ctx.beginPath();ctx.arc(c.x,c.y,4,0,Math.PI*2);ctx.fill();
  }
  drawMirror(ctx,el,color){ const s=getSegment(el);this.lineWorld(ctx,s.a,s.b,4,color);this.drawBackHatch(ctx,s,'#6e7f8e'); }
  drawConicMirror(ctx,el,color){
    ctx.strokeStyle=color;ctx.lineWidth=4;ctx.lineCap='round';
    for(const segment of conicSegments(el,140)) {
      const pts=segment.map(p=>this.worldToScreen(p));
      ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
    }
    ctx.lineCap='butt';
  }
  drawLens(ctx,el,color){
    const s=getSegment(el),A=this.worldToScreen(s.a),B=this.worldToScreen(s.b),C=this.worldToScreen({x:el.x,y:el.y});
    const axis=getAxis(el);const bulge=Math.sign(Number(el.focalLength)||1)*6;const q1=this.worldToScreen(add({x:el.x,y:el.y},mul(axis,bulge)));
    ctx.strokeStyle='#7de7ff';ctx.lineWidth=2.4;ctx.fillStyle='rgba(80,200,240,.12)';
    ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.quadraticCurveTo(q1.x,q1.y,B.x,B.y);ctx.quadraticCurveTo(2*C.x-q1.x,2*C.y-q1.y,A.x,A.y);ctx.fill();ctx.stroke();
  }
  drawPrism(ctx,el,color,fill){ const pts=getPrismPolygon(el).map(p=>this.worldToScreen(p));ctx.fillStyle='rgba(92,203,255,.13)';ctx.strokeStyle='#83dcff';ctx.lineWidth=2;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke(); }
  drawGrating(ctx,el,color){
    const s=getSegment(el);this.lineWorld(ctx,s.a,s.b,3,el.type==='gratingR'?'#f0c7ff':'#b8ebff');
    const t=norm(sub(s.b,s.a)),n=perp(t);for(let i=-4;i<=4;i++){const p=add({x:el.x,y:el.y},mul(t,i*(Number(el.length)/10)));this.lineWorld(ctx,add(p,mul(n,-1.3)),add(p,mul(n,1.3)),1,'#8f6ca2');}
  }
  drawSlit(ctx,el,color,mirrored=false){
    const s=getSegment(el),t=s.tangent,c={x:el.x,y:el.y},gap=Math.min(Number(el.length),Math.max(0,Number(el.slitWidth)));
    const blade=mirrored?'#dbe8f2':'#87919b';
    this.lineWorld(ctx,s.a,add(c,mul(t,-gap/2)),6,blade);this.lineWorld(ctx,add(c,mul(t,gap/2)),s.b,6,blade);
    if(mirrored){
      const left={a:s.a,b:add(c,mul(t,-gap/2)),tangent:t,axis:s.axis};
      const right={a:add(c,mul(t,gap/2)),b:s.b,tangent:t,axis:s.axis};
      this.drawBackHatch(ctx,left,'#657a8c');this.drawBackHatch(ctx,right,'#657a8c');
    }
    const C=this.worldToScreen(c);ctx.fillStyle=mirrored?'#72dcff':'#b6ff68';ctx.fillRect(C.x-2,C.y-2,4,4);
  }
  drawBlocker(ctx,el,color){const s=getSegment(el);this.lineWorld(ctx,s.a,s.b,7,'#7d8790');this.drawBackHatch(ctx,s,'#3f4a55');}
  drawSplitter(ctx,el,color){const s=getSegment(el);this.lineWorld(ctx,s.a,s.b,4,'rgba(170,226,255,.75)');this.lineWorld(ctx,s.a,s.b,1,'#effbff');}
  drawDichroic(ctx,el,color){const s=getSegment(el);this.lineWorld(ctx,s.a,s.b,5,'rgba(202,125,255,.65)');this.lineWorld(ctx,s.a,s.b,1,'#ffd1ff');}
  drawDetector(ctx,el,color){
    const s=getSegment(el);this.lineWorld(ctx,s.a,s.b,6,'#86ff9d');
    const t=s.tangent;for(let i=-4;i<=4;i++){const p=add({x:el.x,y:el.y},mul(t,i*Number(el.length)/9));const n=s.axis;this.lineWorld(ctx,add(p,mul(n,-.8)),add(p,mul(n,.8)),1,'#143a20');}
  }
  drawBackHatch(ctx,s,color){const t=s.tangent,n=s.axis;for(let i=-3;i<=3;i++){const p=add(mul(add(s.a,s.b),.5),mul(t,i*len(sub(s.b,s.a))/8));this.lineWorld(ctx,p,add(p,mul(add(n,mul(t,.35)),2)),1,color);}}
  drawNormal(ctx,el){const c={x:el.x,y:el.y},n=getAxis(el);this.lineWorld(ctx,add(c,mul(n,-6)),add(c,mul(n,6)),1,'rgba(255,255,255,.26)');}
  drawSelection(ctx,el){
    const c=this.worldToScreen({x:el.x,y:el.y});ctx.strokeStyle='rgba(98,199,255,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(c.x,c.y,8,0,Math.PI*2);ctx.stroke();
    for(const p of getHandles(el)){const s=this.worldToScreen(p);ctx.fillStyle='#0c1118';ctx.strokeStyle='#62c7ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  }
  drawLabel(ctx,el,selected){const p=this.worldToScreen({x:el.x,y:el.y});ctx.font='11px system-ui';ctx.fillStyle=selected?'#dff6ff':'rgba(210,225,238,.82)';ctx.fillText(el.name||el.type,p.x+9,p.y-9);}

  getDetectorRecord(id) { return this.detectors.get(id) || null; }
}

function displayRayIntensity(ray){return ray.intensity*(ray.imageMeta?Math.max(0,Number(ray.imageMeta.brightness||0)):1);}

function drawArrowHead(ctx,tip,tail,size,color){const d=norm({x:tip.x-tail.x,y:tip.y-tail.y}),p=perp(d);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-d.x*size+p.x*size*.65,tip.y-d.y*size+p.y*size*.65);ctx.lineTo(tip.x-d.x*size-p.x*size*.65,tip.y-d.y*size-p.y*size*.65);ctx.closePath();ctx.fill();}
function trimNum(v){return Math.abs(v)>=100?Math.round(v).toString():Number(v.toFixed(2)).toString();}

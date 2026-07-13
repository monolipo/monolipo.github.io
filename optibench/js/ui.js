import { getMeta, getSchema } from './elements.js';
import { wavelengthToRgb, wavelengthToRgbComponents, formatWavelength, rgbSpectralWeight } from './physics.js';
import { clamp } from './math.js';

export class InspectorUI {
  constructor(engine, hooks={}) {
    this.engine=engine;
    this.hooks=hooks;
    this.title=document.getElementById('selectedTitle');
    this.subtitle=document.getElementById('selectedSubtitle');
    this.panel=document.getElementById('propertyPanel');
    this.deleteBtn=document.getElementById('deleteBtn');
    this.duplicateBtn=document.getElementById('duplicateBtn');
    this.detectorCanvas=document.getElementById('detectorCanvas');
    this.detectorCtx=this.detectorCanvas.getContext('2d');
    this.detectorSummary=document.getElementById('detectorSummary');
    this.detectorSelect=document.getElementById('detectorSelect');
    this.exportBtn=document.getElementById('exportCsvBtn');
    this.exportPngBtn=document.getElementById('exportPngBtn');
    this.detectorMode='spatial';
    this.activeDetectorId=null;
    this.imageCache=new Map();
    this.imageRenderToken=0;
    this.lastCCDCanvas=null;
    this.detectorSelect.addEventListener('change',()=>{
      this.activeDetectorId=this.detectorSelect.value||null;
      this.drawDetector();
    });
    document.querySelectorAll('.detector-tab').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('.detector-tab').forEach(b=>b.classList.toggle('active',b===btn));
      this.detectorMode=btn.dataset.mode;
      this.drawDetector();
    }));
  }

  get selected() { return this.engine.scene.find(e=>e.id===this.engine.selectedId) || null; }

  refresh() {
    const el=this.selected;
    this.deleteBtn.disabled=!el;
    this.duplicateBtn.disabled=!el;
    if(!el) {
      this.title.textContent='Nenhum elemento selecionado';
      this.subtitle.textContent='Escolha uma ferramenta ou clique em um elemento.';
      this.panel.className='property-panel empty-state';
      this.panel.innerHTML='<p>As propriedades físicas do elemento selecionado aparecerão aqui.</p>';
    } else {
      const meta=getMeta(el);
      this.title.textContent=el.name||meta.label;
      this.subtitle.textContent=meta.subtitle;
      this.panel.className='property-panel';
      this.panel.innerHTML='';
      for(const group of getSchema(el)) {
        const visible=group.fields.filter(field=>!field.showIf||field.showIf(el));
        if(!visible.length) continue;
        const box=document.createElement('section');box.className='property-group';
        const h=document.createElement('h3');h.textContent=group.title;box.appendChild(h);
        for(const field of visible) box.appendChild(this.makeField(el,field));
        this.panel.appendChild(box);
      }
    }
    if(el?.type==='detector') this.activeDetectorId=el.id;
    this.updateDetectorPicker();
    this.drawDetector();
  }

  makeField(el,field) {
    if(field.type==='image') return this.makeImageField(el,field);
    const row=document.createElement('div');
    row.className='property-row'+(field.type==='checkbox'?' checkbox-row':'');
    const label=document.createElement('label');
    label.textContent=typeof field.label==='function'?field.label(el):field.label;
    label.htmlFor=`prop_${field.key}`;row.appendChild(label);
    let input;
    if(field.type==='select') {
      input=document.createElement('select');
      for(const opt of field.options) {
        const o=document.createElement('option');o.value=String(opt.value);o.textContent=opt.label;
        o.selected=String(el[field.key])===String(opt.value);input.appendChild(o);
      }
    } else {
      input=document.createElement('input');input.type=field.type;
      if(field.type==='checkbox') input.checked=Boolean(el[field.key]); else input.value=el[field.key] ?? '';
      if(field.min!==undefined) input.min=field.min;if(field.max!==undefined) input.max=field.max;if(field.step!==undefined) input.step=field.step;
    }
    input.id=`prop_${field.key}`;
    const holder=document.createElement('div');holder.className=field.unit?'unit-wrap':'';holder.appendChild(input);
    if(field.unit){const u=document.createElement('span');u.className='unit';u.textContent=field.unit;holder.appendChild(u);}
    row.appendChild(holder);
    const apply=()=>{
      let value;
      if(field.type==='checkbox') value=input.checked;
      else if(field.type==='number') value=Number(input.value);
      else if(field.type==='select' && typeof el[field.key]==='number') value=Number(input.value);
      else value=input.value;
      if(field.type==='number' && !Number.isFinite(value)) return;
      el[field.key]=value;
      if(field.key==='name') {this.title.textContent=value;this.updateDetectorPicker();}
      this.hooks.onPropertyChange?.(el,field.key);
      if(['spectrum','lensClass','contentType','imageColorMode','imageGeometry','conicType'].includes(field.key)) this.refresh();
    };
    input.addEventListener(field.type==='text'?'change':'input',apply);
    input.addEventListener('change',apply);
    if(field.help){const help=document.createElement('p');help.className='property-help';help.textContent=field.help;const wrap=document.createElement('div');wrap.append(row,help);return wrap;}
    return row;
  }

  makeImageField(el,field) {
    const row=document.createElement('div');row.className='property-row full-row';
    const label=document.createElement('label');label.textContent=field.label;row.appendChild(label);
    const box=document.createElement('div');box.className='image-upload';
    if(el.imageDataUrl){
      const img=document.createElement('img');img.className='image-upload-preview';img.src=el.imageDataUrl;img.alt='Prévia da fonte';box.appendChild(img);
    } else {
      const empty=document.createElement('div');empty.className='image-upload-empty';empty.textContent='Nenhuma imagem carregada. PNG e JPEG são aceitos.';box.appendChild(empty);
    }
    const actions=document.createElement('div');actions.className='image-upload-actions';
    const load=document.createElement('button');load.type='button';load.textContent=el.imageDataUrl?'Trocar imagem':'Carregar imagem';
    const input=document.createElement('input');input.type='file';input.accept=field.accept||'image/png,image/jpeg';input.hidden=true;
    load.addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;
      load.disabled=true;load.textContent='Processando…';
      try{
        const asset=await prepareImageAsset(file);
        el.imageDataUrl=asset.dataUrl;el.imageFileName=file.name;
        el.imagePixelWidth=asset.width;el.imagePixelHeight=asset.height;el.imageColumnRGB=asset.columns;
        const aspect=asset.height/Math.max(1,asset.width);
        el.imageHeight=Math.max(0.01,Number(el.imageWidth||18)*aspect);
        el.imageFieldHeightArcmin=Math.max(0.0001,Number(el.imageFieldWidthArcmin||20)*aspect);
        this.imageCache.clear();
        this.hooks.onPropertyChange?.(el,'imageDataUrl');
        this.refresh();
      }catch(err){this.hooks.onError?.(`Não foi possível abrir a imagem: ${err.message}`);load.disabled=false;load.textContent='Carregar imagem';}
    });
    actions.append(load,input);
    if(el.imageDataUrl){
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';
      remove.addEventListener('click',()=>{
        el.imageDataUrl='';el.imageFileName='';el.imagePixelWidth=0;el.imagePixelHeight=0;el.imageColumnRGB=[];
        this.imageCache.clear();this.hooks.onPropertyChange?.(el,'imageDataUrl');this.refresh();
      });actions.appendChild(remove);
    }
    box.appendChild(actions);
    const meta=document.createElement('p');meta.className='image-upload-meta';
    meta.textContent=el.imageDataUrl?`${el.imageFileName||'imagem'} · ${el.imagePixelWidth} × ${el.imagePixelHeight} px · incorporada à cena`:'A imagem será reduzida para no máximo 256 px por lado antes de ser incorporada ao JSON.';
    box.appendChild(meta);row.appendChild(box);return row;
  }

  updateDetectorPicker() {
    const detectors=this.engine.scene.filter(e=>e.type==='detector');
    const current=this.activeDetectorId;
    this.detectorSelect.innerHTML='';
    if(!detectors.length){const o=document.createElement('option');o.textContent='Nenhum detector';o.value='';this.detectorSelect.appendChild(o);this.detectorSelect.disabled=true;this.activeDetectorId=null;return;}
    this.detectorSelect.disabled=false;
    for(const det of detectors){const o=document.createElement('option');o.value=det.id;o.textContent=det.name||'Detector';this.detectorSelect.appendChild(o);}
    this.activeDetectorId=detectors.some(d=>d.id===current)?current:detectors[0].id;
    this.detectorSelect.value=this.activeDetectorId;
  }

  chooseDetectorRecord() {
    if(this.activeDetectorId && this.engine.detectors.has(this.activeDetectorId)) return this.engine.detectors.get(this.activeDetectorId);
    const first=this.engine.detectors.values().next();
    if(!first.done){this.activeDetectorId=first.value.element.id;this.updateDetectorPicker();return first.value;}
    return null;
  }

  drawDetector() {
    const canvas=this.detectorCanvas;
    const rect=canvas.getBoundingClientRect();
    const dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
    const ctx=this.detectorCtx;ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#08111a';ctx.fillRect(0,0,w,h);
    const rec=this.chooseDetectorRecord();
    this.exportPngBtn.disabled=true;this.lastCCDCanvas=null;
    if(!rec){ctx.fillStyle='#6e8498';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('Nenhum detector na cena',w/2,h/2);this.detectorSummary.textContent='Adicione ou selecione um detector.';this.exportBtn.disabled=true;return;}
    this.exportBtn.disabled=rec.hits.length===0;
    const range=rec.hits.length?`${formatWavelength(Math.min(...rec.hits.map(x=>x.wavelength)))} – ${formatWavelength(Math.max(...rec.hits.map(x=>x.wavelength)))}`:'sem sinal';
    this.detectorSummary.textContent=`${rec.element.name}: ${rec.hits.length} impactos · Σ ${rec.total.toExponential(2)} · ${range}`;
    if(this.detectorMode==='spectral') this.drawSpectral(ctx,w,h,rec);
    else if(this.detectorMode==='image') this.drawImageCCD(ctx,w,h,rec);
    else this.drawSpatial(ctx,w,h,rec);
  }

  drawAxes(ctx,w,h,xLabel,yLabel) {
    const m={l:42,r:12,t:12,b:30};ctx.strokeStyle='#30475b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(m.l,m.t);ctx.lineTo(m.l,h-m.b);ctx.lineTo(w-m.r,h-m.b);ctx.stroke();ctx.fillStyle='#7890a4';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(xLabel,(m.l+w-m.r)/2,h-7);ctx.save();ctx.translate(11,(m.t+h-m.b)/2);ctx.rotate(-Math.PI/2);ctx.fillText(yLabel,0,0);ctx.restore();return m;
  }

  drawSpatial(ctx,w,h,rec) {
    const m=this.drawAxes(ctx,w,h,'posição no detector (mm)','sinal');
    const data=rec.spatial;const max=Math.max(...data,1e-12);const pw=(w-m.l-m.r)/data.length;
    ctx.fillStyle='rgba(111,255,145,.65)';
    for(let i=0;i<data.length;i++){const bh=(h-m.t-m.b)*data[i]/max;ctx.fillRect(m.l+i*pw,h-m.b-bh,Math.max(1,pw),bh);}
    ctx.fillStyle='#7890a4';ctx.textAlign='left';ctx.fillText((-rec.element.length/2).toFixed(1),m.l,h-16);ctx.textAlign='right';ctx.fillText((rec.element.length/2).toFixed(1),w-m.r,h-16);ctx.textAlign='left';ctx.fillText(max.toExponential(1),4,m.t+5);
  }

  drawSpectral(ctx,w,h,rec) {
    const m=this.drawAxes(ctx,w,h,'comprimento de onda (nm)','sinal');
    if(!rec.hits.length)return;
    let min=Math.min(...rec.hits.map(x=>x.wavelength)),max=Math.max(...rec.hits.map(x=>x.wavelength));
    if(Math.abs(max-min)<1){min-=5;max+=5;}
    const bins=new Float64Array(Math.min(420,Math.max(80,Math.round(w-m.l-m.r))));
    for(const hit of rec.hits){const i=clamp(Math.floor((hit.wavelength-min)/(max-min)*bins.length),0,bins.length-1);bins[i]+=hit.intensity;}
    const peak=Math.max(...bins,1e-12);const pw=(w-m.l-m.r)/bins.length;
    for(let i=0;i<bins.length;i++){const wl=min+(max-min)*(i+.5)/bins.length;const bh=(h-m.t-m.b)*bins[i]/peak;ctx.fillStyle=wavelengthToRgb(wl,.82);ctx.fillRect(m.l+i*pw,h-m.b-bh,Math.max(1,pw+.3),bh);}
    ctx.fillStyle='#7890a4';ctx.textAlign='left';ctx.fillText(min.toFixed(1),m.l,h-16);ctx.textAlign='right';ctx.fillText(max.toFixed(1),w-m.r,h-16);ctx.textAlign='left';ctx.fillText(peak.toExponential(1),4,m.t+5);
  }

  async drawImageCCD(ctx,w,h,rec) {
    const token=++this.imageRenderToken;
    const imageHits=rec.hits.filter(hit=>hit.imageMeta&&hit.sourceId);
    if(!imageHits.length){ctx.fillStyle='#6e8498';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('Nenhum raio proveniente de uma fonte-imagem atingiu este CCD',w/2,h/2);return;}
    ctx.fillStyle='#6e8498';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('Reconstruindo o plano focal…',w/2,h/2);
    try{
      const sourceIds=[...new Set(imageHits.map(x=>x.sourceId))];
      const sources=sourceIds.map(id=>this.engine.scene.find(e=>e.id===id)).filter(s=>s?.imageDataUrl);
      if(!sources.length) throw new Error('A imagem da fonte não está disponível na cena.');
      const rw=clamp(Math.round(Number(rec.element.pixels||640)),160,1200);
      const rh=clamp(Math.round(Number(rec.element.pixelRows||480)),120,900);
      const output=document.createElement('canvas');output.width=rw;output.height=rh;
      const octx=output.getContext('2d',{willReadFrequently:true});
      octx.fillStyle='#000';octx.fillRect(0,0,rw,rh);
      let weightedScale=0,weightedBlur=0,metricWeight=0,renderedLayers=0;
      let hasAstronomical=false,hasFinite=false;
      for(const source of sources){
        const raster=await this.getImageRaster(source);
        const transfers=buildImageTransfers(imageHits.filter(x=>x.sourceId===source.id),source,rec.element);
        for(const tr of transfers){
          if(!Number.isFinite(tr.scale)||tr.activeSamples<1) continue;
          const layer=makeSpectralLayer(raster,tr,source,1/Math.max(1,transfers.length));
          const sx=tr.scale*tr.objectSpanX/Number(rec.element.length||1)*rw/raster.width;
          const sy=tr.scale*tr.objectSpanY/Number(rec.element.sensorHeight||rec.element.length||1)*rh/raster.height;
          if(Math.abs(sx)<1e-9||Math.abs(sy)<1e-9) continue;
          const cx=(0.5+tr.intercept/Number(rec.element.length||1))*rw;
          const cy=rh/2;
          const blurPx=clamp(Math.abs(tr.sigma/Number(rec.element.length||1)*rw),0,60);
          octx.save();octx.globalCompositeOperation='lighter';octx.filter=blurPx>0.25?`blur(${blurPx.toFixed(2)}px)`:'none';
          octx.translate(cx,cy);octx.scale(sx,sy);octx.drawImage(layer,-raster.width/2,-raster.height/2);octx.restore();
          const mw=Math.max(1e-9,tr.meanThroughput);weightedScale+=tr.scale*mw;weightedBlur+=tr.sigma*mw;metricWeight+=mw;renderedLayers++;
          hasAstronomical ||= tr.coordinateKind==='angle';hasFinite ||= tr.coordinateKind==='length';
        }
      }
      if(token!==this.imageRenderToken)return;
      if(!renderedLayers) throw new Error('Os raios chegaram, mas não foi possível estimar uma formação de imagem.');
      applyDisplayTransfer(output,Number(rec.element.imageGain||1),Number(rec.element.displayGamma||1));
      ctx.setTransform(Math.min(2,window.devicePixelRatio||1),0,0,Math.min(2,window.devicePixelRatio||1),0,0);
      ctx.fillStyle='#05090d';ctx.fillRect(0,0,w,h);
      const pad=12,availW=w-pad*2,availH=h-pad*2;
      const scale=Math.min(availW/rw,availH/rh);const dw=rw*scale,dh=rh*scale,dx=(w-dw)/2,dy=(h-dh)/2;
      ctx.imageSmoothingEnabled=true;ctx.drawImage(output,dx,dy,dw,dh);ctx.strokeStyle='#365066';ctx.strokeRect(dx-.5,dy-.5,dw+1,dh+1);
      const opticalScale=metricWeight?weightedScale/metricWeight:0,blur=metricWeight?weightedBlur/metricWeight:0;
      const scaleLabel=hasAstronomical&&!hasFinite?`f efetivo ≈ ${opticalScale.toFixed(2)} mm`:hasFinite&&!hasAstronomical?`M ≈ ${opticalScale.toFixed(3)}`:`escala ≈ ${opticalScale.toFixed(3)}`;
      ctx.fillStyle='rgba(5,9,13,.78)';ctx.fillRect(dx,dy,Math.min(dw,250),18);ctx.fillStyle='#b9cad8';ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillText(`${scaleLabel} · RMS ≈ ${blur.toFixed(4)} mm`,dx+6,dy+12);
      this.detectorSummary.textContent=`${rec.element.name}: imagem ${rw} × ${rh} px · ${scaleLabel} · desfoco RMS ≈ ${blur.toFixed(4)} mm`;
      this.lastCCDCanvas=output;this.exportPngBtn.disabled=false;
    }catch(err){
      if(token!==this.imageRenderToken)return;
      ctx.fillStyle='#ff8994';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(err.message,w/2,h/2);this.exportPngBtn.disabled=true;
    }
  }

  async getImageRaster(source) {
    const key=source.imageDataUrl;
    if(this.imageCache.has(key)) return this.imageCache.get(key);
    const promise=(async()=>{
      const img=await loadImage(key);
      const scale=Math.min(1,128/img.naturalWidth,96/img.naturalHeight);
      const width=Math.max(2,Math.round(img.naturalWidth*scale));const height=Math.max(2,Math.round(img.naturalHeight*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,width,height);
      return {width,height,data:ctx.getImageData(0,0,width,height).data};
    })();
    this.imageCache.set(key,promise);return promise;
  }

  exportCsv() {
    const rec=this.chooseDetectorRecord();if(!rec||!rec.hits.length)return;
    const rows=['pixel,posicao_mm,comprimento_de_onda_nm,intensidade,fonte_imagem,u_objeto'];
    for(const h of rec.hits) rows.push(`${h.pixel},${h.coord.toFixed(8)},${h.wavelength.toFixed(6)},${h.intensity.toExponential(9)},${h.sourceId||''},${h.imageMeta?.u??''}`);
    const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${safeName(rec.element.name||'detector')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  exportPng() {
    const rec=this.chooseDetectorRecord();if(!this.lastCCDCanvas||!rec)return;
    this.lastCCDCanvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${safeName(rec.element.name||'ccd')}_imagem.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},'image/png');
  }
}

function buildImageTransfers(hits,source,detector) {
  const byWavelength=new Map();
  for(const hit of hits){
    const wlKey=Number(hit.wavelength).toFixed(6);
    if(!byWavelength.has(wlKey))byWavelength.set(wlKey,{columns:new Map(),template:hit.imageMeta});
    const bucket=byWavelength.get(wlKey),col=Number(hit.imageMeta.column);
    if(!bucket.columns.has(col))bucket.columns.set(col,{u:Number(hit.imageMeta.u),sumW:0,sumX:0,sumX2:0,meta:hit.imageMeta});
    const g=bucket.columns.get(col),wt=Math.max(0,Number(hit.transportIntensity||hit.intensity));
    g.sumW+=wt;g.sumX+=wt*hit.coord;g.sumX2+=wt*hit.coord*hit.coord;
  }
  const result=[];
  for(const [wlKey,bucket] of byWavelength){
    const template=bucket.template||{};
    const nCols=clamp(Math.round(Number(template.columnCount||source.imageColumns||128)),1,512);
    // Colunas que foram retiradas por uma fenda, bloqueador, vinhetagem ou detector
    // fora de campo precisam continuar presentes com throughput zero. Não interpolar
    // por cima delas é o que faz a abertura da fenda aparecer negra na imagem refletida.
    for(let col=0;col<nCols;col++){
      if(bucket.columns.has(col))continue;
      const u=nCols===1?0:col/(nCols-1)-0.5;
      bucket.columns.set(col,{u,sumW:0,sumX:0,sumX2:0,meta:{...template,u,column:col,columnCount:nCols}});
    }
    const samples=[];
    const active=[];
    for(const g of bucket.columns.values()){
      const denom=Math.max(1e-12,Number(g.meta.raysPerColumn||1)*Number(g.meta.launchIntensity||1)*Number(detector.quantumEfficiency||1));
      const throughput=clamp(g.sumW/denom,0,4);
      const objectCoord=Number.isFinite(Number(g.meta.objectCoord))?Number(g.meta.objectCoord):sourceObjectCoordinate(source,g.u);
      if(g.sumW>0){
        const mean=g.sumX/g.sumW;
        const sigma=Math.sqrt(Math.max(0,g.sumX2/g.sumW-mean*mean));
        const point={u:g.u,objectCoord,mean,sigma,throughput,hasSignal:true};samples.push(point);active.push(point);
      } else samples.push({u:g.u,objectCoord,mean:NaN,sigma:0,throughput:0,hasSignal:false});
    }
    samples.sort((a,b)=>a.u-b.u);active.sort((a,b)=>a.u-b.u);
    if(!active.length)continue;
    let sw=0,sx=0,sy=0,sxx=0,sxy=0;
    for(const p of active){const wt=Math.max(1e-9,p.throughput);sw+=wt;sx+=wt*p.objectCoord;sy+=wt*p.mean;sxx+=wt*p.objectCoord*p.objectCoord;sxy+=wt*p.objectCoord*p.mean;}
    const den=sw*sxx-sx*sx;let scale=Math.abs(den)>1e-15?(sw*sxy-sx*sy)/den:0;
    let intercept=sw?(sy-scale*sx)/sw:active[0].mean;
    if(active.length===1){scale=0;intercept=active[0].mean;}
    let sig=0,tp=0;for(const p of active){sig+=p.sigma*Math.max(1e-9,p.throughput);tp+=Math.max(1e-9,p.throughput);}
    const coordinateKind=template.geometry==='astronomical'||source.imageGeometry==='astronomical'?'angle':'length';
    const spans=sourceObjectSpans(source,template);
    result.push({wavelength:Number(wlKey),samples,scale,intercept,sigma:sig/Math.max(tp,1e-12),
      meanThroughput:tp/Math.max(1,active.length),activeSamples:active.length,
      coordinateKind,objectSpanX:spans.x,objectSpanY:spans.y});
  }
  return result.sort((a,b)=>a.wavelength-b.wavelength);
}

function sourceObjectCoordinate(source,u){
  if(source.imageGeometry==='astronomical'){
    const full=arcminToRad(Math.max(0.0001,Number(source.imageFieldWidthArcmin||20)));
    return Math.tan(u*full);
  }
  return u*Math.max(0.01,Number(source.imageWidth||1));
}

function sourceObjectSpans(source,meta={}){
  if(meta.geometry==='astronomical'||source.imageGeometry==='astronomical'){
    const fx=Number(meta.objectSpanX)||2*Math.tan(arcminToRad(Math.max(0.0001,Number(source.imageFieldWidthArcmin||20)))/2);
    const fy=Number(meta.objectSpanY)||2*Math.tan(arcminToRad(Math.max(0.0001,Number(source.imageFieldHeightArcmin||13.3333)))/2);
    return {x:Math.max(1e-12,Math.abs(fx)),y:Math.max(1e-12,Math.abs(fy))};
  }
  return {x:Math.max(1e-9,Number(meta.objectSpanX)||Number(source.imageWidth||1)),y:Math.max(1e-9,Number(meta.objectSpanY)||Number(source.imageHeight||1))};
}

function arcminToRad(value){return Number(value)*Math.PI/(180*60);}

function makeSpectralLayer(raster,transfer,source,spectralScale=1) {
  const canvas=document.createElement('canvas');canvas.width=raster.width;canvas.height=raster.height;
  const ctx=canvas.getContext('2d');const img=ctx.createImageData(raster.width,raster.height);const out=img.data;
  const [cr,cg,cb]=wavelengthToRgbComponents(transfer.wavelength);
  for(let y=0;y<raster.height;y++)for(let x=0;x<raster.width;x++){
    const i=(y*raster.width+x)*4;const alpha=raster.data[i+3]/255;
    const rgb=[raster.data[i]/255,raster.data[i+1]/255,raster.data[i+2]/255];
    const u=raster.width===1?0:x/(raster.width-1)-0.5;
    const throughput=interpolateThroughput(transfer.samples,u);
    const spectral=rgbSpectralWeight(rgb,transfer.wavelength,source.imageColorMode,source.imageMonoWavelength);
    const a=clamp(alpha*spectral*throughput*Number(source.intensity||1)*spectralScale,0,1);
    out[i]=cr;out[i+1]=cg;out[i+2]=cb;out[i+3]=Math.round(a*255);
  }
  ctx.putImageData(img,0,0);return canvas;
}

function interpolateThroughput(samples,u) {
  if(!samples.length)return 0;
  if(samples.length===1)return samples[0].throughput;
  if(u<=samples[0].u)return samples[0].throughput;
  if(u>=samples.at(-1).u)return samples.at(-1).throughput;
  let lo=0,hi=samples.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].u<=u)lo=mid;else hi=mid;}
  const a=samples[lo],b=samples[hi],t=(u-a.u)/Math.max(1e-12,b.u-a.u);
  return a.throughput*(1-t)+b.throughput*t;
}

function applyDisplayTransfer(canvas,gain,gamma) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});const img=ctx.getImageData(0,0,canvas.width,canvas.height);const d=img.data;
  const invGamma=1/Math.max(0.05,gamma);
  for(let i=0;i<d.length;i+=4){d[i]=Math.round(255*Math.pow(clamp(d[i]/255*gain,0,1),invGamma));d[i+1]=Math.round(255*Math.pow(clamp(d[i+1]/255*gain,0,1),invGamma));d[i+2]=Math.round(255*Math.pow(clamp(d[i+2]/255*gain,0,1),invGamma));d[i+3]=255;}
  ctx.putImageData(img,0,0);
}

async function prepareImageAsset(file) {
  if(!/^image\/(png|jpeg)$/.test(file.type)&&!/.+\.(png|jpe?g)$/i.test(file.name))throw new Error('Use um arquivo PNG, JPG ou JPEG.');
  const raw=await readFileDataUrl(file);const img=await loadImage(raw);
  const scale=Math.min(1,256/img.naturalWidth,256/img.naturalHeight);const width=Math.max(2,Math.round(img.naturalWidth*scale)),height=Math.max(2,Math.round(img.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,width,height);
  const pixels=ctx.getImageData(0,0,width,height).data;const bins=Math.min(128,width),columns=[];
  for(let b=0;b<bins;b++){const x0=Math.floor(b*width/bins),x1=Math.max(x0+1,Math.floor((b+1)*width/bins));let r=0,g=0,bl=0,ws=0;
    for(let x=x0;x<x1;x++)for(let y=0;y<height;y++){const i=(y*width+x)*4,a=pixels[i+3]/255;r+=pixels[i]/255*a;g+=pixels[i+1]/255*a;bl+=pixels[i+2]/255*a;ws+=a;}
    columns.push(ws?[r/ws,g/ws,bl/ws]:[0,0,0]);
  }
  const mime=file.type==='image/jpeg'?'image/jpeg':'image/png';const dataUrl=canvas.toDataURL(mime,mime==='image/jpeg'?0.9:undefined);
  return {dataUrl,width,height,columns};
}

function readFileDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Falha de leitura do arquivo.'));r.readAsDataURL(file);});}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Formato de imagem inválido ou corrompido.'));img.src=src;});}
function safeName(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'').toLowerCase();}

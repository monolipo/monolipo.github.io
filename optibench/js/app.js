import { OpticalEngine } from './engine.js';
import { InspectorUI } from './ui.js';
import { createElement, syncConicMirror, getHandles, setFromHandle } from './elements.js';
import { makePreset } from './presets.js';
import { deepClone, wrapAngle } from './math.js';

const canvas=document.getElementById('benchCanvas');
canvas.tabIndex=0;
const engine=new OpticalEngine(canvas);
const inspector=new InspectorUI(engine,{
  onPropertyChange:(el,key)=>{if(el.type==='conicMirror')syncConicMirror(el,key);engine.invalidateTrace();scheduleHistory();saveLocal();updateStatus();},
  onError:message=>showToast(message,true)
});
engine.onTraceComplete=()=>{inspector.drawDetector();updateStatus();};

let currentTool='select';
let pointerMode=null;
let dragState=null;
let history=[];
let historyIndex=-1;
let historyTimer=null;
let toastTimer=null;

const cursorStatus=document.getElementById('cursorStatus');
const traceStatus=document.getElementById('traceStatus');
const zoomStatus=document.getElementById('zoomStatus');

function setTool(tool){
  currentTool=tool;
  document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  canvas.style.cursor=tool==='select'?'default':'crosshair';
}

document.querySelectorAll('.tool').forEach(btn=>btn.addEventListener('click',()=>setTool(btn.dataset.tool)));

function selectElement(id){engine.selectedId=id;inspector.refresh();engine.requestDraw();}

function sceneSnapshot(){return JSON.stringify(engine.scene);}
function commitHistory(force=false){
  clearTimeout(historyTimer);
  const snap=sceneSnapshot();
  if(!force && history[historyIndex]===snap)return;
  history=history.slice(0,historyIndex+1);history.push(snap);if(history.length>80)history.shift();historyIndex=history.length-1;updateUndoButtons();saveLocal();
}
function scheduleHistory(){clearTimeout(historyTimer);historyTimer=setTimeout(()=>commitHistory(),350);}
function restoreHistory(index){if(index<0||index>=history.length)return;historyIndex=index;engine.setScene(JSON.parse(history[index]));inspector.refresh();updateUndoButtons();saveLocal();}
function undo(){restoreHistory(historyIndex-1)}
function redo(){restoreHistory(historyIndex+1)}
function updateUndoButtons(){document.getElementById('undoBtn').disabled=historyIndex<=0;document.getElementById('redoBtn').disabled=historyIndex>=history.length-1;}

function setScene(scene,fit=true){
  engine.setScene(deepClone(scene));
  inspector.refresh();
  history=[];historyIndex=-1;commitHistory(true);
  if(fit)setTimeout(()=>engine.fitScene(),30);
}

function addElement(type,world){
  const el=createElement(type,world.x,world.y);engine.scene.push(el);selectElement(el.id);engine.invalidateTrace();commitHistory();setTool('select');showToast(`${el.name} adicionado`);
}

function deleteSelected(){
  if(!engine.selectedId)return;
  const idx=engine.scene.findIndex(e=>e.id===engine.selectedId);if(idx<0)return;
  engine.scene.splice(idx,1);engine.selectedId=null;engine.invalidateTrace();inspector.refresh();commitHistory();showToast('Elemento removido');
}
function duplicateSelected(){
  const el=engine.scene.find(e=>e.id===engine.selectedId);if(!el)return;
  const copy=deepClone(el);copy.id=`${el.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;copy.x+=4;copy.y+=4;copy.name=`${el.name} (cópia)`;engine.scene.push(copy);selectElement(copy.id);engine.invalidateTrace();commitHistory();
}

canvas.addEventListener('pointerdown',e=>{
  canvas.focus();
  const rect=canvas.getBoundingClientRect();const screen={x:e.clientX-rect.left,y:e.clientY-rect.top};const world=engine.screenToWorld(screen);
  if(e.button===2||e.button===1){pointerMode='pan';dragState={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;}
  if(e.button!==0)return;
  if(currentTool!=='select'){addElement(currentTool,world);return;}
  const handle=engine.findHandleAt(world);
  if(handle){pointerMode='resize';dragState={element:handle.element,fixed:{...handle.other}};canvas.setPointerCapture(e.pointerId);return;}
  const el=engine.findElementAt(world);
  if(el){selectElement(el.id);pointerMode='move';dragState={element:el,dx:world.x-el.x,dy:world.y-el.y};canvas.setPointerCapture(e.pointerId);}
  else {selectElement(null);pointerMode=null;}
});

canvas.addEventListener('pointermove',e=>{
  const rect=canvas.getBoundingClientRect();const screen={x:e.clientX-rect.left,y:e.clientY-rect.top};const world=engine.screenToWorld(screen);
  cursorStatus.textContent=`x = ${world.x.toFixed(2)} mm · y = ${world.y.toFixed(2)} mm`;
  if(pointerMode==='pan'){engine.pan(e.clientX-dragState.x,e.clientY-dragState.y);dragState.x=e.clientX;dragState.y=e.clientY;updateStatus();return;}
  if(pointerMode==='move'){
    dragState.element.x=world.x-dragState.dx;dragState.element.y=world.y-dragState.dy;engine.invalidateTrace();inspector.refresh();return;
  }
  if(pointerMode==='resize'){
    setFromHandle(dragState.element,dragState.fixed,world);engine.invalidateTrace();inspector.refresh();return;
  }
  if(currentTool==='select'){
    const h=engine.findHandleAt(world);canvas.style.cursor=h?'crosshair':engine.findElementAt(world)?'move':'default';
  }
});

canvas.addEventListener('pointerup',e=>{if(pointerMode==='move'||pointerMode==='resize')commitHistory();pointerMode=null;dragState=null;try{canvas.releasePointerCapture(e.pointerId)}catch{};});
canvas.addEventListener('pointercancel',()=>{pointerMode=null;dragState=null;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const rect=canvas.getBoundingClientRect();engine.zoomAt({x:e.clientX-rect.left,y:e.clientY-rect.top},Math.exp(-e.deltaY*0.0012));updateStatus();},{passive:false});

window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;if(['INPUT','SELECT','TEXTAREA'].includes(tag))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();return;}
  if(e.key==='Escape'){setTool('select');selectElement(null);return;}
  const el=engine.scene.find(x=>x.id===engine.selectedId);
  if(el&&(e.key.toLowerCase()==='q'||e.key.toLowerCase()==='e')){const step=e.shiftKey?5:1;el.angle=wrapAngle(Number(el.angle)+(e.key.toLowerCase()==='q'?-step:step));engine.invalidateTrace();inspector.refresh();commitHistory();}
});

document.getElementById('deleteBtn').addEventListener('click',deleteSelected);
document.getElementById('duplicateBtn').addEventListener('click',duplicateSelected);
document.getElementById('undoBtn').addEventListener('click',undo);
document.getElementById('redoBtn').addEventListener('click',redo);
document.getElementById('exportCsvBtn').addEventListener('click',()=>inspector.exportCsv());
document.getElementById('exportPngBtn').addEventListener('click',()=>inspector.exportPng());

document.getElementById('newBtn').addEventListener('click',()=>{setScene([],false);showToast('Nova cena em branco');});
document.getElementById('presetSelect').addEventListener('change',e=>{setScene(makePreset(e.target.value));showToast('Exemplo carregado');});

document.getElementById('saveBtn').addEventListener('click',()=>{
  const payload={format:'OptiBench2D',version:2.2,units:{length:'mm',wavelength:'nm'},settings:engine.settings,scene:engine.scene};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='optibench-cena.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showToast('Cena salva em JSON');
});
const loadInput=document.getElementById('loadInput');
document.getElementById('loadBtn').addEventListener('click',()=>loadInput.click());
loadInput.addEventListener('change',async()=>{
  const file=loadInput.files?.[0];if(!file)return;
  try{const data=JSON.parse(await file.text());const scene=Array.isArray(data)?data:data.scene;if(!Array.isArray(scene))throw new Error('Formato inválido');if(data.settings)Object.assign(engine.settings,data.settings);syncSettings();setScene(scene);showToast('Cena carregada');}catch(err){showToast(`Falha ao carregar: ${err.message}`,true);}finally{loadInput.value='';}
});

for(const [id,key] of [['showGrid','showGrid'],['showLabels','showLabels'],['densityMode','densityMode'],['showNormals','showNormals']]){
  document.getElementById(id).addEventListener('change',e=>{engine.settings[key]=e.target.checked;if(key==='densityMode')engine.invalidateTrace();else engine.requestDraw();saveLocal();});
}
document.getElementById('qualitySelect').addEventListener('change',e=>{engine.settings.quality=e.target.value;engine.invalidateTrace();saveLocal();});

function syncSettings(){
  document.getElementById('showGrid').checked=engine.settings.showGrid;
  document.getElementById('showLabels').checked=engine.settings.showLabels;
  document.getElementById('densityMode').checked=engine.settings.densityMode;
  document.getElementById('showNormals').checked=engine.settings.showNormals;
  document.getElementById('qualitySelect').value=engine.settings.quality;
}

function updateStatus(){traceStatus.textContent=`${engine.stats.rays||0} raios · ${engine.stats.segments||0} segmentos`;zoomStatus.textContent=`${Math.round(engine.camera.zoom/5.4*100)}%`;}
function showToast(message,error=false){const el=document.getElementById('toast');el.textContent=message;el.style.background=error?'#ffdce0':'#e7f6ff';el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);}
function saveLocal(){try{localStorage.setItem('optibench2d.autosave.v2.2',JSON.stringify({scene:engine.scene,settings:engine.settings,camera:engine.camera}));}catch{}}
function loadLocal(){try{const raw=localStorage.getItem('optibench2d.autosave.v2.2');if(!raw)return false;const data=JSON.parse(raw);if(!Array.isArray(data.scene))return false;Object.assign(engine.settings,data.settings||{});Object.assign(engine.camera,data.camera||{});setScene(data.scene,false);syncSettings();return true;}catch{return false;}}

window.OptiBench={engine,inspector,setScene,makePreset,selectElement,commitHistory};

if(!loadLocal())setScene(makePreset('blank'),false);
syncSettings();setTool('select');inspector.refresh();updateStatus();

import { createElement } from './elements.js';

function e(type,x,y,props={}) { return Object.assign(createElement(type,x,y),props); }

export function makePreset(name) {
  if(name==='prism') return prismPreset();
  return [];
}

function prismPreset() {
  return [
    e('source',-95,0,{name:'Fonte branca',sourceType:'point',angle:0,divergence:16,rayCount:17,spectrum:'white',lambdaMin:400,lambdaMax:700,spectralSamples:21,intensity:1}),
    e('slit',-94.4,0,{name:'Fenda',angle:0,length:18,slitWidth:0.20}),
    e('lens',-60,0,{name:'Colimador',angle:0,length:30,focalLength:34.4,lensClass:'achromat',transmission:0.97}),
    e('prism',0,0,{name:'Prisma N-BK7',angle:80,width:30,height:20,material:'N-BK7',surfaceTransmission:0.98}),
    e('lens',52,-19.5,{name:'Lente de câmera',angle:-20.5,length:46,focalLength:50,lensClass:'apochromat',transmission:0.97}),
    e('detector',99,-37,{name:'Detector',angle:-20.5,length:42,pixels:1024,quantumEfficiency:0.9,saturation:100})
  ];
}

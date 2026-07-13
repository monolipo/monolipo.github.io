import {
  add, sub, mul, dot, len, norm, perp, angleVec, localToWorld, worldToLocal,
  raySegmentIntersection, distancePointSegment, polygonContains, polygonSignedArea,
  reflect, refract, clamp, uid, radToDeg, wrapAngle
} from './math.js';
import {
  refractiveIndex, makeSpectrum, makeImageSpectrum, rgbSpectralWeight, gratingEfficiency, dichroicReflectance, MATERIALS
} from './physics.js';

export const ELEMENT_META = {
  source: { label: 'Fonte de luz', subtitle: 'Feixe espectral, objeto finito ou campo astronômico colimado 2,5D' },
  mirror: { label: 'Espelho plano', subtitle: 'Reflexão especular ideal com eficiência' },
  conicMirror: { label: 'Espelho cônico', subtitle: 'Espelho esférico, parabólico ou hiperbólico, com abertura central opcional' },
  lens: { label: 'Lente fina', subtitle: 'Modelo paraxial com cromatismo ajustável' },
  prism: { label: 'Prisma', subtitle: 'Refração real por Snell e dispersão de Sellmeier' },
  gratingR: { label: 'Rede refletiva', subtitle: 'Difração por conservação do vetor de onda tangencial' },
  gratingT: { label: 'Rede transmissiva', subtitle: 'Rede de transmissão com ordem selecionável' },
  slit: { label: 'Fenda', subtitle: 'Abertura central e lâminas opacas' },
  mirrorSlit: { label: 'Fenda espelhada', subtitle: 'Abertura central com lâminas refletivas' },
  blocker: { label: 'Bloqueador', subtitle: 'Anteparo totalmente opaco' },
  splitter: { label: 'Divisor de feixe', subtitle: 'Transmissão e reflexão simultâneas' },
  dichroic: { label: 'Dicróico', subtitle: 'Refletância dependente do comprimento de onda' },
  detector: { label: 'Detector / CCD', subtitle: 'Perfil linear e reconstrução bidimensional no plano focal' }
};

const materialOptions = Object.entries(MATERIALS).map(([value, m]) => ({ value, label: m.label }));
const spectrumOptions = [
  ['white', 'Branco plano'], ['blackbody', 'Corpo negro'], ['mono', 'Monocromática'],
  ['mercury', 'Lâmpada de mercúrio'], ['neon', 'Lâmpada de neônio'],
  ['hydrogen', 'Hidrogênio Balmer'], ['calibration', 'Mistura de calibração'], ['custom', 'Linhas personalizadas']
].map(([value,label]) => ({ value, label }));

const commonPosition = [
  { key: 'x', label: 'Posição X', type: 'number', step: 0.1, unit: 'mm' },
  { key: 'y', label: 'Posição Y', type: 'number', step: 0.1, unit: 'mm' },
  { key: 'angle', label: 'Ângulo da normal/eixo', type: 'number', step: 0.1, unit: '°' }
];

export const PROPERTY_SCHEMAS = {
  source: [
    { title: 'Geometria', fields: [
      ...commonPosition,
      { key: 'contentType', label: 'Conteúdo luminoso', type: 'select', options: [
        {value:'spectrum',label:'Espectro / feixe'}, {value:'image',label:'Imagem PNG ou JPG'}
      ]},
      { key: 'sourceType', label: 'Tipo geométrico', type: 'select', options: [
        {value:'parallel',label:'Feixe paralelo'}, {value:'point',label:'Fonte pontual'}
      ], showIf:e=>e.contentType!=='image'},
      { key: 'imageGeometry', label: 'Modelo da imagem', type: 'select', options: [
        {value:'astronomical',label:'Objeto astronômico no infinito'},
        {value:'finite',label:'Objeto físico em distância finita (legado)'}
      ], showIf:e=>e.contentType==='image', help:'No modo astronômico, cada ponto da foto é uma direção no céu e lança um feixe paralelo através da pupila. Uma lente forma a imagem em seu plano focal.' },
      { key: 'aperture', label: e=>e.contentType==='image'&&e.imageGeometry==='astronomical'?'Diâmetro da pupila / feixe':'Abertura do feixe', type: 'number', min: 0.01, step: 0.1, unit: 'mm', showIf:e=>e.contentType!=='image'||e.imageGeometry==='astronomical' },
      { key: 'imageWidth', label: 'Largura física do objeto', type: 'number', min: 0.01, step: 0.1, unit: 'mm', showIf:e=>e.contentType==='image'&&e.imageGeometry!=='astronomical' },
      { key: 'imageHeight', label: 'Altura física fora do plano', type: 'number', min: 0.01, step: 0.1, unit: 'mm', showIf:e=>e.contentType==='image'&&e.imageGeometry!=='astronomical', help:'Dimensão perpendicular ao desenho 2D. O centro desta dimensão permanece no eixo z = 0.' },
      { key: 'imageFieldWidthArcmin', label: 'Campo horizontal total', type: 'number', min: 0.0001, max: 21600, step: 0.1, unit: 'arcmin', showIf:e=>e.contentType==='image'&&e.imageGeometry==='astronomical', help:'A largura angular da fotografia no céu. O tamanho físico no foco será determinado pela distância focal efetiva do sistema.' },
      { key: 'imageFieldHeightArcmin', label: 'Campo vertical total', type: 'number', min: 0.0001, max: 21600, step: 0.1, unit: 'arcmin', showIf:e=>e.contentType==='image'&&e.imageGeometry==='astronomical', help:'Dimensão angular fora do plano. Ela permanece centrada em z = 0 e é reconstruída no CCD com a escala medida no plano meridional.' },
      { key: 'divergence', label: 'Cone angular total', type: 'number', min: 0, max: 179, step: 0.1, unit: '°', showIf:e=>e.contentType!=='image'||e.imageGeometry!=='astronomical' },
      { key: 'rayCount', label: e=>e.contentType==='image'?(e.imageGeometry==='astronomical'?'Amostras na pupila':'Raios por ponto'):'Raios geométricos', type: 'number', min: 1, max: 400, step: 1 }
    ]},
    { title: 'Imagem emissora', fields: [
      { key:'imageDataUrl', label:'Arquivo da imagem', type:'image', accept:'image/png,image/jpeg,.png,.jpg,.jpeg', showIf:e=>e.contentType==='image' },
      { key:'imageColorMode', label:'Modelo espectral', type:'select', options:[
        {value:'rgb',label:'RGB em bandas espectrais'}, {value:'white',label:'Luminância branca'}, {value:'mono',label:'Luminância monocromática'}
      ], showIf:e=>e.contentType==='image' },
      { key:'imageMonoWavelength', label:'λ monocromático', type:'number', min:180,max:2500,step:0.1,unit:'nm', showIf:e=>e.contentType==='image'&&e.imageColorMode==='mono' },
      { key:'imageLambdaMin', label:'λ mínimo da imagem', type:'number', min:180,max:2500,step:1,unit:'nm', showIf:e=>e.contentType==='image'&&e.imageColorMode!=='mono' },
      { key:'imageLambdaMax', label:'λ máximo da imagem', type:'number', min:180,max:2500,step:1,unit:'nm', showIf:e=>e.contentType==='image'&&e.imageColorMode!=='mono' },
      { key:'imageSpectralSamples', label:'Amostras espectrais', type:'number', min:3,max:25,step:1, showIf:e=>e.contentType==='image'&&e.imageColorMode!=='mono' },
      { key:'imageColumns', label:'Amostras horizontais da imagem', type:'number', min:4,max:512,step:1, showIf:e=>e.contentType==='image', help:'Aumente este valor para resolver fendas muito estreitas. A dimensão vertical é reconstruída no CCD; apenas colunas são traçadas no plano meridional.' }
    ]},
    { title: 'Espectro e potência', fields: [
      { key: 'spectrum', label: 'Espectro', type: 'select', options: spectrumOptions, showIf:e=>e.contentType!=='image' },
      { key: 'wavelength', label: 'λ monocromático', type: 'number', min: 180, max: 2500, step: 0.1, unit: 'nm', showIf: e => e.contentType!=='image'&&e.spectrum === 'mono' },
      { key: 'lambdaMin', label: 'λ mínimo', type: 'number', min: 180, max: 2500, step: 1, unit: 'nm', showIf: e => e.contentType!=='image'&&e.spectrum !== 'mono' },
      { key: 'lambdaMax', label: 'λ máximo', type: 'number', min: 180, max: 2500, step: 1, unit: 'nm', showIf: e => e.contentType!=='image'&&e.spectrum !== 'mono' },
      { key: 'spectralSamples', label: 'Amostras espectrais', type: 'number', min: 1, max: 80, step: 1, showIf: e => e.contentType!=='image'&&['white','blackbody'].includes(e.spectrum) },
      { key: 'temperature', label: 'Temperatura', type: 'number', min: 500, max: 30000, step: 100, unit: 'K', showIf: e => e.contentType!=='image'&&e.spectrum === 'blackbody' },
      { key: 'customLines', label: 'Linhas λ:int.', type: 'text', showIf: e => e.contentType!=='image'&&e.spectrum === 'custom', help: 'Ex.: 486.1:0.7, 656.3:1' },
      { key: 'intensity', label: 'Intensidade total', type: 'number', min: 0, max: 100, step: 0.1 },
      { key: 'enabled', label: 'Fonte ligada', type: 'checkbox' }
    ]}
  ],
  mirror: [
    { title: 'Geometria', fields: [...commonPosition, { key:'length', label:'Comprimento útil', type:'number', min:0.1, step:0.1, unit:'mm' }] },
    { title: 'Revestimento', fields: [
      { key:'reflectivity', label:'Refletividade', type:'number', min:0, max:1, step:0.01 },
      { key:'roughness', label:'Perda por rugosidade', type:'number', min:0, max:1, step:0.01 }
    ]}
  ],
  conicMirror: [
    { title: 'Geometria cônica', fields: [
      ...commonPosition,
      { key:'conicType', label:'Perfil do espelho', type:'select', options: [
        {value:'sphere',label:'Esférico'},
        {value:'parabola',label:'Parabólico'},
        {value:'hyperbola',label:'Hiperbólico'}
      ]},
      { key:'aperture', label:'Diâmetro útil', type:'number', min:0.1, step:0.1, unit:'mm' },
      { key:'holeDiameter', label:'Diâmetro do furo central', type:'number', min:0, step:0.1, unit:'mm', help:'Use 0 para um espelho contínuo. Raios que atravessam o furo não são refletidos.' },
      { key:'focalLength', label:'Comprimento focal assinado', type:'number', step:0.1, unit:'mm', help:'O módulo define a distância focal. Troque o sinal para inverter a concavidade.' },
      { key:'conicK', label:'Constante cônica K', type:'number', max:-1.0001, step:0.05, showIf:e=>e.conicType==='hyperbola', help:'Somente para a hipérbole: K deve ser menor que −1. Valores mais negativos aumentam a excentricidade.' },
      { key:'reflectivity', label:'Refletividade', type:'number', min:0, max:1, step:0.01 }
    ]}
  ],
  lens: [
    { title: 'Geometria', fields: [...commonPosition, { key:'length', label:'Diâmetro útil', type:'number', min:0.1, step:0.1, unit:'mm' }] },
    { title: 'Modelo óptico', fields: [
      { key:'focalLength', label:'Comprimento focal', type:'number', step:0.1, unit:'mm' },
      { key:'lensClass', label:'Correção cromática', type:'select', options: [
        {value:'singlet',label:'Singlete'}, {value:'achromat',label:'Acromática'}, {value:'apochromat',label:'Apocromática'}, {value:'ideal',label:'Ideal sem cromatismo'}
      ]},
      { key:'material', label:'Vidro equivalente', type:'select', options: materialOptions, showIf:e=>e.lensClass!=='ideal' },
      { key:'referenceWavelength', label:'λ de projeto', type:'number', min:180, max:2500, step:0.1, unit:'nm' },
      { key:'transmission', label:'Transmissão', type:'number', min:0, max:1, step:0.01 }
    ]}
  ],
  prism: [
    { title: 'Geometria', fields: [
      ...commonPosition,
      { key:'width', label:'Comprimento', type:'number', min:0.1, step:0.1, unit:'mm' },
      { key:'height', label:'Altura', type:'number', min:0.1, step:0.1, unit:'mm' }
    ]},
    { title: 'Material', fields: [
      { key:'material', label:'Vidro', type:'select', options: materialOptions },
      { key:'surfaceTransmission', label:'Transmissão/superfície', type:'number', min:0, max:1, step:0.01 }
    ]}
  ],
  gratingR: gratingSchema(true),
  gratingT: gratingSchema(false),
  slit: [
    { title: 'Geometria', fields: [...commonPosition,
      { key:'length', label:'Altura total', type:'number', min:0.1, step:0.1, unit:'mm' },
      { key:'slitWidth', label:'Largura da fenda', type:'number', min:0, step:0.01, unit:'mm' }
    ]}
  ],
  mirrorSlit: [
    { title: 'Geometria', fields: [...commonPosition,
      { key:'length', label:'Altura total', type:'number', min:0.1, step:0.1, unit:'mm' },
      { key:'slitWidth', label:'Largura da fenda', type:'number', min:0, step:0.01, unit:'mm' }
    ]},
    { title:'Revestimento das lâminas', fields:[
      {key:'reflectivity',label:'Refletividade',type:'number',min:0,max:1,step:0.01},
      {key:'roughness',label:'Perda por rugosidade',type:'number',min:0,max:1,step:0.01}
    ]}
  ],
  blocker: [ { title:'Geometria', fields:[...commonPosition, {key:'length',label:'Comprimento',type:'number',min:0.1,step:0.1,unit:'mm'}] } ],
  splitter: [
    { title:'Geometria', fields:[...commonPosition,{key:'length',label:'Comprimento útil',type:'number',min:0.1,step:0.1,unit:'mm'}] },
    { title:'Divisão', fields:[
      {key:'reflectivity',label:'Fração refletida',type:'number',min:0,max:1,step:0.01},
      {key:'loss',label:'Perdas',type:'number',min:0,max:1,step:0.01}
    ]}
  ],
  dichroic: [
    { title:'Geometria', fields:[...commonPosition,{key:'length',label:'Comprimento útil',type:'number',min:0.1,step:0.1,unit:'mm'}] },
    { title:'Curva espectral', fields:[
      {key:'mode',label:'Reflete',type:'select',options:[{value:'longpass-reflect',label:'λ longos'},{value:'shortpass-reflect',label:'λ curtos'}]},
      {key:'cutoff',label:'Corte 50%',type:'number',min:180,max:2500,step:0.1,unit:'nm'},
      {key:'transitionWidth',label:'Largura de transição',type:'number',min:0.1,step:0.1,unit:'nm'},
      {key:'peakEfficiency',label:'Eficiência máxima',type:'number',min:0,max:1,step:0.01},
      {key:'loss',label:'Perdas residuais',type:'number',min:0,max:1,step:0.01}
    ]}
  ],
  detector: [
    { title:'Geometria', fields:[...commonPosition,
      {key:'length',label:'Largura ativa no plano',type:'number',min:0.1,step:0.1,unit:'mm'},
      {key:'sensorHeight',label:'Altura ativa fora do plano',type:'number',min:0.1,step:0.1,unit:'mm'}
    ] },
    { title:'Amostragem', fields:[
      {key:'pixels',label:'Pixels horizontais',type:'number',min:8,max:8192,step:1},
      {key:'pixelRows',label:'Pixels verticais',type:'number',min:8,max:8192,step:1},
      {key:'quantumEfficiency',label:'Eficiência quântica',type:'number',min:0,max:1,step:0.01},
      {key:'saturation',label:'Saturação/pixel',type:'number',min:0.001,step:1},
      {key:'displayGamma',label:'Gamma de visualização',type:'number',min:0.2,max:4,step:0.05},
      {key:'imageGain',label:'Ganho da imagem',type:'number',min:0.01,max:100,step:0.1}
    ]}
  ]
};

function gratingSchema(reflective) {
  return [
    { title:'Geometria', fields:[...commonPosition,{key:'length',label:'Comprimento útil',type:'number',min:0.1,step:0.1,unit:'mm'}] },
    { title:'Difração', fields:[
      {key:'linesPerMm',label:'Densidade de linhas',type:'number',min:1,max:10000,step:1,unit:'l/mm'},
      {key:'order',label:'Ordem m',type:'number',min:-10,max:10,step:1},
      {key:'grooveSign',label:'Orientação das ranhuras',type:'select',options:[{value:1,label:'+ dispersão'},{value:-1,label:'− dispersão'}]},
      {key:'blazeWavelength',label:'λ de blaze',type:'number',min:0,step:1,unit:'nm'},
      {key:'blazeBandwidth',label:'Banda de eficiência',type:'number',min:0.1,step:1,unit:'nm'},
      {key:'peakEfficiency',label:'Eficiência de pico',type:'number',min:0,max:1,step:0.01},
      {key:'zeroOrderLeak',label:'Vazamento ordem zero',type:'number',min:0,max:1,step:0.01, help: reflective ? 'Adiciona uma reflexão especular fraca.' : 'Adiciona transmissão direta fraca.'}
    ]}
  ];
}

export function createElement(type, x, y) {
  const base = { id: uid(type), type, x, y, angle: 0, name: ELEMENT_META[type]?.label || type };
  const defs = {
    source: { ...base, angle:0, contentType:'spectrum', sourceType:'parallel', aperture:24, imageGeometry:'astronomical', imageWidth:18, imageHeight:12, imageFieldWidthArcmin:20, imageFieldHeightArcmin:13.3333, imageColumns:128, imageColorMode:'rgb', imageMonoWavelength:550, imageLambdaMin:420, imageLambdaMax:680, imageSpectralSamples:9, imageDataUrl:'', imageFileName:'', imagePixelWidth:0, imagePixelHeight:0, imageColumnRGB:[], divergence:2, rayCount:11, spectrum:'white', wavelength:550, lambdaMin:400, lambdaMax:700, spectralSamples:15, temperature:5800, customLines:'486.1:0.7, 656.3:1', intensity:1, enabled:true },
    mirror: { ...base, angle:45, length:28, reflectivity:0.94, roughness:0 },
    conicMirror: { ...base, angle:180, conicType:'parabola', aperture:35, holeDiameter:0, focalLength:70, conicK:-1, reflectivity:0.92 },
    lens: { ...base, angle:0, length:28, focalLength:55, lensClass:'achromat', material:'N-BK7', referenceWavelength:546.1, transmission:0.96 },
    prism: { ...base, angle:0, width:30, height:30, material:'N-BK7', surfaceTransmission:0.97 },
    gratingR: { ...base, angle:135, length:30, linesPerMm:600, order:1, grooveSign:1, blazeWavelength:550, blazeBandwidth:250, peakEfficiency:0.75, zeroOrderLeak:0.03 },
    gratingT: { ...base, angle:0, length:30, linesPerMm:600, order:1, grooveSign:1, blazeWavelength:550, blazeBandwidth:250, peakEfficiency:0.75, zeroOrderLeak:0.03 },
    slit: { ...base, angle:0, length:32, slitWidth:0.08 },
    mirrorSlit: { ...base, angle:0, length:32, slitWidth:0.08, reflectivity:0.94, roughness:0 },
    blocker: { ...base, angle:0, length:28 },
    splitter: { ...base, angle:45, length:28, reflectivity:0.5, loss:0.04 },
    dichroic: { ...base, angle:45, length:28, mode:'longpass-reflect', cutoff:600, transitionWidth:25, peakEfficiency:0.95, loss:0.03 },
    detector: { ...base, angle:0, length:22, sensorHeight:14.7, pixels:765, pixelRows:510, quantumEfficiency:0.85, saturation:100, displayGamma:1, imageGain:1, name:'CCD' }
  };
  return defs[type];
}

export function getMeta(element) { return ELEMENT_META[element.type] || {label:element.type,subtitle:''}; }
export function normalizeElement(element) {
  if(!element?.type) return element;
  const hadImageGeometry=Object.prototype.hasOwnProperty.call(element,'imageGeometry');
  const hadConicType=Object.prototype.hasOwnProperty.call(element,'conicType');
  const normalized=Object.assign(createElement(element.type,Number(element.x||0),Number(element.y||0)),element);
  // Cenas da versão 2.0 tratavam a imagem como objeto físico emissor. Preserve esse
  // comportamento ao carregar arquivos antigos; novas fontes-imagem começam no infinito.
  if(element.type==='source'&&element.contentType==='image'&&!hadImageGeometry) normalized.imageGeometry='finite';
  if(element.type==='conicMirror') {
    // Migração de cenas antigas: elipses deixam de ser uma opção. O perfil legado é
    // aproximado pelo tipo permitido mais próximo.
    if(!hadConicType) {
      const legacyK=Number(element.conicK);
      normalized.conicType=Number.isFinite(legacyK) && legacyK<-1 ? 'hyperbola' :
        Number.isFinite(legacyK) && Math.abs(legacyK)<0.5 ? 'sphere' : 'parabola';
    }
    syncConicMirror(normalized);
  }
  return normalized;
}
export function getSchema(element) {
  const schema=PROPERTY_SCHEMAS[element.type] || [];
  return [{title:'Identificação',fields:[{key:'name',label:'Nome do elemento',type:'text'}]},...schema];
}
export function getLengthProperty(element) {
  if (element.type === 'source') return element.contentType==='image'&&element.imageGeometry!=='astronomical'?'imageWidth':'aperture';
  if (element.type === 'conicMirror') return 'aperture';
  if (element.type === 'prism') return 'height';
  return 'length';
}
export function getAxis(element) { return angleVec(Number(element.angle || 0)); }
export function getTangent(element) { return perp(getAxis(element)); }

export function getSegment(element) {
  const tangent = getTangent(element);
  const lengthProp = getLengthProperty(element);
  const L = Number(element[lengthProp] || 1);
  const c = {x:Number(element.x), y:Number(element.y)};
  return { a:add(c,mul(tangent,-L/2)), b:add(c,mul(tangent,L/2)), tangent, axis:getAxis(element) };
}

export function getPrismPolygon(element) {
  const w = Math.max(0.01, Number(element.width));
  const h = Math.max(0.01, Number(element.height));
  const c = {x:Number(element.x), y:Number(element.y)};
  return [
    localToWorld({x:-w/2,y:-h/2}, c, element.angle),
    localToWorld({x: w/2,y:0}, c, element.angle),
    localToWorld({x:-w/2,y: h/2}, c, element.angle)
  ];
}

export function syncConicMirror(element, changedKey='') {
  if(element?.type!=='conicMirror') return element;
  const allowed=new Set(['sphere','parabola','hyperbola']);
  if(!allowed.has(element.conicType)) element.conicType='parabola';

  const aperture=Math.max(0.1,Math.abs(Number(element.aperture)||0.1));
  element.aperture=aperture;
  element.holeDiameter=clamp(Math.abs(Number(element.holeDiameter)||0),0,aperture);

  if(element.conicType==='sphere') element.conicK=0;
  else if(element.conicType==='parabola') element.conicK=-1;
  else {
    const k=Number(element.conicK);
    element.conicK=Number.isFinite(k)&&k<-1 ? k : -2;
  }
  return element;
}

export function conicConstant(element) {
  if(element.conicType==='sphere') return 0;
  if(element.conicType==='hyperbola') {
    const k=Number(element.conicK);
    return Number.isFinite(k)&&k<-1 ? k : -2;
  }
  return -1;
}

function conicPointAtLocalY(element,y) {
  const f=Number(element.focalLength);
  const R=2*(Math.abs(f)<1e-5?(f<0?-1e-5:1e-5):f);
  const K=conicConstant(element);
  const under=1-(1+K)*y*y/(R*R);
  if(under<0) return null;
  const denom=R*(1+Math.sqrt(Math.max(0,under)));
  const x=Math.abs(denom)<1e-9?0:y*y/denom;
  return localToWorld({x,y},{x:Number(element.x),y:Number(element.y)},element.angle);
}

// Retorna os dois trechos físicos do espelho separadamente. Essa separação é
// essencial: unir os pontos através do centro criaria uma superfície refletiva
// artificial exatamente onde deveria existir o furo.
export function conicSegments(element, samples = 120) {
  const aperture=Math.max(0.1,Math.abs(Number(element.aperture)||0.1));
  const half=aperture/2;
  const hole=Math.min(aperture,Math.max(0,Math.abs(Number(element.holeDiameter)||0)));
  const gap=hole/2;
  const spans=[];
  if(gap<half-1e-9) {
    spans.push([-half,-gap]);
    if(gap>1e-9) spans.push([gap,half]);
    else spans[0]=[-half,half];
  }
  const totalLength=Math.max(1e-9,aperture-hole);
  return spans.map(([start,end])=>{
    const count=Math.max(2,Math.round(samples*(end-start)/totalLength));
    const pts=[];
    for(let i=0;i<=count;i++) {
      const y=start+(end-start)*i/count;
      const point=conicPointAtLocalY(element,y);
      if(point) pts.push(point);
    }
    return pts;
  }).filter(pts=>pts.length>=2);
}

export function conicPoints(element, samples = 120) {
  return conicSegments(element,samples).flat();
}

export function getHandles(element) {
  const c = {x:Number(element.x), y:Number(element.y)};
  if (element.type === 'prism') {
    const t = getTangent(element);
    return [add(c,mul(t,-element.height/2)), add(c,mul(t,element.height/2))];
  }
  if (element.type === 'conicMirror') {
    const t = getTangent(element);
    return [add(c,mul(t,-element.aperture/2)), add(c,mul(t,element.aperture/2))];
  }
  if (element.type === 'source') {
    const t = getTangent(element);
    const width=Number(element[element.contentType==='image'&&element.imageGeometry!=='astronomical'?'imageWidth':'aperture']||1);
    return [add(c,mul(t,-width/2)), add(c,mul(t,width/2))];
  }
  const seg = getSegment(element);
  return [seg.a, seg.b];
}

export function setFromHandle(element, fixedPoint, movingPoint) {
  const center = mul(add(fixedPoint, movingPoint), 0.5);
  const tangent = norm(sub(movingPoint, fixedPoint));
  const axis = {x:tangent.y, y:-tangent.x};
  element.x = center.x;
  element.y = center.y;
  element.angle = wrapAngle(radToDeg(Math.atan2(axis.y, axis.x)));
  element[getLengthProperty(element)] = Math.max(0.01, len(sub(movingPoint,fixedPoint)));
}

export function hitTestElement(element, p, tolerance = 2) {
  if (element.type === 'source') {
    const seg = getSegment(element);
    return distancePointSegment(p, seg.a, seg.b) <= tolerance;
  }
  if (element.type === 'prism') {
    const poly = getPrismPolygon(element);
    if (polygonContains(p, poly)) return true;
    return poly.some((a,i)=>distancePointSegment(p,a,poly[(i+1)%poly.length])<=tolerance);
  }
  if (element.type === 'conicMirror') {
    return conicSegments(element,80).some(pts=>
      pts.some((a,i)=>i<pts.length-1&&distancePointSegment(p,a,pts[i+1])<=tolerance)
    );
  }
  const seg = getSegment(element);
  return distancePointSegment(p, seg.a, seg.b) <= tolerance;
}

export function emitSource(source, quality='normal') {
  if (!source.enabled || source.intensity <= 0) return [];
  if(source.contentType==='image') return emitImageSource(source,quality);
  const spectral = makeSpectrum(source, quality);
  const rays = [];
  const axis = getAxis(source);
  const tangent = getTangent(source);
  const c = {x:Number(source.x),y:Number(source.y)};
  const countFactor = quality === 'high' ? 1.6 : quality === 'fast' ? 0.65 : 1;
  const nGeom = clamp(Math.round(Number(source.rayCount || 1)*countFactor),1,450);
  const divergence = Number(source.divergence || 0);
  for (let i=0;i<nGeom;i++) {
    const u = nGeom===1 ? 0 : i/(nGeom-1)-0.5;
    let pos = c;
    let dir = axis;
    if (source.sourceType === 'parallel') {
      pos = add(c,mul(tangent,u*Number(source.aperture||0)));
      dir = angleVec(Number(source.angle) + u*divergence);
    } else {
      pos = c;
      dir = angleVec(Number(source.angle) + u*divergence);
    }
    for (const sp of spectral) {
      rays.push({
        pos:{...pos}, dir:norm(dir), wavelength:sp.wavelength,
        intensity:Number(source.intensity||0)*sp.weight/nGeom,
        sourceId:source.id, depth:0, path:[], lastElementId:null, imageMeta:null
      });
    }
  }
  return rays;
}

function emitImageSource(source,quality) {
  if(!source.imageDataUrl) return [];
  return source.imageGeometry==='astronomical'
    ? emitAstronomicalImageSource(source,quality)
    : emitFiniteImageSource(source,quality);
}

function imageSampling(source,quality) {
  const q=quality==='high'?1.35:quality==='fast'?0.72:1;
  return {
    nCols:clamp(Math.round(Number(source.imageColumns||128)*q),4,512),
    nBundle:clamp(Math.round(Number(source.rayCount||11)*q),1,400),
    spectral:makeImageSpectrum(source,quality)
  };
}

function emitAstronomicalImageSource(source,quality) {
  const rays=[];
  const axisAngle=Number(source.angle||0);
  const tangent=getTangent(source);
  const c={x:Number(source.x),y:Number(source.y)};
  const {nCols,nBundle,spectral}=imageSampling(source,quality);
  const aperture=Math.max(0.01,Number(source.aperture||24));
  const fieldWidthRad=arcminToRad(Math.max(0.0001,Number(source.imageFieldWidthArcmin||20)));
  const fieldHeightRad=arcminToRad(Math.max(0.0001,Number(source.imageFieldHeightArcmin||13.3333)));
  const objectSpanX=2*Math.tan(fieldWidthRad/2);
  const objectSpanY=2*Math.tan(fieldHeightRad/2);
  const launchIntensity=Number(source.intensity||0)/Math.max(1,nCols*nBundle*spectral.length);
  for(let ci=0;ci<nCols;ci++) {
    const u=nCols===1?0:ci/(nCols-1)-0.5;
    const fieldAngleRad=u*fieldWidthRad;
    const objectCoord=Math.tan(fieldAngleRad);
    const rgb=sampleColumnRgb(source,u);
    // Cada ponto da fotografia representa uma direção no céu. Todos os raios
    // daquele ponto possuem a mesma direção e amostram posições diferentes da pupila.
    const dir=angleVec(axisAngle+fieldAngleRad*180/Math.PI);
    for(let pi=0;pi<nBundle;pi++) {
      const pupil=nBundle===1?0:pi/(nBundle-1)-0.5;
      const pos=add(c,mul(tangent,pupil*aperture));
      for(const sp of spectral) {
        const brightness=rgbSpectralWeight(rgb,sp.wavelength,source.imageColorMode,source.imageMonoWavelength);
        rays.push({
          pos:{...pos},dir:norm(dir),wavelength:sp.wavelength,intensity:launchIntensity,
          sourceId:source.id,depth:0,path:[],lastElementId:null,
          imageMeta:{geometry:'astronomical',u,column:ci,columnCount:nCols,
            pupilIndex:pi,raysPerColumn:nBundle,brightness,launchIntensity,
            objectCoord,objectSpanX,objectSpanY,fieldAngleRad,
            fieldWidthRad,fieldHeightRad,colorMode:source.imageColorMode||'rgb'}
        });
      }
    }
  }
  return rays;
}

function emitFiniteImageSource(source,quality) {
  const rays=[];
  const axis=getAxis(source), tangent=getTangent(source);
  const c={x:Number(source.x),y:Number(source.y)};
  const {nCols,nBundle:nFan,spectral}=imageSampling(source,quality);
  const divergence=Number(source.divergence||24);
  const width=Math.max(0.01,Number(source.imageWidth||18));
  const height=Math.max(0.01,Number(source.imageHeight||width));
  const launchIntensity=Number(source.intensity||0)/Math.max(1,nCols*nFan*spectral.length);
  for(let ci=0;ci<nCols;ci++) {
    const u=nCols===1?0:ci/(nCols-1)-0.5;
    const pos=add(c,mul(tangent,u*width));
    const rgb=sampleColumnRgb(source,u);
    for(let fi=0;fi<nFan;fi++) {
      const fan=nFan===1?0:fi/(nFan-1)-0.5;
      const dir=angleVec(Number(source.angle)+fan*divergence);
      for(const sp of spectral) {
        const brightness=rgbSpectralWeight(rgb,sp.wavelength,source.imageColorMode,source.imageMonoWavelength);
        rays.push({
          pos:{...pos},dir:norm(dir),wavelength:sp.wavelength,intensity:launchIntensity,
          sourceId:source.id,depth:0,path:[],lastElementId:null,
          imageMeta:{geometry:'finite',u,column:ci,columnCount:nCols,fanIndex:fi,raysPerColumn:nFan,
            brightness,launchIntensity,imageWidth:width,imageHeight:height,
            objectCoord:u*width,objectSpanX:width,objectSpanY:height,
            colorMode:source.imageColorMode||'rgb'}
        });
      }
    }
  }
  return rays;
}

function arcminToRad(value) { return Number(value)*Math.PI/(180*60); }

function sampleColumnRgb(source,u) {
  const cols=Array.isArray(source.imageColumnRGB)?source.imageColumnRGB:[];
  if(!cols.length) return [1,1,1];
  const x=clamp((u+0.5)*(cols.length-1),0,cols.length-1);
  const i=Math.floor(x),j=Math.min(cols.length-1,i+1),t=x-i;
  const a=cols[i]||[1,1,1],b=cols[j]||a;
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
}

export function intersectElement(element, ray) {
  if (element.type === 'source') return null;
  if (element.type === 'prism') return intersectPrism(element, ray);
  if (element.type === 'conicMirror') return intersectConic(element, ray);
  const seg = getSegment(element);
  const hit = raySegmentIntersection(ray.pos, ray.dir, seg.a, seg.b);
  if (!hit) return null;
  return { ...hit, tangent:seg.tangent, axis:seg.axis };
}

function intersectPrism(element, ray) {
  const poly = getPrismPolygon(element);
  const area = polygonSignedArea(poly);
  let best = null;
  for (let i=0;i<poly.length;i++) {
    const a=poly[i], b=poly[(i+1)%poly.length];
    const hit=raySegmentIntersection(ray.pos,ray.dir,a,b);
    if (hit && (!best || hit.t<best.t)) {
      const edge = sub(b,a);
      let outward = norm({x:edge.y,y:-edge.x});
      if (area < 0) outward = mul(outward,-1);
      best={...hit, edgeIndex:i, outward, tangent:norm(edge)};
    }
  }
  return best;
}

function intersectConic(element, ray) {
  let best=null;
  let globalIndex=0;
  for(const pts of conicSegments(element,220)) {
    for(let i=0;i<pts.length-1;i++,globalIndex++) {
      const hit=raySegmentIntersection(ray.pos,ray.dir,pts[i],pts[i+1]);
      if(hit&&(!best||hit.t<best.t)) {
        const tangent=norm(sub(pts[i+1],pts[i]));
        best={...hit,tangent,axis:perp(tangent),segmentIndex:globalIndex};
      }
    }
    globalIndex++;
  }
  return best;
}

export function interactElement(element, ray, hit, context) {
  const wl=ray.wavelength;
  switch(element.type) {
    case 'mirror': {
      const out=reflect(ray.dir, perp(hit.tangent));
      const eff=clamp(Number(element.reflectivity)*(1-Number(element.roughness||0)),0,1);
      return [spawn(ray,out,ray.intensity*eff,element.id)];
    }
    case 'conicMirror': {
      const out=reflect(ray.dir, perp(hit.tangent));
      return [spawn(ray,out,ray.intensity*clamp(Number(element.reflectivity),0,1),element.id)];
    }
    case 'lens': return interactLens(element,ray,hit);
    case 'prism': return interactPrism(element,ray,hit);
    case 'gratingR': return interactGrating(element,ray,hit,true);
    case 'gratingT': return interactGrating(element,ray,hit,false);
    case 'slit': {
      const local=dot(sub(hit.point,{x:element.x,y:element.y}),hit.tangent);
      if(Math.abs(local)<=Math.max(0,Number(element.slitWidth))/2) return [spawn(ray,ray.dir,ray.intensity,element.id)];
      return [];
    }
    case 'mirrorSlit': {
      const local=dot(sub(hit.point,{x:element.x,y:element.y}),hit.tangent);
      if(Math.abs(local)<=Math.max(0,Number(element.slitWidth))/2) return [spawn(ray,ray.dir,ray.intensity,element.id)];
      const eff=clamp(Number(element.reflectivity)*(1-Number(element.roughness||0)),0,1);
      return [spawn(ray,reflect(ray.dir,perp(hit.tangent)),ray.intensity*eff,element.id)];
    }
    case 'blocker': return [];
    case 'splitter': {
      const R=clamp(Number(element.reflectivity),0,1);
      const remain=1-clamp(Number(element.loss),0,1);
      const outs=[];
      if(R>0) outs.push(spawn(ray,reflect(ray.dir,perp(hit.tangent)),ray.intensity*remain*R,element.id));
      if(R<1) outs.push(spawn(ray,ray.dir,ray.intensity*remain*(1-R),element.id));
      return outs;
    }
    case 'dichroic': {
      const peak=clamp(Number(element.peakEfficiency),0,1);
      const R=dichroicReflectance(wl,Number(element.cutoff),Number(element.transitionWidth),element.mode)*peak;
      const remain=1-clamp(Number(element.loss),0,1);
      const outs=[];
      if(R>1e-6) outs.push(spawn(ray,reflect(ray.dir,perp(hit.tangent)),ray.intensity*remain*R,element.id));
      if(R<1-1e-6) outs.push(spawn(ray,ray.dir,ray.intensity*remain*(1-R),element.id));
      return outs;
    }
    case 'detector': {
      const coord=dot(sub(hit.point,{x:element.x,y:element.y}),hit.tangent);
      context.recordDetector(element,coord,wl,ray.intensity*clamp(Number(element.quantumEfficiency),0,1),hit.point,ray);
      return [];
    }
    default:return [];
  }
}

function interactLens(element,ray,hit) {
  const axis0=getAxis(element);
  const axis=dot(ray.dir,axis0)>=0?axis0:mul(axis0,-1);
  const tangent=getTangent(element);
  const q=dot(ray.dir,axis);
  const slope=dot(ray.dir,tangent)/Math.max(Math.abs(q),1e-6);
  const height=dot(sub(hit.point,{x:element.x,y:element.y}),tangent);
  const f0=Number(element.focalLength);
  let f=f0;
  if(element.lensClass!=='ideal' && Math.abs(f0)>1e-6) {
    const nRef=refractiveIndex(element.material,Number(element.referenceWavelength||546.1));
    const n=refractiveIndex(element.material,ray.wavelength);
    const raw=f0*(nRef-1)/Math.max(n-1,1e-8);
    const residual={singlet:1,achromat:0.15,apochromat:0.04}[element.lensClass] ?? 1;
    f=f0+(raw-f0)*residual;
  }
  const newSlope=slope-height/(Math.abs(f)<1e-6?1e-6:f);
  const out=norm(add(axis,mul(tangent,newSlope)));
  return [spawn(ray,out,ray.intensity*clamp(Number(element.transmission),0,1),element.id)];
}

function interactPrism(element,ray,hit) {
  const poly=getPrismPolygon(element);
  const inside=polygonContains(ray.pos,poly);
  const nMat=refractiveIndex(element.material,ray.wavelength);
  const n1=inside?nMat:1;
  const n2=inside?1:nMat;
  const normalAgainst=inside?mul(hit.outward,-1):hit.outward;
  const out=refract(ray.dir,normalAgainst,n1,n2);
  const eff=clamp(Number(element.surfaceTransmission),0,1);
  if(!out) return [spawn(ray,reflect(ray.dir,normalAgainst),ray.intensity*eff,element.id)];
  return [spawn(ray,out,ray.intensity*eff,element.id)];
}

function interactGrating(element,ray,hit,reflective) {
  const tangent=norm(hit.tangent);
  const normal=perp(tangent);
  const dMm=1/Math.max(1e-9,Number(element.linesPerMm));
  const lambdaMm=ray.wavelength*1e-6;
  const order=Math.round(Number(element.order));
  const grooveSign=Number(element.grooveSign)||1;
  const sIn=dot(ray.dir,tangent);
  const sOut=sIn+grooveSign*order*lambdaMm/dMm;
  const outs=[];
  if(Math.abs(sOut)<=1) {
    const incomingNormalSign=Math.sign(dot(ray.dir,normal))||1;
    const normalSign=reflective?-incomingNormalSign:incomingNormalSign;
    const out=norm(add(mul(tangent,sOut),mul(normal,normalSign*Math.sqrt(Math.max(0,1-sOut*sOut)))));
    const eff=gratingEfficiency(ray.wavelength,Number(element.blazeWavelength),Number(element.blazeBandwidth),Number(element.peakEfficiency));
    outs.push(spawn(ray,out,ray.intensity*eff,element.id));
  }
  const leak=clamp(Number(element.zeroOrderLeak||0),0,1);
  if(leak>1e-6) {
    const d0=reflective?reflect(ray.dir,normal):ray.dir;
    outs.push(spawn(ray,d0,ray.intensity*leak,element.id));
  }
  return outs;
}

function spawn(parent,dir,intensity,lastElementId) {
  return {
    pos:{...parent.pos}, dir:norm(dir), wavelength:parent.wavelength,
    intensity, sourceId:parent.sourceId, depth:parent.depth+1,
    path:parent.path, lastElementId, imageMeta:parent.imageMeta?{...parent.imageMeta}:null
  };
}

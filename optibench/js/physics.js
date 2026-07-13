import { clamp, gaussian } from './math.js';

export const MATERIALS = {
  'N-BK7': {
    label: 'N-BK7 (crown)',
    B: [1.03961212, 0.231792344, 1.01046945],
    C: [0.00600069867, 0.0200179144, 103.560653],
    transmission: [350, 2500]
  },
  'Fused Silica': {
    label: 'Sílica fundida',
    B: [0.6961663, 0.4079426, 0.8974794],
    C: [0.00467914826, 0.0135120631, 97.9340025],
    transmission: [180, 3500]
  },
  'SF10': {
    label: 'SF10 (flint)',
    B: [1.62153902, 0.256287842, 1.64447552],
    C: [0.0122241457, 0.0595736775, 147.468793],
    transmission: [380, 2400]
  },
  'CaF2': {
    label: 'Fluorita (CaF₂)',
    B: [0.5675888, 0.4710914, 3.8484723],
    C: [0.00252643, 0.010078333, 1200.556],
    transmission: [160, 9000]
  }
};

export function refractiveIndex(materialName, wavelengthNm) {
  const m = MATERIALS[materialName] || MATERIALS['N-BK7'];
  const l = wavelengthNm / 1000;
  const l2 = l * l;
  let n2 = 1;
  for (let i = 0; i < m.B.length; i++) n2 += m.B[i] * l2 / (l2 - m.C[i]);
  return Math.sqrt(Math.max(1, n2));
}

export function blackbodyRelative(wavelengthNm, temperatureK = 5800) {
  const l = wavelengthNm * 1e-9;
  const c2 = 1.438776877e-2;
  const denom = Math.exp(c2 / (l * temperatureK)) - 1;
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return 1 / (Math.pow(l, 5) * denom);
}

export const LINE_PRESETS = {
  mercury: [
    [404.656, 0.55], [435.833, 1.0], [546.074, 1.0], [576.960, 0.62], [579.066, 0.58]
  ],
  neon: [
    [540.056, 0.22], [585.249, 1.0], [588.190, 0.35], [594.483, 0.42], [603.000, 0.55],
    [607.434, 0.45], [609.616, 0.38], [614.306, 0.60], [621.728, 0.48], [626.650, 0.52],
    [633.443, 0.44], [638.299, 0.62], [640.225, 0.43], [650.653, 0.46], [659.895, 0.52],
    [667.828, 0.82], [671.704, 0.44], [692.947, 0.48], [703.241, 0.58]
  ],
  hydrogen: [[410.174, 0.38], [434.047, 0.52], [486.133, 0.78], [656.281, 1.0]],
  calibration: [[404.656, 0.45], [435.833, 0.78], [486.133, 0.48], [546.074, 1], [585.249, 0.75], [656.281, 0.82], [667.828, 0.62]]
};

export function parseCustomLines(text) {
  if (!text) return [];
  const lines = [];
  for (const token of String(text).split(/[;,\n]+/)) {
    const parts = token.trim().split(':');
    const wl = Number(parts[0]);
    const amp = parts.length > 1 ? Number(parts[1]) : 1;
    if (Number.isFinite(wl) && wl > 0 && Number.isFinite(amp) && amp > 0) lines.push([wl, amp]);
  }
  return lines;
}

export function makeSpectrum(source, quality = 'normal') {
  const min = Math.max(180, Number(source.lambdaMin ?? 400));
  const max = Math.min(2500, Number(source.lambdaMax ?? 700));
  const qualityFactor = quality === 'high' ? 1.7 : quality === 'fast' ? 0.62 : 1;
  const requested = Math.round(Number(source.spectralSamples ?? 15) * qualityFactor);
  const n = clamp(requested, 1, 80);
  const type = source.spectrum || 'white';

  if (type === 'mono') return [{ wavelength: Number(source.wavelength ?? 550), weight: 1 }];

  let preset = null;
  if (type === 'mercury') preset = LINE_PRESETS.mercury;
  if (type === 'neon') preset = LINE_PRESETS.neon;
  if (type === 'hydrogen') preset = LINE_PRESETS.hydrogen;
  if (type === 'calibration') preset = LINE_PRESETS.calibration;
  if (type === 'custom') preset = parseCustomLines(source.customLines);
  if (preset) {
    const filtered = preset.filter(([wl]) => wl >= min && wl <= max);
    const sum = filtered.reduce((s, x) => s + x[1], 0) || 1;
    return filtered.map(([wavelength, amp]) => ({ wavelength, weight: amp / sum }));
  }

  const samples = [];
  let sum = 0;
  let maxB = 1;
  if (type === 'blackbody') {
    maxB = 0;
    for (let i = 0; i < n; i++) {
      const wl = n === 1 ? (min + max) / 2 : min + (max - min) * i / (n - 1);
      maxB = Math.max(maxB, blackbodyRelative(wl, Number(source.temperature ?? 5800)));
    }
  }
  for (let i = 0; i < n; i++) {
    const wavelength = n === 1 ? (min + max) / 2 : min + (max - min) * i / (n - 1);
    let weight = 1;
    if (type === 'blackbody') weight = blackbodyRelative(wavelength, Number(source.temperature ?? 5800)) / (maxB || 1);
    samples.push({ wavelength, weight });
    sum += weight;
  }
  return samples.map(s => ({ ...s, weight: s.weight / (sum || 1) }));
}

/**
 * Amostragem espectral usada por uma imagem sRGB. A imagem é interpretada como
 * uma combinação aproximada de três bandas largas, não como uma medida
 * espectroradiométrica. Isso permite que prismas, redes e cromatismo separem as
 * cores sem fingir que um PNG contém um espectro físico completo.
 */
export function makeImageSpectrum(source, quality = 'normal') {
  const mode = source.imageColorMode || 'rgb';
  if (mode === 'mono') return [{ wavelength:Number(source.imageMonoWavelength || 550), weight:1 }];
  const min = clamp(Number(source.imageLambdaMin ?? 420), 180, 2500);
  const max = clamp(Number(source.imageLambdaMax ?? 680), min + 0.1, 2500);
  const factor = quality === 'high' ? 1.35 : quality === 'fast' ? 0.72 : 1;
  const n = clamp(Math.round(Number(source.imageSpectralSamples || 9) * factor), 3, 25);
  const samples=[];
  for(let i=0;i<n;i++) samples.push({wavelength:min+(max-min)*(n===1?0.5:i/(n-1)),weight:1/n});
  return samples;
}

export function rgbSpectralWeight(rgb, wavelengthNm, mode='rgb', monoWavelength=550) {
  const r=clamp(Number(rgb?.[0] ?? 0),0,1);
  const g=clamp(Number(rgb?.[1] ?? 0),0,1);
  const b=clamp(Number(rgb?.[2] ?? 0),0,1);
  const luminance=0.2126*r+0.7152*g+0.0722*b;
  if(mode==='white') return luminance;
  if(mode==='mono') return luminance*gaussian(wavelengthNm-Number(monoWavelength||550),4);
  // Bases largas que aproximam primárias sRGB em uma fonte emissiva genérica.
  const wr=gaussian(wavelengthNm-610,78);
  const wg=gaussian(wavelengthNm-545,62);
  const wb=gaussian(wavelengthNm-455,55);
  return clamp(r*wr+g*wg+b*wb,0,1.8);
}

export function wavelengthToRgbComponents(wavelength) {
  const wl = clamp(wavelength, 380, 780);
  let r = 0, g = 0, b = 0;
  if (wl < 440) { r = -(wl - 440) / 60; b = 1; }
  else if (wl < 490) { g = (wl - 440) / 50; b = 1; }
  else if (wl < 510) { g = 1; b = -(wl - 510) / 20; }
  else if (wl < 580) { r = (wl - 510) / 70; g = 1; }
  else if (wl < 645) { r = 1; g = -(wl - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (wl < 420) f = 0.3 + 0.7 * (wl - 380) / 40;
  else if (wl > 700) f = 0.3 + 0.7 * (780 - wl) / 80;
  const gamma = 0.8;
  const cv = x => Math.round(255 * Math.pow(clamp(x * f, 0, 1), gamma));
  return [cv(r),cv(g),cv(b)];
}

export function wavelengthToRgb(wavelength, alpha = 1) {
  const [r,g,b]=wavelengthToRgbComponents(wavelength);
  return `rgba(${r},${g},${b},${clamp(alpha,0,1)})`;
}

export function gratingEfficiency(wavelengthNm, blazeNm, bandwidthNm, peak = 0.8) {
  if (!blazeNm || !bandwidthNm) return clamp(peak, 0, 1);
  return clamp(peak * gaussian(wavelengthNm - blazeNm, bandwidthNm / 2.355), 0, 1);
}

export function dichroicReflectance(wavelengthNm, cutoffNm, widthNm, mode = 'longpass-reflect') {
  const x = (wavelengthNm - cutoffNm) / Math.max(0.5, widthNm || 10);
  const long = 1 / (1 + Math.exp(-4 * x));
  return mode === 'longpass-reflect' ? long : 1 - long;
}

export function formatWavelength(wl) {
  return wl < 1000 ? `${wl.toFixed(1)} nm` : `${(wl/1000).toFixed(3)} µm`;
}

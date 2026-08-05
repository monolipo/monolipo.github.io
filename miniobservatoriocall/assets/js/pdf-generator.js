/*
 * Lightweight client-side PDF generator for the Miniobservatório INPE proposal portal.
 * No network service or third-party library is required.
 */
(() => {
  'use strict';

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 44;
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  const COLORS = {
    wine: [0.502, 0, 0.125],
    wineDark: [0.337, 0, 0.086],
    blue: [0, 0.404, 0.659],
    ink: [0.10, 0.13, 0.17],
    muted: [0.36, 0.40, 0.46],
    line: [0.80, 0.83, 0.87],
    soft: [0.965, 0.925, 0.938],
    light: [0.955, 0.965, 0.975],
    white: [1, 1, 1]
  };

  const cp1252 = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
    0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
    0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
    0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
  };

  const encoder = new TextEncoder();
  const ascii = value => encoder.encode(String(value));

  function concatBytes(chunks) {
    const len = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(len);
    let offset = 0;
    chunks.forEach(chunk => { out.set(chunk, offset); offset += chunk.length; });
    return out;
  }

  function winAnsiBytes(text) {
    const replacements = {
      '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '∞': 'infinity',
      'λ': 'lambda', 'Λ': 'Lambda', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma',
      'δ': 'delta', 'Δ': 'Delta', 'σ': 'sigma', 'Σ': 'Sigma', 'μ': 'mu',
      'θ': 'theta', 'π': 'pi', 'ρ': 'rho', 'ν': 'nu', 'χ': 'chi',
      '√': 'sqrt', '→': '->', '←': '<-', '↔': '<->', '−': '-', '⁻': '-',
      '⁺': '+', '¹': '1', '²': '2', '³': '3'
    };
    let normalized = String(text ?? '');
    normalized = [...normalized].map(ch => replacements[ch] ?? ch).join('');
    const out = [];
    for (const char of normalized) {
      const code = char.codePointAt(0);
      if (code <= 0x7F || (code >= 0xA0 && code <= 0xFF)) out.push(code);
      else if (cp1252[code] !== undefined) out.push(cp1252[code]);
      else if (char === '\n' || char === '\r' || char === '\t') out.push(0x20);
      else out.push(0x3F);
    }
    return new Uint8Array(out);
  }

  function hexText(text) {
    return Array.from(winAnsiBytes(text), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function base64ToBytes(dataUrl) {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function fmt(n) {
    const value = Number(n);
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(3).replace(/\.000$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function pdfColor(color, stroke = false) {
    return `${color.map(fmt).join(' ')} ${stroke ? 'RG' : 'rg'}\n`;
  }

  class PDFBuilder {
    constructor() {
      this.objects = [null];
      this.catalogId = this.reserve();
      this.pagesId = this.reserve();
      this.fontRegularId = this.add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
      this.fontBoldId = this.add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
      this.fontItalicId = this.add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'));
      this.images = [];
      this.pages = [];
    }

    reserve() { this.objects.push(null); return this.objects.length - 1; }
    add(bytes) { this.objects.push(bytes); return this.objects.length - 1; }
    set(id, bytes) { this.objects[id] = bytes; }

    addStream(bytes, dict = '') {
      const prefix = ascii(`<< /Length ${bytes.length}${dict ? ` ${dict}` : ''} >>\nstream\n`);
      const suffix = ascii('\nendstream');
      return this.add(concatBytes([prefix, bytes, suffix]));
    }

    addJpeg(name, dataUrl, width, height) {
      const bytes = base64ToBytes(dataUrl);
      const object = concatBytes([
        ascii(`<< /Type /XObject /Subtype /Image /Width ${Math.round(width)} /Height ${Math.round(height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`),
        bytes,
        ascii('\nendstream')
      ]);
      const id = this.add(object);
      const image = { name, id, width, height };
      this.images.push(image);
      return image;
    }

    addPage(canvas) { this.pages.push(canvas); }

    build() {
      const pageIds = [];
      this.pages.forEach(page => {
        const content = ascii(page.ops.join(''));
        const contentId = this.addStream(content);
        const pageId = this.reserve();
        pageIds.push(pageId);
        const xObjects = this.images.length
          ? `/XObject << ${this.images.map(img => `/${img.name} ${img.id} 0 R`).join(' ')} >>`
          : '';
        const resources = `<< /Font << /F1 ${this.fontRegularId} 0 R /F2 ${this.fontBoldId} 0 R /F3 ${this.fontItalicId} 0 R >> ${xObjects} >>`;
        this.set(pageId, ascii(`<< /Type /Page /Parent ${this.pagesId} 0 R /MediaBox [0 0 ${fmt(PAGE_W)} ${fmt(PAGE_H)}] /Resources ${resources} /Contents ${contentId} 0 R >>`));
      });
      this.set(this.pagesId, ascii(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`));
      this.set(this.catalogId, ascii(`<< /Type /Catalog /Pages ${this.pagesId} 0 R >>`));

      const chunks = [ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
      const offsets = [0];
      let offset = chunks[0].length;
      for (let id = 1; id < this.objects.length; id++) {
        const body = this.objects[id] || ascii('<< >>');
        offsets[id] = offset;
        const objectBytes = concatBytes([ascii(`${id} 0 obj\n`), body, ascii('\nendobj\n')]);
        chunks.push(objectBytes);
        offset += objectBytes.length;
      }
      const xrefOffset = offset;
      let xref = `xref\n0 ${this.objects.length}\n0000000000 65535 f \n`;
      for (let id = 1; id < this.objects.length; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
      const trailer = `trailer\n<< /Size ${this.objects.length} /Root ${this.catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      chunks.push(ascii(xref + trailer));
      return concatBytes(chunks);
    }
  }

  class PageCanvas {
    constructor() { this.ops = []; }
    y(top) { return PAGE_H - top; }
    text(text, x, top, size = 10, font = 'F1', color = COLORS.ink, align = 'left', width = 0) {
      let drawX = x;
      if (align !== 'left' && width) {
        const measured = measureText(text, size, font === 'F2');
        if (align === 'center') drawX = x + Math.max(0, (width - measured) / 2);
        if (align === 'right') drawX = x + Math.max(0, width - measured);
      }
      this.ops.push(`BT\n/${font} ${fmt(size)} Tf\n${pdfColor(color)}1 0 0 1 ${fmt(drawX)} ${fmt(this.y(top))} Tm\n<${hexText(text)}> Tj\nET\n`);
    }
    line(x1, top1, x2, top2, width = .5, color = COLORS.line) {
      this.ops.push(`q\n${fmt(width)} w\n${pdfColor(color, true)}${fmt(x1)} ${fmt(this.y(top1))} m ${fmt(x2)} ${fmt(this.y(top2))} l S\nQ\n`);
    }
    rect(x, top, w, h, options = {}) {
      const { fill = null, stroke = null, lineWidth = .5 } = options;
      let op = 'q\n';
      if (fill) op += pdfColor(fill);
      if (stroke) op += pdfColor(stroke, true) + `${fmt(lineWidth)} w\n`;
      op += `${fmt(x)} ${fmt(PAGE_H - top - h)} ${fmt(w)} ${fmt(h)} re `;
      op += fill && stroke ? 'B' : fill ? 'f' : 'S';
      op += '\nQ\n';
      this.ops.push(op);
    }
    image(name, x, top, w, h) {
      this.ops.push(`q\n${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(PAGE_H - top - h)} cm\n/${name} Do\nQ\n`);
    }
  }

  function charWidthFactor(ch) {
    if ('ilI.,:;!|\'`'.includes(ch)) return .25;
    if ('mwMW@%&'.includes(ch)) return .83;
    if ('ABCDEFGHKNOPQRSTUVXYZ'.includes(ch)) return .64;
    if (ch === ' ') return .28;
    return .52;
  }

  function measureText(text, size, bold = false) {
    let units = 0;
    for (const ch of String(text ?? '')) units += charWidthFactor(ch);
    return units * size * (bold ? 1.045 : 1);
  }

  function splitLongWord(word, maxWidth, size, bold) {
    const parts = [];
    let current = '';
    for (const ch of word) {
      if (current && measureText(current + ch, size, bold) > maxWidth) {
        parts.push(current);
        current = ch;
      } else current += ch;
    }
    if (current) parts.push(current);
    return parts;
  }

  function wrapText(text, maxWidth, size = 10, bold = false) {
    const normalized = String(text ?? '').replace(/\r/g, '').replace(/\t/g, '    ');
    const paragraphs = normalized.split('\n');
    const lines = [];
    paragraphs.forEach((paragraph, pIndex) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
      } else {
        let line = '';
        words.forEach(originalWord => {
          const parts = measureText(originalWord, size, bold) > maxWidth
            ? splitLongWord(originalWord, maxWidth, size, bold)
            : [originalWord];
          parts.forEach(word => {
            const candidate = line ? `${line} ${word}` : word;
            if (line && measureText(candidate, size, bold) > maxWidth) {
              lines.push(line);
              line = word;
            } else line = candidate;
          });
        });
        if (line) lines.push(line);
      }
      if (pIndex < paragraphs.length - 1 && paragraphs[pIndex + 1].trim()) lines.push('');
    });
    return lines;
  }

  function safe(value, fallback = 'Não informado') {
    const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value ?? '').trim();
    return text || fallback;
  }

  function formatDate(dateString) {
    const map = {
      '2026-08-13': '13 de agosto de 2026', '2026-08-14': '14 de agosto de 2026',
      '2026-08-20': '20 de agosto de 2026', '2026-08-21': '21 de agosto de 2026'
    };
    return map[dateString] || dateString;
  }

  function formatHours(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2).replace(/\.00$/, '')} h` : 'Não informado';
  }

  function sanitizeFilename(text) {
    return String(text || 'proposta')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 55) || 'proposta';
  }

  function makeReference(state) {
    if (state.submissionRef) return state.submissionRef;
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    let seed = 0;
    const source = `${state.basic?.title || ''}${state.team?.pi?.email || ''}${now.toISOString()}`;
    for (const char of source) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    return `MOINPE-2026B-${date}-${String(seed % 10000).padStart(4, '0')}`;
  }

  async function imageUrlToJpeg(url, quality = .93) {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Não foi possível carregar a imagem: ${url}`));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: canvas.width, height: canvas.height };
  }


  function traduzirModo(mode) {
    return ({ Photometry:'Fotometria', Spectroscopy:'Espectroscopia' })[mode] || mode || 'Não selecionado';
  }

  function traduzirTipoAlvo(type) {
    return ({ Science:'Científico', Standard:'Padrão', Comparison:'Comparação', Calibration:'Calibração' })[type] || type || 'Não informado';
  }

  function traduzirDeslocamento(value) {
    return ({ No:'Não', 'Between visits':'Entre visitas', 'Every N frames':'A cada N imagens' })[value] || value || 'Não informado';
  }

  class ProposalRenderer {
    constructor(pdf, state, logoImage, figureImages, reference) {
      this.pdf = pdf;
      this.state = state;
      this.reference = reference;
      this.logo = pdf.addJpeg('ImLogo', logoImage.dataUrl, logoImage.width, logoImage.height);
      this.figures = figureImages.map((fig, idx) => ({ ...fig, pdfImage: pdf.addJpeg(`ImFig${idx + 1}`, fig.dataUrl, fig.width, fig.height) }));
      this.page = null;
      this.y = 92;
      this.pages = [];
    }

    newPage() {
      const page = new PageCanvas();
      page.image(this.logo.name, MARGIN, 18, 54, 47);
      page.text('INSTITUTO NACIONAL DE PESQUISAS ESPACIAIS', 108, 29, 10.2, 'F2', COLORS.wine);
      page.text('MINIOBSERVATÓRIO DO INPE · TELESCÓPIO C11', 108, 44, 9.3, 'F1', COLORS.ink);
      page.text('PEDIDO DE TEMPO OBSERVACIONAL — 2026B', 108, 58, 8.6, 'F2', COLORS.blue);
      page.text(this.reference, PAGE_W - MARGIN - 150, 29, 7.8, 'F1', COLORS.muted, 'right', 150);
      page.line(MARGIN, 74, PAGE_W - MARGIN, 74, 1.1, COLORS.wine);
      this.page = page;
      this.y = 92;
      this.pages.push(page);
      this.pdf.addPage(page);
      return page;
    }

    ensure(height, forceNew = false) {
      if (!this.page || forceNew || this.y + height > PAGE_H - 50) this.newPage();
    }

    title(text, subtitle = '') {
      this.ensure(75);
      this.page.text(text, MARGIN, this.y, 18, 'F2', COLORS.wine);
      this.y += 22;
      if (subtitle) {
        const lines = wrapText(subtitle, CONTENT_W, 9.2);
        lines.forEach(line => { this.page.text(line, MARGIN, this.y, 9.2, 'F3', COLORS.muted); this.y += 12; });
      }
      this.page.line(MARGIN, this.y + 4, PAGE_W - MARGIN, this.y + 4, .6, COLORS.line);
      this.y += 16;
    }

    section(text) {
      this.ensure(32);
      this.page.rect(MARGIN, this.y, CONTENT_W, 24, { fill: COLORS.soft });
      this.page.text(text, MARGIN + 8, this.y + 16.5, 10.5, 'F2', COLORS.wineDark);
      this.y += 32;
    }

    paragraph(text, options = {}) {
      const size = options.size || 9.2;
      const lineHeight = options.lineHeight || 12;
      const font = options.font || 'F1';
      const color = options.color || COLORS.ink;
      const indent = options.indent || 0;
      const width = options.width || CONTENT_W - indent;
      const lines = wrapText(safe(text), width, size, font === 'F2');
      lines.forEach(line => {
        this.ensure(lineHeight + 2);
        if (line) this.page.text(line, MARGIN + indent, this.y, size, font, color);
        this.y += lineHeight;
      });
      this.y += options.after ?? 5;
    }

    labelValue(label, value, x, width, options = {}) {
      const labelSize = options.labelSize || 7.3;
      const valueSize = options.valueSize || 9.1;
      this.page.text(label.toUpperCase(), x, this.y, labelSize, 'F2', COLORS.muted);
      const lines = wrapText(safe(value), width, valueSize);
      let yy = this.y + 12;
      lines.slice(0, options.maxLines || 4).forEach(line => { this.page.text(line, x, yy, valueSize, 'F1', COLORS.ink); yy += 11.5; });
      return yy - this.y;
    }

    keyGrid(items, columns = 2) {
      const gap = 16;
      const width = (CONTENT_W - gap * (columns - 1)) / columns;
      for (let i = 0; i < items.length; i += columns) {
        const row = items.slice(i, i + columns);
        const heights = row.map(item => {
          const lines = wrapText(safe(item[1]), width, 9.1);
          return 15 + Math.min(lines.length, 4) * 11.5;
        });
        const height = Math.max(34, ...heights) + 8;
        this.ensure(height);
        row.forEach((item, col) => {
          const x = MARGIN + col * (width + gap);
          this.labelValue(item[0], item[1], x, width, { maxLines: 4 });
        });
        this.y += height;
      }
    }

    table(headers, rows, widths, options = {}) {
      const headerH = 25;
      const fontSize = options.fontSize || 7.3;
      const lineH = options.lineHeight || 9;
      const xStarts = [MARGIN];
      widths.forEach((w, i) => { if (i < widths.length - 1) xStarts.push(xStarts[i] + w); });
      const drawHeader = () => {
        this.ensure(headerH + 20);
        this.page.rect(MARGIN, this.y, widths.reduce((a,b)=>a+b,0), headerH, { fill: COLORS.wine });
        headers.forEach((head, i) => this.page.text(head, xStarts[i] + 3, this.y + 16, 7.2, 'F2', COLORS.white));
        this.y += headerH;
      };
      drawHeader();
      rows.forEach((row, rowIndex) => {
        const cellLines = row.map((cell, i) => wrapText(safe(cell, '—'), widths[i] - 6, fontSize).slice(0, options.maxLines || 5));
        const rowH = Math.max(21, ...cellLines.map(lines => Math.max(1, lines.length) * lineH + 7));
        if (this.y + rowH > PAGE_H - 50) { this.newPage(); drawHeader(); }
        if (rowIndex % 2 === 1) this.page.rect(MARGIN, this.y, widths.reduce((a,b)=>a+b,0), rowH, { fill: COLORS.light });
        let x = MARGIN;
        widths.forEach((w, i) => {
          this.page.rect(x, this.y, w, rowH, { stroke: COLORS.line, lineWidth: .35 });
          let yy = this.y + 12;
          cellLines[i].forEach(line => { this.page.text(line, x + 3, yy, fontSize, 'F1', COLORS.ink); yy += lineH; });
          x += w;
        });
        this.y += rowH;
      });
      this.y += 8;
    }

    figure(fig, index) {
      this.newPage();
      this.title(`Figura ${index + 1}`);
      const maxW = CONTENT_W;
      const maxH = 610;
      const ratio = Math.min(maxW / fig.width, maxH / fig.height, 1);
      const w = fig.width * ratio;
      const h = fig.height * ratio;
      const x = MARGIN + (CONTENT_W - w) / 2;
      this.page.image(fig.pdfImage.name, x, this.y, w, h);
      this.y += h + 15;
      this.paragraph(fig.caption || `Figura ${index + 1}.`, { font: 'F3', size: 8.8 });
    }

    addFooters() {
      const total = this.pages.length;
      this.pages.forEach((page, index) => {
        page.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34, .45, COLORS.line);
        page.text(`${this.reference} · Gerado localmente pelo portal de propostas do Miniobservatório`, MARGIN, PAGE_H - 19, 7.1, 'F1', COLORS.muted);
        page.text(`Página ${index + 1}/${total}`, PAGE_W - MARGIN - 70, PAGE_H - 19, 7.1, 'F1', COLORS.muted, 'right', 70);
      });
    }

    render() {
      const s = this.state;
      const pi = s.team?.pi || {};
      const obs = s.observation || {};
      const mode = obs.mode || '';
      const instrument = mode === 'Photometry' ? s.photometry?.instrument : s.spectroscopy?.instrument;

      this.newPage();
      this.title('PEDIDO DE TEMPO OBSERVACIONAL', safe(s.basic?.title));
      this.section('1. RESUMO DA PROPOSTA');
      this.keyGrid([
        ['Título da proposta', s.basic?.title],
        ['Categoria', s.basic?.category],
        ['Tipo de programa', s.basic?.programType || 'Proposta Regular (PR)'],
        ['Modo de execução', s.basic?.observingMode || 'Não selecionado'],
        ['Modo científico', traduzirModo(mode)],
        ['Instrumento', instrument],
        ['Trabalho acadêmico associado', s.basic?.academicProject],
        ['Estudante / orientador', [s.basic?.studentName, s.basic?.advisorName].filter(Boolean).join(' / ') || 'Não se aplica']
      ]);
      this.section('2. RESUMO');
      this.paragraph(s.basic?.abstract, { size: 9.3, lineHeight: 12.2 });
      this.section('3. INVESTIGADOR PRINCIPAL');
      this.keyGrid([
        ['Nome', pi.name], ['Instituição', pi.institution], ['E-mail', pi.email], ['Telefone', pi.phone], ['ORCID', pi.orcid || 'Não informado']
      ], 2);
      if ((s.team?.coauthors || []).length) {
        this.section('4. COAUTORES');
        this.table(['Nome', 'Instituição', 'E-mail', 'Telefone'], (s.team.coauthors || []).map(c => [c.name, c.institution, c.email, c.phone]), [135, 150, 150, 72], { fontSize: 7.5 });
      }
      this.newPage();
      this.title('SOLICITAÇÃO OBSERVACIONAL E CONFIGURAÇÃO TÉCNICA', `${traduzirModo(mode)} · ${safe(instrument)}`);
      this.section('5. TEMPO SOLICITADO E AGENDAMENTO');
      this.keyGrid([
        ['Tempo total solicitado', formatHours(obs.requestedHours)],
        ['Tempo mínimo cientificamente útil', formatHours(obs.minimumHours)],
        ['Datas principais', (obs.primaryDates || []).map(formatDate).join(', ')],
        ['Datas de contingência', (obs.backupDates || []).map(formatDate).join(', ') || 'Não selecionadas'],
        ['Intervalo preferencial', `${safe(obs.preferredStart, '18:30')}–${safe(obs.preferredEnd, '23:59')}`],
        ['Após a meia-noite', obs.afterMidnight === 'Yes' ? `Sim — ${safe(obs.midnightJustification)}` : 'Não'],
        ['Restrição de Lua', obs.moonConstraint],
        ['Condições / massa de ar', `${safe(obs.transparencyConstraint)}; ${safe(obs.seeingConstraint)}; massa de ar ${safe(obs.airmassConstraint)}`],
        ['Distribuição', obs.dateDistribution],
        ['Datas inviáveis', obs.impossibleDates || 'Nenhuma especificada']
      ]);

      this.section('6. CONFIGURAÇÃO INSTRUMENTAL');
      if (mode === 'Photometry') {
        const p = s.photometry || {};
        this.keyGrid([
          ['Instrumento', p.instrument], ['Filtros', p.filters], ['Agrupamento de pixels', p.binning], ['Leitura', `${safe(p.readout)} s/imagem`],
          ['Ganho / deslocamento', `${safe(p.gain)} / ${safe(p.offset)}`], ['Temperatura do detector', `${safe(p.temperature)} °C`],
          ['Região de interesse / subquadro', p.subframe], ['Cadência desejada', p.cadence ? `${p.cadence} s` : 'Não informada'],
          ['Deslocamento entre imagens', traduzirDeslocamento(p.dither)], ['Calibrações', p.calibrations], ['Estrelas de comparação', p.comparisonStrategy]
        ]);
      } else {
        const p = s.spectroscopy || {};
        this.keyGrid([
          ['Instrumento', p.instrument], ['Região em comprimento de onda', p.region], ['Características principais', p.features], ['Poder de resolução', p.resolution ? `R = ${p.resolution}` : 'Não informado'],
          ['Fenda', p.slit], ['Agrupamento de pixels', p.binning], ['Leitura', `${safe(p.readout)} s/imagem`], ['Guiagem', p.guiding],
          ['Relação sinal-ruído necessária', p.snr], ['Definição da relação sinal-ruído', p.snrDefinition], ['Sequência de calibração', p.calibrations]
        ]);
      }
      this.section('7. LISTA DE ALVOS');
      const targets = (s.targets || []).filter(t => Object.values(t).some(v => String(v || '').trim()));
      if (targets.length) {
        this.table(
          ['Alvo', 'AR', 'Dec', 'Mag/Banda', 'Tipo', 'Exp.', 'N×V', 'Comentários'],
          targets.map(t => [t.name, t.ra, t.dec, [t.mag, t.band].filter(Boolean).join(' '), traduzirTipoAlvo(t.type), t.exposure ? `${t.exposure}s` : '—', `${safe(t.frames, '—')}×${safe(t.visits, '—')}`, t.comments]),
          [82, 66, 66, 52, 52, 42, 40, 107],
          { fontSize: 6.5, lineHeight: 8.2, maxLines: 4 }
        );
      } else this.paragraph('Nenhum alvo informado.');

      const scientificSections = [
        ['JUSTIFICATIVA CIENTÍFICA', s.science?.scientificJustification],
        ['DESENHO EXPERIMENTAL', s.science?.experimentalDesign],
        ['JUSTIFICATIVA TÉCNICA', s.science?.technicalJustification],
        ['REDUÇÃO E ANÁLISE DOS DADOS', s.science?.reductionAnalysis],
        ['RESULTADOS ESPERADOS E POTENCIAL DE PUBLICAÇÃO', s.science?.expectedResults],
        ['ALOCAÇÕES ANTERIORES E RESULTADOS', s.science?.previousAllocations],
        ['OBSERVAÇÕES COMPLEMENTARES / OUTRAS INSTALAÇÕES', s.science?.complementaryObservations],
        ['PROJETO ALTERNATIVO E MITIGAÇÃO DE RISCOS', s.science?.backupPlan]
      ];
      scientificSections.forEach(([title, content]) => {
        if (!String(content || '').trim() && !['JUSTIFICATIVA CIENTÍFICA','DESENHO EXPERIMENTAL','JUSTIFICATIVA TÉCNICA','REDUÇÃO E ANÁLISE DOS DADOS'].includes(title)) return;
        this.newPage();
        this.title(title);
        this.paragraph(content || 'Não informado.', { size: 9.5, lineHeight: 12.5 });
      });

      if (String(s.science?.references || '').trim()) {
        this.newPage();
        this.title('REFERÊNCIAS');
        this.paragraph(s.science.references, { size: 9, lineHeight: 12 });
      }
      this.figures.forEach((fig, index) => this.figure(fig, index));
      this.addFooters();
    }
  }

  async function normalizeFigures(figures) {
    const output = [];
    for (const fig of figures || []) {
      if (!fig?.dataUrl) continue;
      if (fig.dataUrl.startsWith('data:image/jpeg')) output.push(fig);
      else {
        const converted = await imageUrlToJpeg(fig.dataUrl, .90);
        output.push({ ...fig, ...converted });
      }
    }
    return output;
  }

  function generatePrepared(state, logo, figures = []) {
    const reference = makeReference(state);
    state.submissionRef = reference;
    const pdf = new PDFBuilder();
    const renderer = new ProposalRenderer(pdf, state, logo, figures, reference);
    renderer.render();
    const bytes = pdf.build();
    const pi = sanitizeFilename(state.team?.pi?.name || 'PI');
    const title = sanitizeFilename(state.basic?.title || 'proposta');
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      bytes,
      filename: `MOINPE_2026B_${pi}_${title}.pdf`,
      reference,
      pageCount: renderer.pages.length
    };
  }

  async function generate(state) {
    const logo = await imageUrlToJpeg('assets/img/inpe-logo.png', .95);
    const figures = await normalizeFigures(state.figures || []);
    return generatePrepared(state, logo, figures);
  }

  window.ProposalPDF = { generate, generatePrepared, wrapText, makeReference };
})();

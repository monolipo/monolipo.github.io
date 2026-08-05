(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const byId = id => document.getElementById(id);
  const AUTOSAVE_KEY = 'moinpe-2026b-autosave-v2';
  const SCHEMA = 'moinpe-observing-proposal';
  const VERSION = 2;
  let coauthorCounter = 0;
  let targetCounter = 0;
  let figures = [null, null];
  let lastPdfUrl = null;
  let autosaveTimer = null;

  const basicFieldIds = [
    'proposalTitle','abstract','category','programType','observingMode','academicProject','studentName','advisorName'
  ];
  const piFieldIds = ['piName','piInstitution','piEmail','piPhone','piOrcid'];
  const observationFieldIds = [
    'requestedHours','minimumHours','proposalPriority','preferredStart','preferredEnd','afterMidnight',
    'midnightJustification','moonConstraint','dateDistribution','impossibleDates','seeingConstraint',
    'transparencyConstraint','airmassConstraint','dataRetention'
  ];
  const photFieldIds = [
    'photInstrument','photBinning','photReadout','photGain','photOffset','photTemperature','photSubframe',
    'photDither','photCadence','photCalibrations','photComparisonStrategy'
  ];
  const specFieldIds = [
    'specInstrument','specRegion','specFeatures','specResolution','specSlit','specBinning','specReadout',
    'specGuiding','specSnr','specSnrDefinition','specCalibrations'
  ];
  const scienceFieldIds = [
    'scientificJustification','experimentalDesign','technicalJustification','reductionAnalysis',
    'expectedResults','previousAllocations','complementaryObservations','backupPlan','references'
  ];

  function value(id) { return byId(id)?.value?.trim() ?? ''; }
  function setValue(id, val) { const el = byId(id); if (el) el.value = val ?? ''; }
  function checkedValues(name) { return $$(`input[name="${name}"]:checked`).map(el => el.value); }
  function setCheckedValues(name, values = []) {
    const set = new Set(values || []);
    $$(`input[name="${name}"]`).forEach(el => { el.checked = set.has(el.value); });
  }
  function selectedMode() { return $('input[name="scienceMode"]:checked')?.value || ''; }

  function toast(message, kind = '') {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    byId('toastStack').appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function slug(text) {
    return String(text || 'proposal')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 55) || 'proposal';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  function formatDuration(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s)) return 'not available';
    if (s < 90) return `${s.toFixed(1)} s`;
    if (s < 7200) return `${(s / 60).toFixed(1)} min`;
    return `${(s / 3600).toFixed(2)} h`;
  }

  function wordCount(text) { return String(text || '').trim().split(/\s+/).filter(Boolean).length; }

  function updateCounters() {
    $$('[data-counter-for]').forEach(counter => {
      const input = byId(counter.dataset.counterFor);
      if (!input) return;
      if (input.maxLength > 0) {
        counter.textContent = `${input.value.length}/${input.maxLength}`;
        counter.classList.toggle('over', input.value.length > input.maxLength);
      } else counter.textContent = `${wordCount(input.value)} words`;
    });
  }

  function createCoauthor(data = {}) {
    const id = ++coauthorCounter;
    const wrap = document.createElement('div');
    wrap.className = 'repeat-block coauthor-block';
    wrap.dataset.id = id;
    wrap.innerHTML = `
      <div class="repeat-block__head"><h3>Co-Investigator ${id}</h3><button class="btn btn-danger btn-small remove-coauthor" type="button">Remove</button></div>
      <div class="field-grid">
        <div class="field col-6"><label>Full name</label><input data-key="name" value="${escapeAttr(data.name)}"></div>
        <div class="field col-6"><label>Institution</label><input data-key="institution" value="${escapeAttr(data.institution)}"></div>
        <div class="field col-4"><label>E-mail</label><input data-key="email" type="email" value="${escapeAttr(data.email)}"></div>
        <div class="field col-4"><label>Phone</label><input data-key="phone" type="tel" value="${escapeAttr(data.phone)}"></div>
        <div class="field col-4"><label>ORCID</label><input data-key="orcid" value="${escapeAttr(data.orcid)}"></div>
      </div>`;
    wrap.querySelector('.remove-coauthor').addEventListener('click', () => { wrap.remove(); renumberCoauthors(); scheduleAutosave(); updateProgress(); });
    wrap.addEventListener('input', scheduleAutosave);
    byId('coauthorList').appendChild(wrap);
    renumberCoauthors();
  }

  function renumberCoauthors() {
    $$('.coauthor-block').forEach((block, index) => { block.querySelector('h3').textContent = `Co-Investigator ${index + 1}`; });
  }

  function readCoauthors() {
    return $$('.coauthor-block').map(block => {
      const item = {};
      block.querySelectorAll('[data-key]').forEach(el => { item[el.dataset.key] = el.value.trim(); });
      return item;
    }).filter(item => Object.values(item).some(Boolean));
  }

  function escapeAttr(value) {
    return String(value ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function createTarget(data = {}) {
    const id = ++targetCounter;
    const row = document.createElement('tr');
    row.dataset.id = id;
    row.innerHTML = `
      <td><input class="target-name" data-key="name" value="${escapeAttr(data.name)}" placeholder="Target name"></td>
      <td><input data-key="ra" value="${escapeAttr(data.ra)}" placeholder="hh:mm:ss"></td>
      <td><input data-key="dec" value="${escapeAttr(data.dec)}" placeholder="±dd:mm:ss"></td>
      <td><input data-key="mag" type="number" step="0.01" value="${escapeAttr(data.mag)}"></td>
      <td><input data-key="band" value="${escapeAttr(data.band)}" placeholder="V/G/R"></td>
      <td><select data-key="type"><option>Science</option><option>Standard</option><option>Comparison</option><option>Calibration</option></select></td>
      <td><select data-key="priority"><option>1</option><option>2</option><option>3</option></select></td>
      <td><input data-key="exposure" type="number" min="0" step="0.1" value="${escapeAttr(data.exposure)}"></td>
      <td><input data-key="frames" type="number" min="1" step="1" value="${escapeAttr(data.frames || 1)}"></td>
      <td><input data-key="visits" type="number" min="1" step="1" value="${escapeAttr(data.visits || 1)}"></td>
      <td><input class="target-comments" data-key="comments" value="${escapeAttr(data.comments)}"></td>
      <td><button class="btn btn-danger btn-small remove-target" type="button" title="Remove target">×</button></td>`;
    row.querySelector('[data-key="type"]').value = data.type || 'Science';
    row.querySelector('[data-key="priority"]').value = String(data.priority || '1');
    row.querySelector('.remove-target').addEventListener('click', () => { row.remove(); ensureTargetRow(); updateTimeEstimate(); scheduleAutosave(); });
    row.addEventListener('input', () => { updateTimeEstimate(); scheduleAutosave(); updateProgress(); });
    row.addEventListener('change', () => { updateTimeEstimate(); scheduleAutosave(); updateProgress(); });
    byId('targetRows').appendChild(row);
  }

  function ensureTargetRow() { if (!$('#targetRows tr')) createTarget(); }

  function readTargets() {
    return $$('#targetRows tr').map(row => {
      const item = {};
      row.querySelectorAll('[data-key]').forEach(el => { item[el.dataset.key] = el.value.trim(); });
      return item;
    }).filter(item => Object.values(item).some(v => String(v).trim()));
  }

  function updateModeUI() {
    const mode = selectedMode();
    $$('.choice-card').forEach(card => card.classList.toggle('selected', card.dataset.mode === mode));
    byId('photometrySection').classList.toggle('hidden', mode !== 'Photometry');
    byId('spectroscopySection').classList.toggle('hidden', mode !== 'Spectroscopy');
    byId('summaryMode').textContent = mode || 'Not selected';
    byId('summaryInstrument').textContent = mode === 'Photometry'
      ? 'ASI2600MM Pro + RGB'
      : mode === 'Spectroscopy' ? 'SGSV2.0' : '—';
    updateTimeEstimate();
    updateProgress();
  }

  function updateMidnightUI() {
    const yes = value('afterMidnight') === 'Yes';
    byId('midnightJustificationWrap').classList.toggle('hidden', !yes);
    byId('midnightJustification').required = yes;
  }

  function updateTimeEstimate() {
    const mode = selectedMode();
    const readout = Number(mode === 'Photometry' ? value('photReadout') : value('specReadout')) || 0;
    let scienceSeconds = 0;
    let frameCount = 0;
    readTargets().forEach(t => {
      const exp = Number(t.exposure) || 0;
      const frames = Number(t.frames) || 0;
      const visits = Number(t.visits) || 0;
      scienceSeconds += exp * frames * visits;
      frameCount += frames * visits;
    });
    const total = scienceSeconds + frameCount * readout;
    const requested = Number(value('requestedHours')) || 0;
    const text = frameCount
      ? `Target table: ${frameCount} frames, ${formatDuration(scienceSeconds)} on-source and approximately ${formatDuration(total)} including detector readout. Calibrations, acquisition, slews and other overheads must be added separately.`
      : 'Add exposure times and frame counts to estimate the execution time.';
    byId('timeEstimate').textContent = text;
    byId('summaryEstimate').textContent = frameCount ? formatDuration(total) : '—';
    byId('summaryHours').textContent = requested ? `${requested} h` : '—';
    byId('summaryTargets').textContent = String(readTargets().filter(t => t.name).length);
  }

  function calculatePhotometry() {
    const filter = value('calcPhotFilter');
    const mag = Number(value('calcPhotMag'));
    const snr = Number(value('calcPhotSnr'));
    if (!Number.isFinite(mag) || !Number.isFinite(snr) || snr <= 0) return;
    const A = filter === 'B' ? 450 : 600;
    const rate = A * Math.pow(10, -0.2 * (mag - 5));
    const seconds = 10 * Math.pow(snr / rate, 2);
    const output = `Estimated exposure in ${filter}: ${formatDuration(seconds)} for V = ${mag.toFixed(1)} and SNR = ${snr.toFixed(0)}. Relation used: SNR ≈ ${A} × 10^[−0.2(V−5)] × √(t/10 s).`;
    byId('photCalcOutput').textContent = output;
    byId('photCalcOutput').dataset.result = output;
  }

  function calculateSpectroscopy() {
    const region = value('calcSpecRegion');
    const mag = Number(value('calcSpecMag'));
    const snr = Number(value('calcSpecSnr'));
    if (!Number.isFinite(mag) || !Number.isFinite(snr) || snr <= 0) return;
    const A = region === '420' ? 300 : 200;
    const coeff = region === '420' ? 0.5396 : 0.3010;
    const rate = A * Math.pow(10, -coeff * (mag - 4));
    const seconds = 120 * Math.pow(snr / rate, 2);
    const output = `Estimated integration near ${region} nm: ${formatDuration(seconds)} for V = ${mag.toFixed(1)} and SNR = ${snr.toFixed(0)}. Relation used: SNR ≈ ${A} × 10^[−${coeff}(V−4)] × √(t/120 s).`;
    byId('specCalcOutput').textContent = output;
    byId('specCalcOutput').dataset.result = output;
  }

  function collectState() {
    const basic = {};
    basicFieldIds.forEach(id => basic[id.replace(/^proposal/, 'proposal').replace('proposalTitle','title')] = value(id));
    basic.title = value('proposalTitle');
    delete basic.proposalTitle;
    const pi = { name: value('piName'), institution: value('piInstitution'), email: value('piEmail'), phone: value('piPhone'), orcid: value('piOrcid') };
    const observation = {};
    observationFieldIds.forEach(id => observation[id] = value(id));
    observation.mode = selectedMode();
    observation.primaryDates = checkedValues('primaryDate');
    observation.backupDates = checkedValues('backupDate');
    const photometry = {};
    photFieldIds.forEach(id => photometry[id.replace(/^phot/, '').replace(/^./, c => c.toLowerCase())] = value(id));
    photometry.instrument = value('photInstrument');
    photometry.filters = checkedValues('photFilter');
    photometry.calculatorResult = byId('photCalcOutput').dataset.result || '';
    const spectroscopy = {};
    specFieldIds.forEach(id => spectroscopy[id.replace(/^spec/, '').replace(/^./, c => c.toLowerCase())] = value(id));
    spectroscopy.instrument = value('specInstrument');
    spectroscopy.calculatorResult = byId('specCalcOutput').dataset.result || '';
    const science = {};
    scienceFieldIds.forEach(id => science[id] = value(id));
    const state = {
      schema: SCHEMA,
      version: VERSION,
      call: '2026B',
      savedAt: new Date().toISOString(),
      basic,
      team: { pi, coauthors: readCoauthors() },
      observation,
      photometry,
      spectroscopy,
      targets: readTargets(),
      science,
      figures: figures.filter(Boolean).map((fig, idx) => ({ ...fig, caption: value(`figure${idx + 1}Caption`) || fig.caption || '' })),
      declaration: byId('declaration').checked
    };
    return state;
  }

  function applyState(state) {
    if (!state || state.schema !== SCHEMA) throw new Error('The selected file is not a valid Miniobservatório proposal.');
    const b = state.basic || {};
    setValue('proposalTitle', b.title);
    ['abstract','category','programType','observingMode','academicProject','studentName','advisorName'].forEach(id => setValue(id, b[id]));
    const pi = state.team?.pi || {};
    setValue('piName', pi.name); setValue('piInstitution', pi.institution); setValue('piEmail', pi.email); setValue('piPhone', pi.phone); setValue('piOrcid', pi.orcid);
    byId('coauthorList').innerHTML = '';
    coauthorCounter = 0;
    (state.team?.coauthors || []).forEach(createCoauthor);
    const obs = state.observation || {};
    observationFieldIds.forEach(id => setValue(id, obs[id]));
    $$('input[name="scienceMode"]').forEach(el => { el.checked = el.value === obs.mode; });
    setCheckedValues('primaryDate', obs.primaryDates);
    setCheckedValues('backupDate', obs.backupDates);
    const p = state.photometry || {};
    photFieldIds.forEach(id => {
      const key = id.replace(/^phot/, '').replace(/^./, c => c.toLowerCase());
      setValue(id, p[key]);
    });
    setValue('photInstrument', p.instrument || 'ASI2600MM Pro + RGB + OAG-ASI120MM Mini');
    setCheckedValues('photFilter', p.filters);
    if (p.calculatorResult) { byId('photCalcOutput').textContent = p.calculatorResult; byId('photCalcOutput').dataset.result = p.calculatorResult; }
    const sp = state.spectroscopy || {};
    specFieldIds.forEach(id => {
      const key = id.replace(/^spec/, '').replace(/^./, c => c.toLowerCase());
      setValue(id, sp[key]);
    });
    setValue('specInstrument', sp.instrument || 'SGSV2.0 + ZWO ASI120MM Mini (guider)');
    if (sp.calculatorResult) { byId('specCalcOutput').textContent = sp.calculatorResult; byId('specCalcOutput').dataset.result = sp.calculatorResult; }
    byId('targetRows').innerHTML = '';
    targetCounter = 0;
    (state.targets || []).forEach(createTarget);
    ensureTargetRow();
    const science = state.science || {};
    scienceFieldIds.forEach(id => setValue(id, science[id]));
    figures = [null, null];
    (state.figures || []).slice(0,2).forEach((fig, idx) => { figures[idx] = fig; setValue(`figure${idx + 1}Caption`, fig.caption); renderFigurePreview(idx); });
    byId('declaration').checked = Boolean(state.declaration);
    updateModeUI(); updateMidnightUI(); updateCounters(); updateTimeEstimate(); updateProgress();
    toast('Proposal loaded successfully.', 'success');
  }

  function requiredCompletion() {
    const checks = [
      value('proposalTitle').length >= 10,
      Boolean(value('abstract')),
      Boolean(value('category')),
      Boolean(value('piName')), Boolean(value('piInstitution')), Boolean(value('piEmail')), Boolean(value('piPhone')),
      Boolean(selectedMode()), Number(value('requestedHours')) > 0, Number(value('minimumHours')) > 0,
      checkedValues('primaryDate').length > 0,
      readTargets().some(t => t.name && t.ra && t.dec),
      Boolean(value('scientificJustification')), Boolean(value('experimentalDesign')), Boolean(value('technicalJustification')), Boolean(value('reductionAnalysis')),
      Boolean(value('backupPlan')), byId('declaration').checked
    ];
    if (selectedMode() === 'Photometry') checks.push(checkedValues('photFilter').length > 0);
    return Math.round(100 * checks.filter(Boolean).length / checks.length);
  }

  function updateProgress() {
    const pct = requiredCompletion();
    byId('progressFill').style.width = `${pct}%`;
    byId('progressText').textContent = `${pct}% complete`;
  }

  function clearValidation() {
    $$('.invalid').forEach(el => el.classList.remove('invalid'));
    $$('.validation-message').forEach(el => el.remove());
  }

  function markInvalid(id, message) {
    const el = byId(id);
    if (!el) return;
    el.classList.add('invalid');
    const msg = document.createElement('div');
    msg.className = 'validation-message';
    msg.textContent = message;
    el.closest('.field')?.appendChild(msg);
  }

  function validateState(state) {
    clearValidation();
    const errors = [];
    const warnings = [];
    const add = (id, message) => { errors.push(message); if (id) markInvalid(id, message); };
    if (state.basic.title.length < 10 || state.basic.title.length > 100) add('proposalTitle', 'Proposal title must contain 10–100 characters.');
    if (!state.basic.abstract) add('abstract', 'Abstract is required.');
    if (state.basic.abstract.length > 1000) add('abstract', 'Abstract exceeds 1000 characters.');
    if (wordCount(state.basic.abstract) > 170) warnings.push('The abstract is longer than approximately 150 words.');
    if (!state.basic.category) add('category', 'Select a scientific category.');
    if (!state.team.pi.name) add('piName', 'PI name is required.');
    if (!state.team.pi.institution) add('piInstitution', 'PI institution is required.');
    if (!state.team.pi.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.team.pi.email)) add('piEmail', 'Enter a valid PI e-mail.');
    if (!state.team.pi.phone) add('piPhone', 'PI phone is required.');
    if (!state.observation.mode) errors.push('Select Photometry or Spectroscopy.');
    const total = Number(state.observation.requestedHours);
    const minimum = Number(state.observation.minimumHours);
    if (!(total > 0)) add('requestedHours', 'Total requested time must be greater than zero.');
    if (!(minimum > 0)) add('minimumHours', 'Minimum useful time must be greater than zero.');
    if (minimum > total) add('minimumHours', 'Minimum useful time cannot exceed total requested time.');
    if (!state.observation.primaryDates.length) errors.push('Select at least one primary observing date.');
    if (total > 11 && state.observation.afterMidnight !== 'Yes') warnings.push('The requested time exceeds the preferred 18:30–23:59 windows of the two primary nights; explain the scheduling strategy.');
    if (state.observation.afterMidnight === 'Yes' && !state.observation.midnightJustification) add('midnightJustification', 'An after-midnight extension requires justification.');
    if (state.observation.mode === 'Photometry' && !state.photometry.filters.length) errors.push('Select at least one photometric filter.');
    const validTargets = state.targets.filter(t => t.name || t.ra || t.dec);
    if (!validTargets.length) errors.push('Add at least one target.');
    validTargets.forEach((t, index) => {
      if (!t.name || !t.ra || !t.dec) errors.push(`Target ${index + 1} must include name, RA and Dec.`);
      if (!(Number(t.exposure) > 0)) warnings.push(`Target ${index + 1} has no positive exposure time.`);
    });
    ['scientificJustification','experimentalDesign','technicalJustification','reductionAnalysis','backupPlan'].forEach(id => {
      if (!state.science[id]) add(id, `${id.replace(/([A-Z])/g,' $1')} is required.`);
    });
    if (!state.declaration) errors.push('Confirm the declaration before submission.');
    state.team.coauthors.forEach((c, index) => {
      if ((c.name || c.institution || c.email) && !(c.name && c.institution && c.email)) warnings.push(`Co-author ${index + 1} has incomplete identification.`);
    });
    if (state.team.coauthors.length > 2) warnings.push('More than two co-authors were included; this is allowed, but the call recommends a compact team.');
    if (!state.science.references) warnings.push('No references were included.');
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }

  function saveProposal() {
    const state = collectState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const name = `MOINPE_2026B_${slug(state.team.pi.name || 'PI')}_${slug(state.basic.title)}.moinpe.json`;
    downloadBlob(blob, name);
    toast('Proposal metadata saved to your computer.', 'success');
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        const state = collectState();
        const lightState = { ...state, figures: [] };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(lightState));
      } catch (err) { /* local autosave is best-effort */ }
    }, 500);
  }

  function showReviewValidation(validation) {
    const panel = byId('reviewPanel');
    const content = byId('reviewContent');
    const actions = byId('reviewActions');
    panel.classList.add('show');
    actions.innerHTML = '';
    let html = '';
    if (validation.errors.length) html += `<div class="review-errors"><strong>Submission blocked:</strong><ul>${validation.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
    if (validation.warnings.length) html += `<div class="review-warnings" style="margin-top:.7rem"><strong>Please review:</strong><ul>${validation.warnings.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
    content.innerHTML = html || '<p>No validation issues were found.</p>';
    if (validation.errors.length) {
      actions.innerHTML = '<button class="btn btn-secondary" type="button" id="returnToForm">Return to form</button>';
      byId('returnToForm').addEventListener('click', () => { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  async function submitProposal() {
    const button = byId('submitProposal');
    const state = collectState();
    const validation = validateState(state);
    if (validation.errors.length) {
      showReviewValidation(validation);
      const first = $('.invalid');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    button.disabled = true;
    button.textContent = 'Generating PDF…';
    try {
      const result = await window.ProposalPDF.generate(state);
      if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
      lastPdfUrl = URL.createObjectURL(result.blob);
      downloadBlob(result.blob, result.filename);
      const panel = byId('reviewPanel');
      const content = byId('reviewContent');
      const actions = byId('reviewActions');
      panel.classList.add('show');
      const warningHtml = validation.warnings.length
        ? `<div class="review-warnings"><strong>Review notes:</strong><ul>${validation.warnings.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : '';
      content.innerHTML = `
        <div class="notice notice-success"><strong>PDF generated successfully.</strong><br>Reference: ${escapeHtml(result.reference)} · ${result.pageCount} page(s).</div>
        ${warningHtml}
        <ol>
          <li>Open and inspect every page of the PDF.</li>
          <li>If any field, table, line break or figure is incorrect, return to the form, correct it and generate the proposal again.</li>
          <li>When satisfied, send the final PDF to <strong>leandro.almeida@inpe.br</strong>.</li>
        </ol>
        <p class="muted small">Generating the PDF does not transmit data to a server and does not send the e-mail automatically.</p>`;
      const subject = encodeURIComponent(`[MOINPE 2026B] ${state.basic.title}`);
      const body = encodeURIComponent(`Dear Miniobservatory Time Allocation Coordinator,\n\nPlease find attached my observing time proposal for the 2026B call.\n\nProposal reference: ${result.reference}\nPI: ${state.team.pi.name}\nTitle: ${state.basic.title}\n\nBest regards,`);
      actions.innerHTML = `
        <a class="btn btn-primary" id="openGeneratedPdf" target="_blank" rel="noopener">Open generated PDF</a>
        <a class="btn btn-outline" href="mailto:leandro.almeida@inpe.br?subject=${subject}&body=${body}">Prepare e-mail</a>
        <button class="btn btn-secondary" id="downloadAgain" type="button">Download again</button>`;
      byId('openGeneratedPdf').href = lastPdfUrl;
      byId('downloadAgain').addEventListener('click', () => downloadBlob(result.blob, result.filename));
      $$('.step').forEach(step => step.classList.remove('active'));
      $('[data-step="2"]').classList.add('done');
      $('[data-step="3"]').classList.add('active');
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('PDF generated. Review it before sending.', 'success');
    } catch (err) {
      console.error(err);
      toast(`Could not generate PDF: ${err.message}`, 'error');
      showReviewValidation({ errors: [`PDF generation failed: ${err.message}`], warnings: [] });
    } finally {
      button.disabled = false;
      button.textContent = 'Submeter proposta';
    }
  }

  function openLoadModal() { byId('loadModal').classList.add('show'); }
  function closeLoadModal() { byId('loadModal').classList.remove('show'); }

  async function loadProposalFile(file) {
    try {
      const text = await file.text();
      const state = JSON.parse(text);
      applyState(state);
      closeLoadModal();
    } catch (err) { toast(`Could not load proposal: ${err.message}`, 'error'); }
    byId('proposalFileInput').value = '';
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const split = line => {
      const cells = []; let current = ''; let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"' && quoted) { current += '"'; i++; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) { cells.push(current.trim()); current = ''; }
        else current += ch;
      }
      cells.push(current.trim()); return cells;
    };
    const headers = split(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g,''));
    return lines.slice(1).map(line => {
      const cells = split(line); const row = {};
      headers.forEach((h, i) => {
        const map = { target:'name', name:'name', ra:'ra', dec:'dec', magnitude:'mag', mag:'mag', band:'band', type:'type', priority:'priority', exposure:'exposure', frames:'frames', visits:'visits', comments:'comments' };
        if (map[h]) row[map[h]] = cells[i] || '';
      });
      return row;
    }).filter(row => row.name || row.ra || row.dec);
  }

  function downloadTargetTemplate() {
    const csv = 'target,ra,dec,magnitude,band,type,priority,exposure,frames,visits,comments\nExample Target,12:34:56.7,-12:34:56,10.5,V,Science,1,60,30,1,Primary science target\n';
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'MOINPE_target_list_template.csv');
  }

  async function importTargetCsv(file) {
    try {
      const targets = parseCsv(await file.text());
      if (!targets.length) throw new Error('No valid target rows were found.');
      byId('targetRows').innerHTML = ''; targetCounter = 0;
      targets.forEach(createTarget);
      updateTimeEstimate(); updateProgress(); scheduleAutosave();
      toast(`${targets.length} target(s) imported.`, 'success');
    } catch (err) { toast(`CSV import failed: ${err.message}`, 'error'); }
    byId('targetCsvInput').value = '';
  }

  async function processFigure(file, index) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('Figure exceeds the 8 MB limit.', 'error'); return; }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = dataUrl;
    });
    const maxDim = 1800;
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
    figures[index] = { name: file.name, dataUrl: canvas.toDataURL('image/jpeg', .88), width: canvas.width, height: canvas.height, caption: value(`figure${index + 1}Caption`) };
    renderFigurePreview(index); scheduleAutosave();
  }

  function renderFigurePreview(index) {
    const fig = figures[index];
    const target = byId(`figure${index + 1}Preview`);
    if (!fig) { target.innerHTML = ''; return; }
    target.innerHTML = `<div class="figure-preview"><img src="${fig.dataUrl}" alt="Figure preview"><div><strong>${escapeHtml(fig.name || `Figure ${index + 1}`)}</strong><div class="muted small">${fig.width} × ${fig.height} px</div></div><button class="btn btn-danger btn-small" type="button">Remove</button></div>`;
    target.querySelector('button').addEventListener('click', () => { figures[index] = null; byId(`figure${index + 1}`).value = ''; target.innerHTML = ''; scheduleAutosave(); });
  }

  function demoState() {
    return {
      schema: SCHEMA, version: VERSION, call: '2026B',
      basic: {
        title: 'Differential photometry of a short-period eclipsing binary',
        abstract: 'We propose time-series photometry of a bright eclipsing binary to measure the eclipse depth, refine the time of minimum light and assess short-term variability. Observations in the G and R filters will provide a continuous light curve with a cadence below one minute. The resulting calibrated differential photometry will be compared with published ephemerides and modelled to constrain the eclipse morphology.',
        category: 'Stellar Astrophysics', programType: 'Regular Proposal (RP)', observingMode: 'Queue / Service Observing', academicProject: 'PhD thesis', studentName: 'Example Student', advisorName: 'Example Advisor'
      },
      team: { pi: { name: 'Example Student', institution: 'INPE', email: 'student@example.edu', phone: '+55 12 0000-0000', orcid: '' }, coauthors: [{ name: 'Example Advisor', institution: 'INPE', email: 'advisor@example.edu', phone: '', orcid: '' }] },
      observation: { mode: 'Photometry', requestedHours: '4.0', minimumHours: '2.5', proposalPriority: 'Normal', primaryDates: ['2026-08-13'], backupDates: ['2026-08-20','2026-08-21'], preferredStart: '18:30', preferredEnd: '23:00', afterMidnight: 'No', midnightJustification: '', moonConstraint: 'Any lunar phase', dateDistribution: 'A single continuous four-hour block is preferred.', impossibleDates: '', seeingConstraint: '≤ 5 arcsec', transparencyConstraint: 'Clear', airmassConstraint: '2.0', dataRetention: '24 months' },
      photometry: { instrument: 'ASI2600MM Pro + RGB + OAG-ASI120MM Mini', filters: ['G','R'], binning: '2 × 2', readout: '1.11', gain: '100', offset: 'Instrument standard', temperature: '-10', subframe: 'Full frame', dither: 'No', cadence: '45', calibrations: 'Bias/dark + flats in G and R', comparisonStrategy: 'Ensemble differential photometry with at least three non-variable comparison stars.', calculatorResult: '' },
      spectroscopy: { instrument: 'SGSV2.0 + ZWO ASI120MM Mini (guider)' },
      targets: [{ name: 'Example Binary', ra: '18:00:00', dec: '-20:00:00', mag: '10.5', band: 'V', type: 'Science', priority: '1', exposure: '30', frames: '300', visits: '1', comments: 'Continuous monitoring through eclipse' }],
      science: {
        scientificJustification: 'Eclipsing binaries provide direct constraints on stellar radii, orbital geometry and stellar evolution. The selected target has a well-established short period but its published ephemeris has accumulated uncertainty. A densely sampled eclipse obtained in two filters will measure a new time of minimum light and test whether the eclipse depth is wavelength dependent.',
        experimentalDesign: 'The target will be monitored continuously before, during and after the predicted eclipse. Alternating G and R exposures will provide colour information while maintaining a cadence below one minute. The field contains several comparison stars of similar brightness. Bias/dark frames and flats in both filters will be obtained with the same detector configuration.',
        technicalJustification: 'Thirty-second integrations keep the target and comparison stars within the linear detector regime while providing sufficient signal-to-noise. Including the 1.11 s readout, the expected cadence is approximately 31 s per frame. Four hours cover the baseline and full eclipse, while 2.5 hours constitute the minimum useful allocation.',
        reductionAnalysis: 'Images will be bias/dark corrected and flat-fielded. Differential aperture photometry will be extracted for the target and an ensemble of comparison stars. Time stamps will be converted to a consistent barycentric system. The light curve will be fitted with an eclipse model, and the time of minimum and its uncertainty will be estimated by resampling.',
        expectedResults: 'A calibrated two-band light curve, a new eclipse timing measurement and a comparison with the published ephemeris.',
        previousAllocations: '', complementaryObservations: '',
        backupPlan: 'If transparency is variable but the target remains visible, differential photometry in G will be prioritised. If the primary target is unavailable, a second bright variable in the same sky region will be observed using the same configuration.',
        references: 'Example et al. 2024, AJ, 000, 1'
      }, figures: [], declaration: true
    };
  }

  function initEvents() {
    byId('addCoauthor').addEventListener('click', () => createCoauthor());
    byId('addTarget').addEventListener('click', () => createTarget());
    $$('input[name="scienceMode"]').forEach(el => el.addEventListener('change', () => { updateModeUI(); scheduleAutosave(); }));
    byId('afterMidnight').addEventListener('change', () => { updateMidnightUI(); scheduleAutosave(); });
    byId('calcPhotButton').addEventListener('click', calculatePhotometry);
    byId('calcSpecButton').addEventListener('click', calculateSpectroscopy);
    byId('saveProposal').addEventListener('click', saveProposal);
    byId('submitProposal').addEventListener('click', submitProposal);
    byId('loadProposal').addEventListener('click', openLoadModal);
    byId('loadProposalTop').addEventListener('click', openLoadModal);
    byId('chooseProposalFile').addEventListener('click', () => byId('proposalFileInput').click());
    $$('[data-close-modal]').forEach(el => el.addEventListener('click', closeLoadModal));
    byId('loadModal').addEventListener('click', event => { if (event.target === byId('loadModal')) closeLoadModal(); });
    byId('proposalFileInput').addEventListener('change', event => { if (event.target.files[0]) loadProposalFile(event.target.files[0]); });
    byId('downloadTargetTemplate').addEventListener('click', downloadTargetTemplate);
    byId('importTargets').addEventListener('click', () => byId('targetCsvInput').click());
    byId('targetCsvInput').addEventListener('change', event => { if (event.target.files[0]) importTargetCsv(event.target.files[0]); });
    byId('figure1').addEventListener('change', event => processFigure(event.target.files[0], 0));
    byId('figure2').addEventListener('change', event => processFigure(event.target.files[0], 1));
    ['figure1Caption','figure2Caption'].forEach((id, idx) => byId(id).addEventListener('input', () => { if (figures[idx]) figures[idx].caption = value(id); scheduleAutosave(); }));
    byId('proposalForm').addEventListener('submit', event => event.preventDefault());
    byId('proposalForm').addEventListener('input', () => { updateCounters(); updateProgress(); updateTimeEstimate(); scheduleAutosave(); });
    byId('proposalForm').addEventListener('change', () => { updateCounters(); updateProgress(); updateTimeEstimate(); scheduleAutosave(); });
  }

  function initialize() {
    initEvents();
    ensureTargetRow();
    updateCounters(); updateModeUI(); updateMidnightUI(); updateTimeEstimate(); updateProgress();
    const params = new URLSearchParams(location.search);
    if (params.get('demo') === '1') {
      applyState(demoState());
    } else {
      try {
        const saved = localStorage.getItem(AUTOSAVE_KEY);
        if (saved && confirm('A local autosave was found in this browser. Restore it?')) applyState(JSON.parse(saved));
      } catch (err) { /* ignore damaged autosave */ }
    }
    window.MOINPEApp = { collectState, applyState, validateState, submitProposal, demoState };
  }

  initialize();
})();

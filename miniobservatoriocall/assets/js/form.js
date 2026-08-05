(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const byId = id => document.getElementById(id);
  const AUTOSAVE_KEY = 'moinpe-call-2026b-autosave-v3';
  const SCHEMA = 'moinpe-observing-proposal';
  const VERSION = 3;
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
    return String(text || 'proposta')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 55) || 'proposta';
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
    if (!Number.isFinite(s)) return 'indisponível';
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
      } else counter.textContent = `${wordCount(input.value)} palavras`;
    });
  }

  function createCoauthor(data = {}) {
    const id = ++coauthorCounter;
    const wrap = document.createElement('div');
    wrap.className = 'repeat-block coauthor-block';
    wrap.dataset.id = id;
    wrap.innerHTML = `
      <div class="repeat-block__head"><h3>Coautor ${id}</h3><button class="btn btn-danger btn-small remove-coauthor" type="button">Remover</button></div>
      <div class="field-grid">
        <div class="field col-6"><label>Nome completo</label><input data-key="name" value="${escapeAttr(data.name)}"></div>
        <div class="field col-6"><label>Instituição</label><input data-key="institution" value="${escapeAttr(data.institution)}"></div>
        <div class="field col-4"><label>E-mail</label><input data-key="email" type="email" value="${escapeAttr(data.email)}"></div>
        <div class="field col-4"><label>Telefone</label><input data-key="phone" type="tel" value="${escapeAttr(data.phone)}"></div>
        <div class="field col-4"><label>ORCID</label><input data-key="orcid" value="${escapeAttr(data.orcid)}"></div>
      </div>`;
    wrap.querySelector('.remove-coauthor').addEventListener('click', () => { wrap.remove(); renumberCoauthors(); scheduleAutosave(); updateProgress(); });
    wrap.addEventListener('input', scheduleAutosave);
    byId('coauthorList').appendChild(wrap);
    renumberCoauthors();
  }

  function renumberCoauthors() {
    $$('.coauthor-block').forEach((block, index) => { block.querySelector('h3').textContent = `Coautor ${index + 1}`; });
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


  function normalizeTargetType(type) {
    const map = { 'Científico':'Science', 'Cientifico':'Science', 'Padrão':'Standard', 'Padrao':'Standard', 'Comparação':'Comparison', 'Comparacao':'Comparison', 'Calibração':'Calibration', 'Calibracao':'Calibration' };
    return map[String(type || '').trim()] || type || 'Science';
  }

  function createTarget(data = {}) {
    const id = ++targetCounter;
    const row = document.createElement('tr');
    row.dataset.id = id;
    row.innerHTML = `
      <td><input class="target-name" data-key="name" value="${escapeAttr(data.name)}" placeholder="Nome do alvo"></td>
      <td><input data-key="ra" value="${escapeAttr(data.ra)}" placeholder="hh:mm:ss"></td>
      <td><input data-key="dec" value="${escapeAttr(data.dec)}" placeholder="±dd:mm:ss"></td>
      <td><input data-key="mag" type="number" step="0.01" value="${escapeAttr(data.mag)}"></td>
      <td><input data-key="band" value="${escapeAttr(data.band)}" placeholder="V/G/R"></td>
      <td><select data-key="type"><option value="Science">Científico</option><option value="Standard">Padrão</option><option value="Comparison">Comparação</option><option value="Calibration">Calibração</option></select></td>
      <td><select data-key="priority"><option>1</option><option>2</option><option>3</option></select></td>
      <td><input data-key="exposure" type="number" min="0" step="0.1" value="${escapeAttr(data.exposure)}"></td>
      <td><input data-key="frames" type="number" min="1" step="1" value="${escapeAttr(data.frames || 1)}"></td>
      <td><input data-key="visits" type="number" min="1" step="1" value="${escapeAttr(data.visits || 1)}"></td>
      <td><input class="target-comments" data-key="comments" value="${escapeAttr(data.comments)}"></td>
      <td><button class="btn btn-danger btn-small remove-target" type="button" title="Remover alvo">×</button></td>`;
    row.querySelector('[data-key="type"]').value = normalizeTargetType(data.type);
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
    byId('summaryMode').textContent = mode === 'Photometry' ? 'Fotometria' : mode === 'Spectroscopy' ? 'Espectroscopia' : 'Não selecionado';
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
      ? `Tabela de alvos: ${frameCount} imagens, ${formatDuration(scienceSeconds)} de integração nos alvos e aproximadamente ${formatDuration(total)} incluindo a leitura do detector. Calibrações, aquisição, movimentos do telescópio e demais tempos adicionais devem ser incluídos separadamente.`
      : 'Adicione os tempos de exposição e o número de imagens para estimar o tempo de execução.';
    byId('timeEstimate').textContent = text;
    byId('summaryEstimate').textContent = frameCount ? formatDuration(total) : '—';
    byId('summaryHours').textContent = requested ? `${requested} h` : '—';
    byId('summaryTargets').textContent = String(readTargets().filter(t => t.name).length);
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
    const spectroscopy = {};
    specFieldIds.forEach(id => spectroscopy[id.replace(/^spec/, '').replace(/^./, c => c.toLowerCase())] = value(id));
    spectroscopy.instrument = value('specInstrument');
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


  function migrateLegacyState(state) {
    const clone = JSON.parse(JSON.stringify(state || {}));
    const basic = clone.basic || (clone.basic = {});
    const maps = {
      programType: { 'Regular Proposal (RP)': 'Proposta Regular (PR)' },
      observingMode: { 'Queue / Service Observing':'Observação em modo serviço', 'Classical In-Person':'Observação clássica', 'Classical Remote':'Observação remota', 'Queue Service':'Observação em modo fila' },
      academicProject: { 'No':'Não', 'MSc thesis':'Dissertação de mestrado', 'PhD thesis':'Tese de doutorado', 'Undergraduate research':'Iniciação científica', 'Other':'Outro' }
    };
    Object.entries(maps).forEach(([key,map]) => { if (map[basic[key]]) basic[key]=map[basic[key]]; });
    const obs = clone.observation || (clone.observation = {});
    const obsMaps = {
      moonConstraint: { 'Any lunar phase':'Qualquer fase lunar', 'Dark/grey time preferred':'Tempo escuro ou intermediário preferencial', 'Dark time required':'Tempo escuro obrigatório', 'Bright time acceptable':'Tempo claro aceitável' },
      seeingConstraint: { 'No strict constraint':'Sem restrição rígida', 'Best available':'Melhor disponível', '≤ 5 arcsec':'≤ 5 segundos de arco', '≤ 4 arcsec':'≤ 4 segundos de arco', '≤ 3 arcsec':'≤ 3 segundos de arco' },
      transparencyConstraint: { 'Thin clouds acceptable':'Nuvens finas aceitáveis', 'Clear':'Céu limpo', 'Photometric':'Fotométrico' },
      airmassConstraint: { 'No strict limit':'Sem limite rígido' },
      dataRetention: { '24 months':'24 meses', '12 months':'12 meses', 'No exclusive period':'Sem período de exclusividade' }
    };
    Object.entries(obsMaps).forEach(([key,map]) => { if (map[obs[key]]) obs[key]=map[obs[key]]; });
    const p=clone.photometry || {};
    const pMaps={ offset:{'Instrument standard':'Padrão do instrumento'}, subframe:{'Full frame':'Quadro completo'}, calibrations:{'Bias/dark + twilight or panel flats for each filter':'Imagens de viés/escuro + campos planos de crepúsculo ou painel para cada filtro'} };
    Object.entries(pMaps).forEach(([key,map])=>{ if(map[p[key]]) p[key]=map[p[key]]; });
    clone.version = VERSION;
    return clone;
  }

  function applyState(state) {
    state = migrateLegacyState(state);
    if (!state || state.schema !== SCHEMA) throw new Error('O arquivo selecionado não é uma proposta válida do Miniobservatório.');
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
    const sp = state.spectroscopy || {};
    specFieldIds.forEach(id => {
      const key = id.replace(/^spec/, '').replace(/^./, c => c.toLowerCase());
      setValue(id, sp[key]);
    });
    setValue('specInstrument', sp.instrument || 'SGSV2.0 + ZWO ASI120MM Mini (guiagem)');
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
    toast('Proposta carregada com sucesso.', 'success');
  }

  function requiredCompletion() {
    const checks = [
      value('proposalTitle').length >= 10,
      Boolean(value('abstract')),
      Boolean(value('category')), Boolean(value('observingMode')),
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
    byId('progressText').textContent = `${pct}% concluído`;
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
    if (state.basic.title.length < 10 || state.basic.title.length > 100) add('proposalTitle', 'O título da proposta deve conter entre 10 e 100 caracteres.');
    if (!state.basic.abstract) add('abstract', 'O resumo é obrigatório.');
    if (state.basic.abstract.length > 1000) add('abstract', 'O resumo ultrapassa 1000 caracteres.');
    if (wordCount(state.basic.abstract) > 170) warnings.push('O resumo ultrapassa aproximadamente 150 palavras.');
    if (!state.basic.category) add('category', 'Selecione uma categoria científica.');
    if (!state.basic.observingMode) add('observingMode', 'Selecione um modo de execução.');
    if (!state.team.pi.name) add('piName', 'O nome do Investigador Principal é obrigatório.');
    if (!state.team.pi.institution) add('piInstitution', 'A instituição do Investigador Principal é obrigatória.');
    if (!state.team.pi.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.team.pi.email)) add('piEmail', 'Informe um e-mail válido para o Investigador Principal.');
    if (!state.team.pi.phone) add('piPhone', 'O telefone do Investigador Principal é obrigatório.');
    if (!state.observation.mode) errors.push('Selecione Fotometria ou Espectroscopia.');
    const total = Number(state.observation.requestedHours);
    const minimum = Number(state.observation.minimumHours);
    if (!(total > 0)) add('requestedHours', 'O tempo total solicitado deve ser maior que zero.');
    if (!(minimum > 0)) add('minimumHours', 'O tempo mínimo cientificamente útil deve ser maior que zero.');
    if (minimum > total) add('minimumHours', 'O tempo mínimo cientificamente útil não pode exceder o tempo total solicitado.');
    if (!state.observation.primaryDates.length) errors.push('Selecione ao menos uma data principal de observação.');
    if (total > 11 && state.observation.afterMidnight !== 'Yes') warnings.push('O tempo solicitado excede as janelas preferenciais de 18:30 a 23:59 das duas noites principais; explique a estratégia de agendamento.');
    if (state.observation.afterMidnight === 'Yes' && !state.observation.midnightJustification) add('midnightJustification', 'A extensão após a meia-noite exige justificativa.');
    if (state.observation.mode === 'Photometry' && !state.photometry.filters.length) errors.push('Selecione ao menos um filtro fotométrico.');
    const validTargets = state.targets.filter(t => t.name || t.ra || t.dec);
    if (!validTargets.length) errors.push('Adicione ao menos um alvo.');
    validTargets.forEach((t, index) => {
      if (!t.name || !t.ra || !t.dec) errors.push(`O alvo ${index + 1} deve incluir nome, AR e Dec.`);
      if (!(Number(t.exposure) > 0)) warnings.push(`O alvo ${index + 1} não possui tempo de exposição positivo.`);
    });
    const requiredScience = {
      scientificJustification: 'A justificativa científica é obrigatória.',
      experimentalDesign: 'O desenho experimental é obrigatório.',
      technicalJustification: 'A justificativa técnica é obrigatória.',
      reductionAnalysis: 'A seção de redução e análise dos dados é obrigatória.',
      backupPlan: 'O projeto alternativo e a mitigação de riscos são obrigatórios.'
    };
    Object.entries(requiredScience).forEach(([id, message]) => {
      if (!state.science[id]) add(id, message);
    });
    if (!state.declaration) errors.push('Confirme a declaração antes da submissão.');
    state.team.coauthors.forEach((c, index) => {
      if ((c.name || c.institution || c.email) && !(c.name && c.institution && c.email)) warnings.push(`O coautor ${index + 1} possui identificação incompleta.`);
    });
    if (state.team.coauthors.length > 2) warnings.push('Foram incluídos mais de dois coautores. Isso é permitido, mas recomenda-se uma equipe compacta.');
    if (!state.science.references) warnings.push('Nenhuma referência foi incluída.');
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }

  function saveProposal() {
    const state = collectState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const name = `MOINPE_2026B_${slug(state.team.pi.name || 'PI')}_${slug(state.basic.title)}.moinpe.json`;
    downloadBlob(blob, name);
    toast('Os metadados da proposta foram salvos no computador.', 'success');
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
    if (validation.errors.length) html += `<div class="review-errors"><strong>Submissão bloqueada:</strong><ul>${validation.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
    if (validation.warnings.length) html += `<div class="review-warnings" style="margin-top:.7rem"><strong>Revise os seguintes pontos:</strong><ul>${validation.warnings.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
    content.innerHTML = html || '<p>Nenhum problema de validação foi encontrado.</p>';
    if (validation.errors.length) {
      actions.innerHTML = '<button class="btn btn-secondary" type="button" id="returnToForm">Voltar ao formulário</button>';
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
    button.textContent = 'Gerando PDF…';
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
        ? `<div class="review-warnings"><strong>Observações para revisão:</strong><ul>${validation.warnings.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : '';
      content.innerHTML = `
        <div class="notice notice-success"><strong>PDF gerado com sucesso.</strong><br>Referência: ${escapeHtml(result.reference)} · ${result.pageCount} página(s).</div>
        ${warningHtml}
        <ol>
          <li>Abra e confira todas as páginas do PDF.</li>
          <li>Se algum campo, tabela, quebra de linha ou figura estiver incorreto, volte ao formulário, faça a correção e gere a proposta novamente.</li>
          <li>Quando estiver satisfeito, envie o PDF final para <strong>leandro.almeida@inpe.br</strong>.</li>
        </ol>
        <p class="muted small">A geração do PDF não transmite dados para um servidor e não envia o e-mail automaticamente.</p>`;
      const subject = encodeURIComponent(`[MOINPE 2026B] ${state.basic.title}`);
      const body = encodeURIComponent(`Prezado responsável pela alocação de tempo do Miniobservatório,\n\nSegue em anexo minha proposta de pedido de tempo para a chamada 2026B.\n\nReferência da proposta: ${result.reference}\nInvestigador Principal: ${state.team.pi.name}\nTítulo: ${state.basic.title}\n\nAtenciosamente,`);
      actions.innerHTML = `
        <a class="btn btn-primary" id="openGeneratedPdf" target="_blank" rel="noopener">Abrir PDF gerado</a>
        <a class="btn btn-outline" href="mailto:leandro.almeida@inpe.br?subject=${subject}&body=${body}">Preparar e-mail</a>
        <button class="btn btn-secondary" id="downloadAgain" type="button">Baixar novamente</button>`;
      byId('openGeneratedPdf').href = lastPdfUrl;
      byId('downloadAgain').addEventListener('click', () => downloadBlob(result.blob, result.filename));
      $$('.step').forEach(step => step.classList.remove('active'));
      $('[data-step="2"]').classList.add('done');
      $('[data-step="3"]').classList.add('active');
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('PDF gerado. Revise-o antes do envio.', 'success');
    } catch (err) {
      console.error(err);
      toast(`Não foi possível gerar o PDF: ${err.message}`, 'error');
      showReviewValidation({ errors: [`Falha na geração do PDF: ${err.message}`], warnings: [] });
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
    } catch (err) { toast(`Não foi possível carregar a proposta: ${err.message}`, 'error'); }
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
        const map = { alvo:'name', target:'name', nome:'name', name:'name', ar:'ra', ra:'ra', dec:'dec', declinacao:'dec', magnitude:'mag', mag:'mag', banda:'band', band:'band', tipo:'type', type:'type', prioridade:'priority', priority:'priority', exposicao:'exposure', exposure:'exposure', imagens:'frames', frames:'frames', visitas:'visits', visits:'visits', comentarios:'comments', comments:'comments' };
        if (map[h]) row[map[h]] = cells[i] || '';
      });
      return row;
    }).filter(row => row.name || row.ra || row.dec);
  }

  function downloadTargetTemplate() {
    const csv = 'alvo,ar,dec,magnitude,banda,tipo,prioridade,exposicao,imagens,visitas,comentarios\nAlvo de exemplo,12:34:56.7,-12:34:56,10.5,V,Científico,1,60,30,1,Alvo científico principal\n';
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'MOINPE_modelo_lista_alvos.csv');
  }

  async function importTargetCsv(file) {
    try {
      const targets = parseCsv(await file.text());
      if (!targets.length) throw new Error('Nenhuma linha válida de alvo foi encontrada.');
      byId('targetRows').innerHTML = ''; targetCounter = 0;
      targets.forEach(createTarget);
      updateTimeEstimate(); updateProgress(); scheduleAutosave();
      toast(`${targets.length} alvo(s) importado(s).`, 'success');
    } catch (err) { toast(`Falha na importação do CSV: ${err.message}`, 'error'); }
    byId('targetCsvInput').value = '';
  }

  async function processFigure(file, index) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('A figura ultrapassa o limite de 8 MB.', 'error'); return; }
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
    target.innerHTML = `<div class="figure-preview"><img src="${fig.dataUrl}" alt="Prévia da figura"><div><strong>${escapeHtml(fig.name || `Figura ${index + 1}`)}</strong><div class="muted small">${fig.width} × ${fig.height} px</div></div><button class="btn btn-danger btn-small" type="button">Remover</button></div>`;
    target.querySelector('button').addEventListener('click', () => { figures[index] = null; byId(`figure${index + 1}`).value = ''; target.innerHTML = ''; scheduleAutosave(); });
  }

  function demoState() {
    return {
      schema: SCHEMA, version: VERSION, call: '2026B',
      basic: {
        title: 'Fotometria diferencial de uma binária eclipsante de curto período',
        abstract: 'Propomos uma série temporal fotométrica de uma binária eclipsante brilhante para medir a profundidade do eclipse, refinar o instante de mínimo e investigar variabilidade de curto prazo. Observações nos filtros G e R fornecerão uma curva de luz contínua com cadência inferior a um minuto. A fotometria diferencial calibrada será comparada a efemérides publicadas e modelada para caracterizar a morfologia do eclipse.',
        category: 'Astrofísica estelar', programType: 'Proposta Regular (PR)', observingMode: 'Observação clássica', academicProject: 'Tese de doutorado', studentName: 'Estudante de exemplo', advisorName: 'Orientador de exemplo'
      },
      team: { pi: { name: 'Estudante de exemplo', institution: 'INPE', email: 'estudante@exemplo.edu.br', phone: '+55 12 0000-0000', orcid: '' }, coauthors: [{ name: 'Orientador de exemplo', institution: 'INPE', email: 'orientador@exemplo.edu.br', phone: '', orcid: '' }] },
      observation: { mode: 'Photometry', requestedHours: '4.0', minimumHours: '2.5', proposalPriority: 'Normal', primaryDates: ['2026-08-13'], backupDates: ['2026-08-20','2026-08-21'], preferredStart: '18:30', preferredEnd: '23:00', afterMidnight: 'No', midnightJustification: '', moonConstraint: 'Qualquer fase lunar', dateDistribution: 'É preferível um único bloco contínuo de quatro horas.', impossibleDates: '', seeingConstraint: '≤ 5 segundos de arco', transparencyConstraint: 'Céu limpo', airmassConstraint: '2.0', dataRetention: '24 meses' },
      photometry: { instrument: 'ASI2600MM Pro + RGB + OAG-ASI120MM Mini', filters: ['G','R'], binning: '2 × 2', readout: '1.11', gain: '100', offset: 'Padrão do instrumento', temperature: '-10', subframe: 'Quadro completo', dither: 'No', cadence: '45', calibrations: 'Imagens de viés/escuro e campos planos nos filtros G e R', comparisonStrategy: 'Fotometria diferencial por conjunto com ao menos três estrelas de comparação não variáveis.' },
      spectroscopy: { instrument: 'SGSV2.0 + ZWO ASI120MM Mini (guiagem)' },
      targets: [{ name: 'Binária de exemplo', ra: '18:00:00', dec: '-20:00:00', mag: '10.5', band: 'V', type: 'Science', priority: '1', exposure: '30', frames: '300', visits: '1', comments: 'Monitoramento contínuo durante o eclipse' }],
      science: {
        scientificJustification: 'Binárias eclipsantes fornecem vínculos diretos para raios estelares, geometria orbital e evolução estelar. O alvo selecionado possui período curto bem estabelecido, mas sua efeméride publicada acumulou incerteza. Um eclipse densamente amostrado em dois filtros permitirá medir um novo instante de mínimo e testar se a profundidade do eclipse depende do comprimento de onda.',
        experimentalDesign: 'O alvo será monitorado continuamente antes, durante e depois do eclipse previsto. Exposições alternadas em G e R fornecerão informação de cor, mantendo cadência inferior a um minuto. O campo contém várias estrelas de comparação com brilho semelhante. Serão obtidas imagens de viés/escuro e campos planos nos dois filtros com a mesma configuração do detector.',
        technicalJustification: 'Integrações de trinta segundos mantêm o alvo e as estrelas de comparação na região linear do detector e fornecem relação sinal-ruído suficiente. Incluindo 1,11 s de leitura, a cadência esperada é de aproximadamente 31 s por imagem. Quatro horas cobrem a linha de base e todo o eclipse, enquanto 2,5 horas constituem a alocação mínima útil.',
        reductionAnalysis: 'As imagens serão corrigidas por viés/escuro e campo plano. Será extraída fotometria diferencial de abertura para o alvo e um conjunto de estrelas de comparação. Os instantes serão convertidos para um sistema temporal baricêntrico consistente. A curva de luz será ajustada por um modelo de eclipse, e o instante de mínimo e sua incerteza serão estimados por reamostragem.',
        expectedResults: 'Uma curva de luz calibrada em duas bandas, uma nova medida do instante de eclipse e sua comparação com a efeméride publicada.',
        previousAllocations: '', complementaryObservations: '',
        backupPlan: 'Se a transparência variar, mas o alvo permanecer visível, será priorizada fotometria diferencial em G. Se o alvo principal estiver indisponível, uma segunda variável brilhante na mesma região do céu será observada com a mesma configuração.',
        references: 'Exemplo et al. 2024, AJ, 000, 1'
      }, figures: [], declaration: true
    };
  }

  function initEvents() {
    byId('addCoauthor').addEventListener('click', () => createCoauthor());
    byId('addTarget').addEventListener('click', () => createTarget());
    $$('input[name="scienceMode"]').forEach(el => el.addEventListener('change', () => { updateModeUI(); scheduleAutosave(); }));
    byId('afterMidnight').addEventListener('change', () => { updateMidnightUI(); scheduleAutosave(); });
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
        if (saved && confirm('Foi encontrado um salvamento automático local neste navegador. Deseja restaurá-lo?')) applyState(JSON.parse(saved));
      } catch (err) { /* ignore damaged autosave */ }
    }
    window.MOINPEApp = { collectState, applyState, validateState, submitProposal, demoState };
  }

  initialize();
})();

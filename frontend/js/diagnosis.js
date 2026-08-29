// frontend/js/diagnosis.js
document.addEventListener('DOMContentLoaded', () => {
  initDiagnosis();
});

const DISEASE_FEATURES = {
  diabetes: [
    { name: 'glucose', label: 'Blood Glucose', unit: 'mg/dL', normal: [70,99] },
    { name: 'bmi', label: 'Body Mass Index', unit: 'kg/m²', normal: [18.5,24.9] },
    { name: 'insulin', label: 'Insulin Level', unit: 'μU/mL', normal: [2,25] },
    { name: 'blood_pressure', label: 'Blood Pressure (Diastolic)', unit: 'mmHg', normal: [60,80] },
    { name: 'pregnancies', label: 'Number of Pregnancies', unit: '', normal: [0,10] },
    { name: 'skin_thickness', label: 'Skin Thickness', unit: 'mm', normal: [0,30] },
    { name: 'dpf', label: 'Diabetes Pedigree Function', unit: '', normal: [0,1] }
  ],
  heart: [
    
    { name: 'chest_pain_type', label: 'Chest Pain Type', unit: '', normal: [] },
    { name: 'resting_bp', label: 'Resting Blood Pressure', unit: 'mmHg', normal: [90,120] },
    { name: 'cholesterol', label: 'Cholesterol', unit: 'mg/dL', normal: [100,200] },
    { name: 'fasting_bs', label: 'Fasting Blood Sugar', unit: '', normal: [] },
    { name: 'resting_ecg', label: 'Resting ECG', unit: '', normal: [] },
    { name: 'max_heart_rate', label: 'Max Heart Rate', unit: '', normal: [60,200] },
    { name: 'exercise_angina', label: 'Exercise-Induced Angina', unit: '', normal: [] },
    { name: 'st_depression', label: 'ST Depression', unit: '', normal: [] },
    { name: 'slope', label: 'Slope', unit: '', normal: [] },
    { name: 'num_major_vessels', label: 'Number of Major Vessels', unit: '', normal: [0,4] },
    { name: 'thal', label: 'Thalassemia', unit: '', normal: [] }
  ],
  cancer: [
    { name: 'radius_mean', label: 'Radius (mean)', unit: '', normal: [] },
    { name: 'texture_mean', label: 'Texture (mean)', unit: '', normal: [] },
    { name: 'perimeter_mean', label: 'Perimeter (mean)', unit: '', normal: [] },
    { name: 'area_mean', label: 'Area (mean)', unit: '', normal: [] },
    { name: 'smoothness_mean', label: 'Smoothness (mean)', unit: '', normal: [] }
  ],
  liver: [
    { name: 'total_bilirubin', label: 'Total Bilirubin', unit: 'mg/dL', normal: [0,1.2] },
    { name: 'direct_bilirubin', label: 'Direct Bilirubin', unit: 'mg/dL', normal: [0,0.3] },
    { name: 'alkaline_phosphatase', label: 'Alkaline Phosphatase', unit: 'U/L', normal: [44,147] },
    { name: 'alanine_aminotransferase', label: 'ALT (SGPT)', unit: 'U/L', normal: [7,56] },
    { name: 'aspartate_aminotransferase', label: 'AST (SGOT)', unit: 'U/L', normal: [10,40] },
    { name: 'total_proteins', label: 'Total Proteins', unit: 'g/dL', normal: [6,8.3] },
    { name: 'albumin', label: 'Albumin', unit: 'g/dL', normal: [3.5,5.5] },
    { name: 'ag_ratio', label: 'Albumin/Globulin Ratio', unit: '', normal: [0.8,2.0] }
  ]
};

let selectedDisease = null;
let lastDiagnosis = null;
let limeChart = null;
let featureStatusMap = {}; // maps feature_name (lowercase) -> status ('RED','YELLOW','GREEN','N/A')

function initDiagnosis() {
  // disease select
  document.querySelectorAll('.disease-card').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.disease-card').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      selectedDisease = el.dataset.disease;
      // advance stepper UI to step 2
      document.querySelectorAll('.step-indicator').forEach((s, i) => {
        if (i < 1) s.classList.add('active'); else s.classList.remove('active');
      });
    });
  });

  document.getElementById('toPatientBtn').addEventListener('click', () => {
    if (!selectedDisease) { alert('Please choose a disease'); return; }
    document.getElementById('step-disease').classList.add('hidden');
    document.getElementById('step-patient').classList.remove('hidden');
    // mark step 2 active
    document.querySelectorAll('.step-indicator').forEach((s, i) => {
      if (i <= 1) s.classList.add('active'); else s.classList.remove('active');
    });
    renderFeatureFields(selectedDisease);
  });

  document.getElementById('backToDisease').addEventListener('click', () => {
    document.getElementById('step-patient').classList.add('hidden');
    document.getElementById('step-disease').classList.remove('hidden');
  });

  document.getElementById('patientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = buildPredictPayload();
    if (!payload) return;
    const res = await authFetch('/predict', { method: 'POST', body: JSON.stringify(payload) });
    if (!res || !res.diagnosis_id) { alert(res.error || 'Prediction failed'); return; }
    lastDiagnosis = res;
    showResults(res);

    // call explain (server expects GET with ?id=<D00001>)
    const explain = await authFetch(`/explain?id=${encodeURIComponent(res.diagnosis_id)}`, { method: 'GET' });
    // if server did not provide LIME, compute a client-side estimate
    if (explain && explain.lime_scores && explain.lime_scores.length) {
      renderLimeChart(explain.lime_scores);
      removeLimeNote();
    } else {
      const est = computeLocalLime(payload.features, selectedDisease);
      renderLimeChart(est);
      showLimeNote('Client-side estimated explanations shown (server did not return LIME).');
    }
  });

  document.getElementById('simulateBtn')?.addEventListener('click', async () => {
    if (!lastDiagnosis) return alert('Run a prediction first');
    // collect sliders values
    const inputs = document.querySelectorAll('#whatifControls input[data-feature]');
    const features = {};
    inputs.forEach(i => { features[i.dataset.feature] = Number(i.value); });
    const res = await authFetch('/whatif', { method: 'POST', body: JSON.stringify({ disease: selectedDisease, features }) });
    if (res && res.confidence) {
      showResults(res);
      if (res.lime_scores && res.lime_scores.length) {
        renderLimeChart(res.lime_scores);
        removeLimeNote();
      } else {
        const est = computeLocalLime(features, selectedDisease);
        renderLimeChart(est);
        showLimeNote('Client-side estimated explanations shown (server did not return LIME).');
      }
    }
  });

  document.getElementById('downloadBtn')?.addEventListener('click', () => {
    alert('PDF reports coming soon');
  });
}

function renderFeatureFields(disease) {
  const container = document.getElementById('featureFields');
  container.innerHTML = '';
  const features = DISEASE_FEATURES[disease] || [];

  // create two-column grid for feature cards
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2';
  grid.style.gap = '12px';
  features.forEach(f => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '14px';
    // determine slider min/max/step
    let min = 0, max = 100, step = 1;
    if (f.normal && f.normal.length===2) {
      min = Math.max(0, Math.floor(f.normal[0] * 0.5));
      max = Math.ceil(f.normal[1] * 2);
      // small ranges
      if (f.normal[1] - f.normal[0] <= 1) { step = 0.01; }
    }
    card.innerHTML = `
      <label class="form-label">${f.label}</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="number" data-feature="${f.name}" id="feat_${f.name}" class="form-control" style="flex:1" />
        <div style="min-width:84px; text-align:right; color:var(--accent-cyan); font-weight:700" id="val_${f.name}">—</div>
      </div>
      <div class="small" style="margin-top:6px;color:var(--text-secondary)">Normal: ${f.normal && f.normal.length===2 ? f.normal[0]+' – '+f.normal[1] : '—'}</div>
      <div class="small" id="status_${f.name}" style="margin-top:6px"></div>
    `;
    grid.appendChild(card);
  });
  // create wrapper with left grid and right what-if panel
  const wrapper = document.createElement('div');
  wrapper.style.display = 'grid';
  wrapper.style.gridTemplateColumns = '2fr 1fr';
  wrapper.style.gap = '12px';
  wrapper.appendChild(grid);

  // what-if right panel
  const panel = document.createElement('div');
  panel.className = 'whatif-panel card';
  panel.innerHTML = `<h4>Live Preview</h4><div id="liveList"></div><hr style="opacity:0.06;margin:12px 0"><div id="sliders"></div><div style="margin-top:12px; display:flex; justify-content:center;"><button id="simulateBtnLarge" class="btn" style="width:100%; background:linear-gradient(90deg,var(--accent-cyan),var(--accent-purple)); color:#fff; padding:12px; border-radius:12px;">⚡ Simulate</button></div></div>`;
  wrapper.appendChild(panel);
  container.appendChild(wrapper);

  // attach input and slider controls
  features.forEach(f => {
    const num = document.getElementById('feat_' + f.name);
    const status = document.getElementById('status_' + f.name);
    const valDisplay = document.getElementById('val_' + f.name);
    // default range
    let min = 0, max = 100, step = 1;
    if (f.normal && f.normal.length===2) {
      min = Math.max(0, Math.floor(f.normal[0] * 0.5));
      max = Math.ceil(f.normal[1] * 2);
      if (f.normal[1] - f.normal[0] <= 1) { step = 0.01; }
    }
    // create slider
    const sliderWrap = document.getElementById('sliders');
    const sRow = document.createElement('div');
    sRow.style.marginBottom = '12px';
    sRow.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px"><div style="color:var(--text-secondary)">${f.label}</div><div id="sv_${f.name}" style="color:var(--accent-cyan); font-weight:700">—</div></div><input type="range" id="s_${f.name}" data-feature="${f.name}" min="${min}" max="${max}" step="${step}">`;
    sliderWrap.appendChild(sRow);

    const slider = document.getElementById('s_' + f.name);
    // initialize values
    const initVal = (f.normal && f.normal.length===2) ? ((f.normal[0]+f.normal[1])/2) : (min + (max-min)/2);
    num.value = Number(initVal.toFixed(step<1?2:0));
    slider.value = num.value;
    if (valDisplay) valDisplay.textContent = num.value + (f.unit ? (' ' + f.unit) : '');
    const sv = document.getElementById('sv_' + f.name);
    if (sv) sv.textContent = num.value + (f.unit ? (' ' + f.unit) : '');

    // binding: slider -> number
    slider.addEventListener('input', () => {
      const v = slider.value;
      num.value = v;
      if (valDisplay) valDisplay.textContent = v + (f.unit ? (' ' + f.unit) : '');
      if (sv) sv.textContent = v + (f.unit ? (' ' + f.unit) : '');
      updateLivePreview(f, v, status);
    });

    // binding: number -> slider
    num.addEventListener('input', () => {
      const v = num.value;
      slider.value = v;
      if (valDisplay) valDisplay.textContent = v + (f.unit ? (' ' + f.unit) : '');
      if (sv) sv.textContent = v + (f.unit ? (' ' + f.unit) : '');
      updateLivePreview(f, v, status);
    });
  });

  // hook simulate large button
  document.getElementById('simulateBtnLarge')?.addEventListener('click', async () => {
    const featuresPayload = {};
    features.forEach(f => {
      const v = document.getElementById('feat_' + f.name).value;
      featuresPayload[f.name] = Number(v || 0);
    });
    // call /whatif with disease + features
    const payload = { disease: selectedDisease, features: featuresPayload };
    const res = await authFetch('/whatif', { method: 'POST', body: JSON.stringify(payload) });
    if (!res) return alert('What-if simulation failed');
    // update results section in-place (do not navigate away)
    lastDiagnosis = res;
    showResults(res);
    if (res.lime_scores) renderLimeChart(res.lime_scores);
  });

  // initial live list
  updateAllLivePreview(features);
}

function buildPredictPayload() {
  const patient_name = document.getElementById('patient_name').value.trim();
  const age = Number(document.getElementById('age').value);
  const gender = document.getElementById('gender').value;
  if (!patient_name || !age) { alert('Fill patient name and age'); return null; }
  const features = {};
  document.querySelectorAll('#featureFields input[data-feature]').forEach(i => {
    const f = i.dataset.feature;
    features[f] = Number(i.value || 0);
  });
  return { disease: selectedDisease, patient_name, age, gender, features };
}

function showResults(res) {
  document.getElementById('step-patient').classList.add('hidden');
  document.getElementById('step-results').classList.remove('hidden');
  const header = document.getElementById('resultHeader');
  const roleText = (res.result === 'DETECTED') ? 'DIABETES DETECTED' : 'DIABETES NOT DETECTED';
  header.textContent = roleText;
  const conf = Number(res.confidence || 0);
  const fill = document.getElementById('confidenceFill');
  fill.style.width = Math.min(100, conf) + '%';
  // animated gradient
  fill.style.background = 'linear-gradient(90deg, #00C2D4, #7C3AED)';
  document.getElementById('confidenceLabel').textContent = `${conf.toFixed(1)}% Confidence`;

  // risk pill
  const riskPill = document.getElementById('riskPill');
  const lvl = res.risk_level || 'GREEN';
  let pillHtml = '';
  if (lvl === 'RED') pillHtml = `<span class="badge badge-red">HIGH RISK</span>`;
  else if (lvl === 'YELLOW') pillHtml = `<span class="badge badge-yellow">MEDIUM RISK</span>`;
  else pillHtml = `<span class="badge badge-green">LOW RISK</span>`;
  riskPill.innerHTML = pillHtml;

  // populate featureStatusMap from server response if available
  featureStatusMap = {};
  if (res && res.risk_flags && Array.isArray(res.risk_flags)) {
    res.risk_flags.forEach(f => {
      try { featureStatusMap[String(f.feature).toLowerCase()] = String(f.status).toUpperCase(); } catch(e){}
    });
  }

  // Set header and top icon color according to overall risk
  try {
    const header = document.getElementById('resultHeader');
    const iconWrap = document.getElementById('resultIconWrapper');
    const iconInner = document.getElementById('resultIconInner');
    if (lvl === 'RED') {
      header.style.color = 'var(--accent-red)';
      if (iconWrap) iconWrap.style.background = 'radial-gradient(circle at center, rgba(239,68,68,0.12), rgba(239,68,68,0.06))';
      if (iconInner) { iconInner.style.color = 'var(--accent-red)'; iconInner.textContent = '⚠️'; }
    } else if (lvl === 'YELLOW') {
      header.style.color = 'var(--accent-yellow)';
      if (iconWrap) iconWrap.style.background = 'radial-gradient(circle at center, rgba(245,158,11,0.12), rgba(245,158,11,0.04))';
      if (iconInner) { iconInner.style.color = 'var(--accent-yellow)'; iconInner.textContent = '⚠'; }
    } else {
      header.style.color = 'var(--accent-green)';
      if (iconWrap) iconWrap.style.background = 'radial-gradient(circle at center, rgba(16,185,129,0.12), rgba(16,185,129,0.04))';
      if (iconInner) { iconInner.style.color = 'var(--accent-green)'; iconInner.textContent = '✔️'; }
    }
  } catch (e) {}

  // LIME: show server chart if available; otherwise hide chart and show explanatory text
  const limeCanvas = document.getElementById('limeChart');
  const limeExplainEl = document.getElementById('limeShortExplain');
  if (res.lime_scores && res.lime_scores.length) {
    if (limeCanvas) { limeCanvas.style.display = 'block'; }
    renderLimeChart(res.lime_scores);
    if (limeExplainEl) limeExplainEl.textContent = 'Feature importance (LIME) shows which measurements influenced the prediction most.';
  } else {
    // hide canvas and show a short explanation instead
    if (limeCanvas) { limeCanvas.style.display = 'none'; }
    if (limeExplainEl) limeExplainEl.textContent = 'LIME explanations are not available for this prediction. Clinical risk flags above show which measurements are high-risk.';
    if (limeChart) { try { limeChart.destroy(); } catch(e){} }
  }

  // render risk table from last input values
  renderRiskTableFromInputs();

  // wire bottom buttons
  document.getElementById('newDiagBtn').addEventListener('click', () => { window.location.href = 'new-diagnosis.html'; });
  document.getElementById('downloadBtn').addEventListener('click', () => { downloadReport(); });
  document.getElementById('saveHistoryBtn').addEventListener('click', async () => {
    // the diagnosis is already saved on the server during prediction; navigate to History to view it
    if (!res.diagnosis_id) return alert('No diagnosis id to save');
    // open history and pass highlight id so the user can find it quickly
    window.location.href = `history.html?highlight=${encodeURIComponent(res.diagnosis_id)}`;
  });
}

function renderLimeChart(scores) {
  const canvas = document.getElementById('limeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  console.debug('[diagnosis] renderLimeChart called with scores:', scores);
  // accept arrays of {feature,score} or simple arrays
  let arr = Array.isArray(scores) ? scores.slice() : [];
  // normalize to objects
  arr = arr.map(s => (typeof s === 'number') ? { feature: 'feat', score: s } : s);
  // If no usable scores, try to compute a local estimate to always show something
  if (!arr || arr.length === 0) {
    try {
      const est = computeLocalLime(null, selectedDisease);
      arr = est.slice();
      console.debug('[diagnosis] using local LIME estimate', arr);
    } catch (e) { console.warn('[diagnosis] no LIME data and failed to estimate', e); }
  }
  // sort descending by absolute importance
  arr.sort((a,b) => Math.abs(b.score) - Math.abs(a.score));
  if (!arr || arr.length === 0) {
    // nothing to draw
    try { canvas.style.display = 'none'; } catch(e){}
    return;
  }
  // ensure canvas is visible
  try { canvas.style.display = 'block'; } catch(e){}
  // set canvas height depending on number of bars for better rendering
  try { canvas.height = Math.max(220, arr.length * 36); } catch(e){}
  const labels = arr.map(s => s.feature);
  const data = arr.map(s => Math.abs(Number(s.score)));
  // determine colors using featureStatusMap when possible
  const colors = arr.map(s => {
    const key = String(s.feature || '').toLowerCase();
    // try direct key lookup
    let status = featureStatusMap[key];
    // if not found, try to resolve label->name using DISEASE_FEATURES
    if (!status && selectedDisease && DISEASE_FEATURES[selectedDisease]) {
      const defs = DISEASE_FEATURES[selectedDisease];
      for (let i=0;i<defs.length;i++) {
        if (defs[i].label.toLowerCase() === key || defs[i].name.toLowerCase() === key) {
          status = featureStatusMap[defs[i].name.toLowerCase()];
          break;
        }
      }
    }
    if (status === 'RED') return 'rgba(239,68,68,0.95)';
    if (status === 'YELLOW') return 'rgba(245,158,11,0.95)';
    if (status === 'GREEN' || status === 'NORMAL') return 'rgba(16,185,129,0.9)';
    // fallback: positive/negative sign of original score
    return (Number(s.score) >= 0) ? 'rgba(0,194,212,0.85)' : 'rgba(239,68,68,0.85)';
  });
  // destroy existing
  if (limeChart) { try { limeChart.destroy(); } catch(e){} }
  limeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Feature importance', data, backgroundColor: colors, borderRadius: 8, barThickness: 18 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.03)' } },
        y: { ticks: { color: 'rgba(255,255,255,0.9)', font: { weight:600 } }, grid: { display:false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(3)}` } }
      }
    }
  });
  console.debug('[diagnosis] rendered LIME chart with', labels.length, 'bars');
}

// Compute a simple client-side LIME-like estimate based on deviation from normal ranges
function computeLocalLime(featuresObj, disease) {
  const defs = DISEASE_FEATURES[disease] || [];
  const out = [];
  defs.forEach(f => {
    const name = f.name;
    const label = f.label;
    const val = Number(featuresObj && featuresObj[name] !== undefined ? featuresObj[name] : (document.getElementById('feat_' + name)?.value || 0));
    let score = 0;
    if (f.normal && f.normal.length===2 && !isNaN(val)) {
      const [min, max] = f.normal;
      const mid = (min + max) / 2.0;
      const range = Math.max(1e-6, (max - min) / 2.0);
      const z = (val - mid) / range;
      // clamp z
      const capped = Math.max(-5, Math.min(5, z));
      score = capped / 5.0; // normalized -1..1
    } else {
      // unknown normal: small random deterministic value based on name hash
      let h = 0; for (let i=0;i<name.length;i++) h = (h<<5)-h + name.charCodeAt(i);
      const pseudo = (Math.abs(h) % 100) / 100.0; // 0..0.99
      score = (pseudo - 0.5) * 0.2; // small -0.1..0.1
    }
    out.push({ feature: label, score });
  });
  // sort by absolute score desc
  out.sort((a,b) => Math.abs(b.score) - Math.abs(a.score));
  return out;
}

function showLimeNote(text) {
  const card = document.getElementById('limeChart')?.closest('.card');
  if (!card) return;
  let note = card.querySelector('.lime-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'lime-note small';
    note.style.marginTop = '8px';
    note.style.color = 'var(--text-secondary)';
    card.appendChild(note);
  }
  note.textContent = text;
}

function removeLimeNote() {
  const card = document.getElementById('limeChart')?.closest('.card');
  if (!card) return;
  const note = card.querySelector('.lime-note');
  if (note) note.remove();
}

function renderRiskTableFromInputs() {
  const features = [];
  // collect from DISEASE_FEATURES for selected disease
  const defs = DISEASE_FEATURES[selectedDisease] || [];
  defs.forEach(f => {
    const inp = document.getElementById('feat_' + f.name);
    const val = inp ? inp.value : '';
    let status = '—';
    if (f.normal && f.normal.length===2 && val!=='') {
      const v = Number(val);
      if (v < f.normal[0]) status = 'LOW';
      else if (v > f.normal[1]) status = 'ELEVATED';
      else status = 'NORMAL';
    }
    // also populate featureStatusMap for LIME coloring
    try { featureStatusMap[f.name.toLowerCase()] = (status === 'NORMAL' ? 'GREEN' : (status === 'ELEVATED' || status === 'LOW' ? 'YELLOW' : 'N/A')); } catch(e){}
    features.push({ feature: f.label, value: val + (f.unit ? (' ' + f.unit) : ''), normal: (f.normal && f.normal.length===2) ? `${f.normal[0]} – ${f.normal[1]}` : '—', status });
  });

  const container = document.getElementById('riskTableContainer');
  container.innerHTML = '';
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Measurement</th><th>Value</th><th>Normal</th><th>Status</th></tr></thead>';
  const tbody = document.createElement('tbody');
  features.forEach(r => {
    const tr = document.createElement('tr');
    let cls = '';
    if (r.status === 'ELEVATED') cls = 'badge badge-yellow';
    else if (r.status === 'LOW') cls = 'badge badge-yellow';
    else if (r.status === 'NORMAL') cls = 'badge badge-green';
    tr.innerHTML = `<td>${r.feature}</td><td style="font-weight:700">${r.value}</td><td>${r.normal}</td><td><span class="${cls}">${r.status}</span></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function updateLivePreview(featureDef, rawValue, statusEl) {
  const v = parseFloat(rawValue);
  const liveList = document.getElementById('liveList');
  if (!liveList) return;

  // update status text
  let statusText = '';
  let badge = '';
  if (featureDef.normal && featureDef.normal.length===2 && !isNaN(v)) {
    const [min, max] = featureDef.normal;
    if (v < min) { statusText = 'Low'; badge = 'badge badge-yellow'; }
    else if (v > max) { statusText = 'Elevated'; badge = 'badge badge-red'; }
    else { statusText = 'Normal'; badge = 'badge badge-green'; }
  }
  if (statusEl) statusEl.innerHTML = statusText ? `<span class="${badge}">${statusText}</span>` : '';

  // update live list entry
  let entry = document.getElementById('live_' + featureDef.name);
  if (!entry) {
    entry = document.createElement('div');
    entry.id = 'live_' + featureDef.name;
    entry.style.padding = '10px 0';
    entry.innerHTML = `<div style="display:flex; justify-content:space-between;"><div>${featureDef.label}</div><div id="liveval_${featureDef.name}" style="color:var(--accent-cyan)"></div></div>`;
    document.getElementById('liveList').appendChild(entry);
  }
  document.getElementById('liveval_' + featureDef.name).textContent = (rawValue !== '' ? rawValue + (featureDef.unit ? (' ' + featureDef.unit) : '') : '—');
}

function updateAllLivePreview(features) {
  const liveList = document.getElementById('liveList');
  if (!liveList) return;
  liveList.innerHTML = '';
  features.forEach(f => {
    const val = document.getElementById('feat_' + f.name)?.value || '';
    updateLivePreview(f, val, document.getElementById('status_' + f.name));
  });
}

// Export the results area to a PDF and trigger download
async function downloadReport() {
  const el = document.getElementById('step-results');
  if (!el) return alert('No results to export');
  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf || {};
    const pdf = jsPDF ? new jsPDF('p', 'pt', 'a4') : null;
    if (!pdf) {
      // fallback: download image
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `${lastDiagnosis?.diagnosis_id || 'diagnosis'}-report.png`;
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${lastDiagnosis?.diagnosis_id || 'diagnosis'}-report.pdf`);
  } catch (err) {
    console.error('PDF export failed', err);
    alert('Failed to generate PDF. See console for details.');
  }
}

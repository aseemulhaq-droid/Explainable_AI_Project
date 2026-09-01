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

// Disease display info
const DISEASE_INFO = {
  diabetes: { label: 'Diabetes', icon: '💧', color: '#00C2D4', colorRgb: '0,194,212' },
  heart:    { label: 'Heart Disease', icon: '❤️', color: '#EF4444', colorRgb: '239,68,68' },
  cancer:   { label: 'Breast Cancer', icon: '🔬', color: '#7C3AED', colorRgb: '124,58,237' },
  liver:    { label: 'Liver Disease', icon: '🛡️', color: '#F59E0B', colorRgb: '245,158,11' }
};

// Dynamic explanation templates per risk level and disease
const RISK_EXPLANATIONS = {
  RED: {
    diabetes:  '⚠️ HIGH RISK: Significant indicators of diabetes detected. Immediate consultation with an endocrinologist is strongly recommended. Fasting glucose test and HbA1c levels should be measured urgently.',
    heart:     '⚠️ HIGH RISK: Critical cardiac risk factors identified. Immediate cardiology evaluation is essential. Consider ECG, stress test, and lipid panel urgently.',
    cancer:    '⚠️ HIGH RISK: Abnormal tissue characteristics detected. Urgent referral to an oncologist and biopsy confirmation are strongly recommended. Do not delay evaluation.',
    liver:     '⚠️ HIGH RISK: Severe liver function abnormalities detected. Immediate hepatology consultation is required. Liver biopsy and imaging studies should be arranged promptly.',
    default:   '⚠️ HIGH RISK: Critical health indicators detected. Immediate medical attention and specialist consultation are strongly recommended.'
  },
  YELLOW: {
    diabetes:  '⚡ MODERATE RISK: Some diabetes risk factors are elevated. Schedule an appointment with your doctor within 1–2 weeks. Dietary adjustments and increased physical activity are advised.',
    heart:     '⚡ MODERATE RISK: Several cardiovascular risk factors present. Consult your physician within 2 weeks. Blood pressure monitoring and lifestyle modifications are recommended.',
    cancer:    '⚡ MODERATE RISK: Some tissue characteristics warrant monitoring. Follow-up imaging in 3–6 months is recommended. Maintain regular check-ups with your doctor.',
    liver:     '⚡ MODERATE RISK: Liver enzyme levels are above optimal range. Schedule a follow-up with your doctor within 2–4 weeks. Alcohol avoidance and dietary changes are advised.',
    default:   '⚡ MODERATE RISK: Some health indicators are outside normal ranges. Schedule a follow-up with your doctor within 2 weeks and monitor your condition.'
  },
  GREEN: {
    diabetes:  '✅ LOW RISK: Clinical measurements are within healthy ranges. Maintain a balanced diet, regular exercise, and annual health screenings to stay healthy.',
    heart:     '✅ LOW RISK: Cardiovascular indicators appear healthy. Continue regular exercise, maintain a heart-healthy diet, and schedule routine annual check-ups.',
    cancer:    '✅ LOW RISK: No significant abnormal tissue characteristics detected. Continue regular self-examinations and annual mammography as per age guidelines.',
    liver:     '✅ LOW RISK: Liver function tests are within normal parameters. Maintain healthy lifestyle habits and schedule routine liver panels with annual physicals.',
    default:   '✅ LOW RISK: Clinical measurements appear within healthy ranges. Maintain a healthy lifestyle and continue with regular medical check-ups.'
  }
};

let selectedDisease = null;
let lastDiagnosis = null;
let lastPayload = null;
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
    lastPayload = payload;

    // Show loading state
    const predictBtn = document.getElementById('predictBtn');
    if (predictBtn) { predictBtn.disabled = true; predictBtn.textContent = '⏳ Running AI...'; }

    const res = await authFetch('/predict', { method: 'POST', body: JSON.stringify(payload) });

    if (predictBtn) { predictBtn.disabled = false; predictBtn.textContent = '🤖 Run AI Prediction'; }

    if (!res || !res.diagnosis_id) { alert(res.error || 'Prediction failed'); return; }
    lastDiagnosis = res;

    // Advance stepper to step 3
    document.querySelectorAll('.step-indicator').forEach((s, i) => {
      if (i <= 2) s.classList.add('active'); else s.classList.remove('active');
    });

    showResults(res);

    // call explain (server expects GET with ?id=<D00001>)
    try {
      const explain = await authFetch(`/explain?id=${encodeURIComponent(res.diagnosis_id)}`, { method: 'GET' });
      if (explain && explain.lime_scores && explain.lime_scores.length) {
        renderLimeChart(explain.lime_scores);
        removeLimeNote();
      } else {
        const est = computeLocalLime(payload.features, selectedDisease);
        renderLimeChart(est);
        showLimeNote('Client-side estimated explanations shown (server LIME unavailable).');
      }
    } catch (e) {
      const est = computeLocalLime(payload.features, selectedDisease);
      renderLimeChart(est);
      showLimeNote('Client-side estimated explanations shown.');
    }
  });

  document.getElementById('simulateBtn')?.addEventListener('click', async () => {
    if (!lastDiagnosis) return alert('Run a prediction first');
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
        showLimeNote('Client-side estimated explanations shown.');
      }
    }
  });

  // Download PDF — use the proper downloadReport function
  document.getElementById('downloadBtn')?.addEventListener('click', () => {
    downloadReport();
  });
}

function renderFeatureFields(disease) {
  const container = document.getElementById('featureFields');
  container.innerHTML = '';
  const features = DISEASE_FEATURES[disease] || [];
  const dInfo = DISEASE_INFO[disease] || DISEASE_INFO.diabetes;

  // create two-column grid for feature cards
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2';
  grid.style.gap = '12px';
  features.forEach(f => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '14px';
    let min = 0, max = 100, step = 1;
    if (f.normal && f.normal.length===2) {
      min = Math.max(0, Math.floor(f.normal[0] * 0.5));
      max = Math.ceil(f.normal[1] * 2);
      if (f.normal[1] - f.normal[0] <= 1) { step = 0.01; }
    }
    card.innerHTML = `
      <label class="form-label">${f.label}</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="number" data-feature="${f.name}" id="feat_${f.name}" class="form-control" style="flex:1" step="${step}" />
        <div style="min-width:84px; text-align:right; color:var(--accent-cyan); font-weight:700" id="val_${f.name}">—</div>
      </div>
      <div class="small" style="margin-top:6px;color:var(--text-secondary)">Normal: ${f.normal && f.normal.length===2 ? f.normal[0]+' – '+f.normal[1] : '—'} ${f.unit || ''}</div>
      <div class="small" id="status_${f.name}" style="margin-top:6px"></div>
    `;
    grid.appendChild(card);
  });

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
    let min = 0, max = 100, step = 1;
    if (f.normal && f.normal.length===2) {
      min = Math.max(0, Math.floor(f.normal[0] * 0.5));
      max = Math.ceil(f.normal[1] * 2);
      if (f.normal[1] - f.normal[0] <= 1) { step = 0.01; }
    }
    const sliderWrap = document.getElementById('sliders');
    const sRow = document.createElement('div');
    sRow.style.marginBottom = '12px';
    sRow.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px"><div style="color:var(--text-secondary)">${f.label}</div><div id="sv_${f.name}" style="color:var(--accent-cyan); font-weight:700">—</div></div><input type="range" id="s_${f.name}" data-feature="${f.name}" min="${min}" max="${max}" step="${step}">`;
    sliderWrap.appendChild(sRow);

    const slider = document.getElementById('s_' + f.name);
    const initVal = (f.normal && f.normal.length===2) ? ((f.normal[0]+f.normal[1])/2) : (min + (max-min)/2);
    num.value = Number(initVal.toFixed(step<1?2:0));
    slider.value = num.value;
    if (valDisplay) valDisplay.textContent = num.value + (f.unit ? (' ' + f.unit) : '');
    const sv = document.getElementById('sv_' + f.name);
    if (sv) sv.textContent = num.value + (f.unit ? (' ' + f.unit) : '');

    slider.addEventListener('input', () => {
      const v = slider.value;
      num.value = v;
      if (valDisplay) valDisplay.textContent = v + (f.unit ? (' ' + f.unit) : '');
      if (sv) sv.textContent = v + (f.unit ? (' ' + f.unit) : '');
      updateLivePreview(f, v, status);
    });

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
    const payload = { disease: selectedDisease, features: featuresPayload };
    const res = await authFetch('/whatif', { method: 'POST', body: JSON.stringify(payload) });
    if (!res) return alert('What-if simulation failed');
    lastDiagnosis = res;
    showResults(res);
    const est = computeLocalLime(featuresPayload, selectedDisease);
    if (res.lime_scores && res.lime_scores.length) {
      renderLimeChart(res.lime_scores);
    } else {
      renderLimeChart(est);
      showLimeNote('Client-side estimated explanations shown.');
    }
  });

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

  // Build disease-specific result header
  const dInfo = DISEASE_INFO[selectedDisease] || { label: selectedDisease || 'Disease', color: '#00C2D4' };
  const isDetected = res.result === 'DETECTED';
  const resultText = isDetected
    ? `${dInfo.label.toUpperCase()} DETECTED`
    : `${dInfo.label.toUpperCase()} NOT DETECTED`;

  const header = document.getElementById('resultHeader');
  header.textContent = resultText;

  const conf = Number(res.confidence || 0);
  const fill = document.getElementById('confidenceFill');
  fill.style.width = Math.min(100, conf) + '%';
  fill.style.background = `linear-gradient(90deg, ${dInfo.color}, #7C3AED)`;
  document.getElementById('confidenceLabel').textContent = `${conf.toFixed(1)}% Confidence`;

  // risk pill
  const riskPill = document.getElementById('riskPill');
  const lvl = res.risk_level || 'GREEN';
  let pillHtml = '';
  if (lvl === 'RED') pillHtml = `<span class="badge badge-red">⚠️ HIGH RISK</span>`;
  else if (lvl === 'YELLOW') pillHtml = `<span class="badge badge-yellow">⚡ MEDIUM RISK</span>`;
  else pillHtml = `<span class="badge badge-green">✅ LOW RISK</span>`;
  riskPill.innerHTML = pillHtml;

  // populate featureStatusMap
  featureStatusMap = {};
  if (res && res.risk_flags && Array.isArray(res.risk_flags)) {
    res.risk_flags.forEach(f => {
      try { featureStatusMap[String(f.feature).toLowerCase()] = String(f.status).toUpperCase(); } catch(e){}
    });
  }

  // Color header and icon by risk level
  try {
    const iconWrap = document.getElementById('resultIconWrapper');
    const iconInner = document.getElementById('resultIconInner');
    if (lvl === 'RED') {
      header.style.color = 'var(--accent-red)';
      if (iconWrap) iconWrap.style.background = 'radial-gradient(circle at center, rgba(239,68,68,0.15), rgba(239,68,68,0.06))';
      if (iconInner) { iconInner.style.color = 'var(--accent-red)'; iconInner.textContent = '⚠️'; }
    } else if (lvl === 'YELLOW') {
      header.style.color = 'var(--accent-yellow)';
      if (iconWrap) iconWrap.style.background = 'radial-gradient(circle at center, rgba(245,158,11,0.15), rgba(245,158,11,0.06))';
      if (iconInner) { iconInner.style.color = 'var(--accent-yellow)'; iconInner.textContent = '⚡'; }
    } else {
      header.style.color = 'var(--accent-green)';
      if (iconWrap) iconWrap.style.background = 'radial-gradient(circle at center, rgba(16,185,129,0.15), rgba(16,185,129,0.06))';
      if (iconInner) { iconInner.style.color = 'var(--accent-green)'; iconInner.textContent = '✅'; }
    }
  } catch (e) {}

  // Dynamic explanation text below result
  const explTxt = RISK_EXPLANATIONS[lvl] || RISK_EXPLANATIONS['GREEN'];
  const explText = explTxt[selectedDisease] || explTxt['default'];
  let dynExplEl = document.getElementById('dynamicExplanation');
  if (!dynExplEl) {
    dynExplEl = document.createElement('div');
    dynExplEl.id = 'dynamicExplanation';
    dynExplEl.style.cssText = `
      margin-top: 16px; padding: 14px 18px; border-radius: 12px; font-size: 0.9rem; line-height: 1.6;
      border-left: 4px solid ${lvl === 'RED' ? 'var(--accent-red)' : lvl === 'YELLOW' ? 'var(--accent-yellow)' : 'var(--accent-green)'};
      background: ${lvl === 'RED' ? 'rgba(239,68,68,0.07)' : lvl === 'YELLOW' ? 'rgba(245,158,11,0.07)' : 'rgba(16,185,129,0.07)'};
      color: var(--text-primary);
    `;
    const resultBanner = document.querySelector('#step-results .card');
    if (resultBanner) resultBanner.appendChild(dynExplEl);
  } else {
    // Update existing element's colors
    dynExplEl.style.borderLeftColor = lvl === 'RED' ? 'var(--accent-red)' : lvl === 'YELLOW' ? 'var(--accent-yellow)' : 'var(--accent-green)';
    dynExplEl.style.background = lvl === 'RED' ? 'rgba(239,68,68,0.07)' : lvl === 'YELLOW' ? 'rgba(245,158,11,0.07)' : 'rgba(16,185,129,0.07)';
  }
  dynExplEl.textContent = explText;

  // LIME section always shows — use server data or local estimate
  const limeCanvas = document.getElementById('limeChart');
  if (limeCanvas) limeCanvas.style.display = 'block';

  // Update LIME explanation text
  const limeExplainEl = document.getElementById('limeShortExplain');
  if (limeExplainEl) {
    limeExplainEl.textContent = 'Feature Importance (LIME): bars show how much each measurement contributed to this prediction. Red bars indicate high-risk values, green bars indicate normal values.';
  }

  // render risk table
  renderRiskTableFromInputs();

  // wire bottom buttons (remove any old listeners by cloning)
  const newDiagBtn = document.getElementById('newDiagBtn');
  if (newDiagBtn) {
    const clone = newDiagBtn.cloneNode(true);
    newDiagBtn.parentNode.replaceChild(clone, newDiagBtn);
    clone.addEventListener('click', () => { window.location.href = 'new-diagnosis.html'; });
  }
  const dlBtn = document.getElementById('downloadBtn');
  if (dlBtn) {
    const clone = dlBtn.cloneNode(true);
    dlBtn.parentNode.replaceChild(clone, dlBtn);
    clone.addEventListener('click', () => { downloadReport(); });
  }
  const saveBtn = document.getElementById('saveHistoryBtn');
  if (saveBtn) {
    const clone = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(clone, saveBtn);
    clone.addEventListener('click', async () => {
      if (!res.diagnosis_id) return alert('No diagnosis id to save');
      window.location.href = `history.html?highlight=${encodeURIComponent(res.diagnosis_id)}`;
    });
  }

  // Advance stepper to step 3
  const ds3 = document.getElementById('ds3');
  if (ds3) ds3.classList.add('active');

  // Compute local LIME immediately so chart appears right away
  // (server LIME will update it when the /explain call completes)
  if (lastPayload && lastPayload.features) {
    const est = computeLocalLime(lastPayload.features, selectedDisease);
    renderLimeChart(est);
  }
}

function renderLimeChart(scores) {
  const canvas = document.getElementById('limeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let arr = Array.isArray(scores) ? scores.slice() : [];
  arr = arr.map(s => (typeof s === 'number') ? { feature: 'feat', score: s } : s);

  // If no usable scores, compute a local estimate
  if (!arr || arr.length === 0) {
    try {
      const est = computeLocalLime(lastPayload?.features || null, selectedDisease);
      arr = est.slice();
    } catch (e) { console.warn('[diagnosis] no LIME data and failed to estimate', e); }
  }

  arr.sort((a,b) => Math.abs(b.score) - Math.abs(a.score));
  if (!arr || arr.length === 0) return;

  canvas.style.display = 'block';
  try { canvas.height = Math.max(220, arr.length * 36); } catch(e){}

  const labels = arr.map(s => s.feature);
  const data = arr.map(s => Math.abs(Number(s.score)));

  // Color by risk: RED=danger, YELLOW=warning, GREEN=safe, default=disease color
  const dInfo = DISEASE_INFO[selectedDisease] || DISEASE_INFO.diabetes;
  const colors = arr.map(s => {
    const key = String(s.feature || '').toLowerCase();
    let status = featureStatusMap[key];
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
    // fallback: positive=disease color, negative=red
    return (Number(s.score) >= 0)
      ? `rgba(${dInfo.colorRgb},0.85)`
      : 'rgba(239,68,68,0.85)';
  });

  if (limeChart) { try { limeChart.destroy(); } catch(e){} }
  limeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Feature Importance',
        data,
        backgroundColor: colors,
        borderRadius: 8,
        barThickness: 18,
        borderColor: colors.map(c => c.replace(/0\.\d+\)$/, '1)')),
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: 'rgba(255,255,255,0.7)' },
          grid: { color: 'rgba(255,255,255,0.04)' },
          title: { display: true, text: 'Importance Score', color: 'rgba(255,255,255,0.5)', font: { size: 11 } }
        },
        y: {
          ticks: { color: 'rgba(255,255,255,0.9)', font: { weight: 600 } },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Importance: ${ctx.parsed.x.toFixed(3)}`,
            afterLabel: (ctx) => {
              const key = ctx.label.toLowerCase();
              const status = featureStatusMap[key];
              if (status === 'RED') return ' ⚠️ HIGH RISK VALUE';
              if (status === 'YELLOW') return ' ⚡ ELEVATED VALUE';
              if (status === 'GREEN') return ' ✅ NORMAL VALUE';
              return '';
            }
          }
        }
      }
    }
  });
}

// Compute a simple client-side LIME-like estimate based on deviation from normal ranges
function computeLocalLime(featuresObj, disease) {
  const defs = DISEASE_FEATURES[disease] || [];
  const out = [];
  defs.forEach(f => {
    const name = f.name;
    const label = f.label;
    const val = Number(featuresObj && featuresObj[name] !== undefined
      ? featuresObj[name]
      : (document.getElementById('feat_' + name)?.value || 0));
    let score = 0;
    if (f.normal && f.normal.length===2 && !isNaN(val)) {
      const [min, max] = f.normal;
      const mid = (min + max) / 2.0;
      const range = Math.max(1e-6, (max - min) / 2.0);
      const z = (val - mid) / range;
      const capped = Math.max(-5, Math.min(5, z));
      score = capped / 5.0;
    } else {
      let h = 0; for (let i=0;i<name.length;i++) h = (h<<5)-h + name.charCodeAt(i);
      const pseudo = (Math.abs(h) % 100) / 100.0;
      score = (pseudo - 0.5) * 0.2;
    }
    out.push({ feature: label, score });
  });
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
    note.style.fontStyle = 'italic';
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
    try { featureStatusMap[f.name.toLowerCase()] = (status === 'NORMAL' ? 'GREEN' : (status === 'ELEVATED' ? 'RED' : (status === 'LOW' ? 'YELLOW' : 'N/A'))); } catch(e){}
    features.push({ feature: f.label, value: val + (f.unit ? (' ' + f.unit) : ''), normal: (f.normal && f.normal.length===2) ? `${f.normal[0]} – ${f.normal[1]}` : '—', status });
  });

  const container = document.getElementById('riskTableContainer');
  container.innerHTML = '';
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Measurement</th><th>Value</th><th>Normal Range</th><th>Status</th></tr></thead>';
  const tbody = document.createElement('tbody');
  features.forEach(r => {
    const tr = document.createElement('tr');
    let cls = '';
    if (r.status === 'ELEVATED') cls = 'badge badge-red';
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

  let statusText = '';
  let badge = '';
  if (featureDef.normal && featureDef.normal.length===2 && !isNaN(v)) {
    const [min, max] = featureDef.normal;
    if (v < min) { statusText = 'Low'; badge = 'badge badge-yellow'; }
    else if (v > max) { statusText = 'Elevated'; badge = 'badge badge-red'; }
    else { statusText = 'Normal'; badge = 'badge badge-green'; }
  }
  if (statusEl) statusEl.innerHTML = statusText ? `<span class="${badge}">${statusText}</span>` : '';

  let entry = document.getElementById('live_' + featureDef.name);
  if (!entry) {
    entry = document.createElement('div');
    entry.id = 'live_' + featureDef.name;
    entry.style.padding = '10px 0';
    entry.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
    entry.innerHTML = `<div style="display:flex; justify-content:space-between;"><div style="color:var(--text-secondary); font-size:0.85rem">${featureDef.label}</div><div id="liveval_${featureDef.name}" style="color:var(--accent-cyan); font-weight:700; font-size:0.85rem"></div></div>`;
    document.getElementById('liveList').appendChild(entry);
  }
  const liveValEl = document.getElementById('liveval_' + featureDef.name);
  if (liveValEl) liveValEl.textContent = (rawValue !== '' ? rawValue + (featureDef.unit ? (' ' + featureDef.unit) : '') : '—');
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

// ─────────────────────────────────────────────────────────────
//  PROFESSIONAL PDF REPORT GENERATION
// ─────────────────────────────────────────────────────────────
async function downloadReport() {
  if (!lastDiagnosis) return alert('No prediction results to export. Please run a diagnosis first.');

  const dlBtn = document.getElementById('downloadBtn');
  if (dlBtn) { dlBtn.disabled = true; dlBtn.textContent = '⏳ Generating PDF...'; }

  try {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      // Fallback: screenshot export
      await screenshotFallback();
      return;
    }

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = 0;

    const disease = selectedDisease || 'unknown';
    const dInfo = DISEASE_INFO[disease] || DISEASE_INFO.diabetes;
    const res = lastDiagnosis;
    const lvl = res.risk_level || 'GREEN';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    const patientName = lastPayload?.patient_name || res.patient_name || 'N/A';
    const patientAge = lastPayload?.age || 'N/A';
    const patientGender = lastPayload?.gender || 'N/A';
    const diagId = res.diagnosis_id || 'N/A';

    // ── PAGE 1 ─────────────────────────────────────────────────────────────

    // Header gradient band
    pdf.setFillColor(10, 14, 26);
    pdf.rect(0, 0, pageW, 48, 'F');

    // Accent bar top
    pdf.setFillColor(0, 194, 212);
    pdf.rect(0, 0, pageW, 3, 'F');

    // Logo text
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(0, 194, 212);
    pdf.text('Pulse XAI', margin, 22);

    // Subtitle
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(140, 160, 190);
    pdf.text('Explainable AI Medical Diagnosis System', margin, 30);
    pdf.text('Cardiff Metropolitan University / ICBT', margin, 36);

    // Report title (right aligned)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(255, 255, 255);
    pdf.text('MEDICAL DIAGNOSIS REPORT', pageW - margin, 20, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(140, 160, 190);
    pdf.text(`Report ID: ${diagId}`, pageW - margin, 29, { align: 'right' });
    pdf.text(`Date: ${dateStr}  |  Time: ${timeStr}`, pageW - margin, 36, { align: 'right' });

    // Bottom accent bar for header
    pdf.setFillColor(124, 58, 237);
    pdf.rect(0, 45, pageW, 3, 'F');

    y = 60;

    // ── PATIENT INFORMATION ──────────────────────────────────────────────
    pdf.setFillColor(16, 22, 40);
    pdf.roundedRect(margin, y, contentW, 40, 3, 3, 'F');
    pdf.setDrawColor(0, 194, 212);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, y, contentW, 40, 3, 3, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(0, 194, 212);
    pdf.text('PATIENT INFORMATION', margin + 8, y + 10);

    pdf.setTextColor(200, 210, 230);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');

    const colW = contentW / 3;
    const fields = [
      ['Patient Name', patientName],
      ['Age', String(patientAge) + ' years'],
      ['Gender', String(patientGender).charAt(0).toUpperCase() + String(patientGender).slice(1)],
      ['Report ID', diagId],
      ['Analysis Date', dateStr],
      ['Analysis Time', timeStr]
    ];
    fields.forEach((field, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const fx = margin + 8 + col * colW;
      const fy = y + 20 + row * 12;
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(140, 160, 190);
      pdf.text(field[0] + ':', fx, fy);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(220, 230, 245);
      pdf.text(field[1], fx + 30, fy);
    });

    y += 52;

    // ── PREDICTION RESULT ────────────────────────────────────────────────
    const rColor = lvl === 'RED' ? [239, 68, 68] : lvl === 'YELLOW' ? [245, 158, 11] : [16, 185, 129];
    pdf.setFillColor(16, 22, 40);
    pdf.roundedRect(margin, y, contentW, 50, 3, 3, 'F');
    pdf.setDrawColor(...rColor);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, y, contentW, 50, 3, 3, 'S');

    // Left accent bar
    pdf.setFillColor(...rColor);
    pdf.rect(margin, y, 4, 50, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(0, 194, 212);
    pdf.text('PREDICTION RESULT', margin + 12, y + 10);

    const resultTxt = res.result === 'DETECTED'
      ? `${dInfo.label.toUpperCase()} DETECTED`
      : `${dInfo.label.toUpperCase()} NOT DETECTED`;

    pdf.setFontSize(18);
    pdf.setTextColor(...rColor);
    pdf.text(resultTxt, margin + 12, y + 26);

    pdf.setFontSize(10);
    pdf.setTextColor(200, 210, 230);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Confidence: ${Number(res.confidence || 0).toFixed(1)}%`, margin + 12, y + 36);

    // Risk pill
    const riskLbl = lvl === 'RED' ? 'HIGH RISK' : lvl === 'YELLOW' ? 'MEDIUM RISK' : 'LOW RISK';
    pdf.setFillColor(...rColor);
    pdf.roundedRect(pageW - margin - 50, y + 22, 48, 14, 4, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    pdf.text(riskLbl, pageW - margin - 26, y + 31, { align: 'center' });

    // Confidence bar
    pdf.setFillColor(30, 40, 60);
    pdf.roundedRect(margin + 12, y + 40, contentW - 24, 5, 2, 2, 'F');
    pdf.setFillColor(...rColor);
    pdf.roundedRect(margin + 12, y + 40, (contentW - 24) * Math.min(1, Number(res.confidence || 0) / 100), 5, 2, 2, 'F');

    y += 62;

    // ── CLINICAL EXPLANATION ─────────────────────────────────────────────
    const explTxt = (RISK_EXPLANATIONS[lvl] || RISK_EXPLANATIONS['GREEN'])[disease]
      || (RISK_EXPLANATIONS[lvl] || RISK_EXPLANATIONS['GREEN'])['default'];

    pdf.setFillColor(16, 22, 40);
    const explLines = pdf.splitTextToSize(explTxt, contentW - 24);
    const explH = 14 + explLines.length * 6;
    pdf.roundedRect(margin, y, contentW, explH, 3, 3, 'F');
    pdf.setFillColor(...rColor, 40);
    pdf.rect(margin, y, 4, explH, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(0, 194, 212);
    pdf.text('CLINICAL ASSESSMENT', margin + 12, y + 9);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(200, 210, 230);
    explLines.forEach((line, i) => { pdf.text(line, margin + 12, y + 17 + i * 6); });

    y += explH + 10;

    // ── FEATURE VALUES TABLE ─────────────────────────────────────────────
    const defs = DISEASE_FEATURES[disease] || [];
    const features = defs.map(f => {
      const inp = document.getElementById('feat_' + f.name);
      const val = inp ? inp.value : (lastPayload?.features?.[f.name] ?? '—');
      let status = '—';
      if (f.normal && f.normal.length===2 && val!=='') {
        const v = Number(val);
        if (v < f.normal[0]) status = 'LOW';
        else if (v > f.normal[1]) status = 'ELEVATED';
        else status = 'NORMAL';
      }
      return { label: f.label, value: val + (f.unit ? ' ' + f.unit : ''), normal: (f.normal && f.normal.length===2) ? `${f.normal[0]} – ${f.normal[1]}` : '—', status };
    });

    if (features.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 194, 212);
      pdf.text('CLINICAL MEASUREMENTS', margin, y + 8);
      y += 14;

      // Table header
      pdf.setFillColor(10, 18, 35);
      pdf.rect(margin, y, contentW, 9, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(140, 160, 190);
      const cols = [contentW * 0.35, contentW * 0.25, contentW * 0.25, contentW * 0.15];
      const colX = [margin + 4, margin + 4 + cols[0], margin + 4 + cols[0] + cols[1], margin + 4 + cols[0] + cols[1] + cols[2]];
      pdf.text('Measurement', colX[0], y + 6);
      pdf.text('Value', colX[1], y + 6);
      pdf.text('Normal Range', colX[2], y + 6);
      pdf.text('Status', colX[3], y + 6);
      y += 9;

      features.forEach((feat, i) => {
        const rowH = 8;
        const bg = i % 2 === 0 ? [16, 22, 40] : [12, 18, 34];
        pdf.setFillColor(...bg);
        pdf.rect(margin, y, contentW, rowH, 'F');

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(200, 210, 230);
        pdf.text(feat.label, colX[0], y + 5.5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(String(feat.value), colX[1], y + 5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.text(feat.normal, colX[2], y + 5.5);

        // Status colored
        const sColor = feat.status === 'ELEVATED' ? [239,68,68] : feat.status === 'LOW' ? [245,158,11] : feat.status === 'NORMAL' ? [16,185,129] : [100,120,150];
        pdf.setTextColor(...sColor);
        pdf.setFont('helvetica', 'bold');
        pdf.text(feat.status, colX[3], y + 5.5);

        y += rowH;

        // Check for page overflow
        if (y > pageH - 40) {
          pdf.addPage();
          pdf.setFillColor(10, 14, 26);
          pdf.rect(0, 0, pageW, 14, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(0, 194, 212);
          pdf.text('Pulse XAI — Medical Diagnosis Report (continued)', margin, 9);
          pdf.setFillColor(0, 194, 212);
          pdf.rect(0, 13, pageW, 1, 'F');
          y = 22;
        }
      });
      y += 10;
    }

    // ── LIME EXPLANATION CHART ───────────────────────────────────────────
    const limeCanvas = document.getElementById('limeChart');
    if (limeCanvas) {
      try {
        if (y > pageH - 80) {
          pdf.addPage();
          pdf.setFillColor(10, 14, 26);
          pdf.rect(0, 0, pageW, 14, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(0, 194, 212);
          pdf.text('Pulse XAI — Medical Diagnosis Report (continued)', margin, 9);
          pdf.setFillColor(0, 194, 212);
          pdf.rect(0, 13, pageW, 1, 'F');
          y = 22;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(0, 194, 212);
        pdf.text('FEATURE IMPORTANCE ANALYSIS (LIME)', margin, y + 8);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(140, 160, 190);
        pdf.text('The chart below shows the contribution of each clinical measurement to the AI prediction.', margin, y + 15);
        pdf.text('Red bars = high risk values  |  Green bars = normal values  |  Yellow bars = borderline values', margin, y + 21);
        y += 26;

        const imgData = limeCanvas.toDataURL('image/png');
        const imgH = 60;
        pdf.setFillColor(16, 22, 40);
        pdf.roundedRect(margin, y, contentW, imgH + 4, 3, 3, 'F');
        pdf.addImage(imgData, 'PNG', margin + 2, y + 2, contentW - 4, imgH);
        y += imgH + 14;
      } catch (e) { console.warn('LIME chart embed failed', e); }
    }

    // ── RECOMMENDATIONS ──────────────────────────────────────────────────
    const recs = {
      diabetes: {
        RED: ['Immediate consultation with an endocrinologist', 'Fasting blood glucose test (FBG) and HbA1c measurement', 'Dietary overhaul: eliminate refined sugars, reduce carbohydrates', 'Begin blood sugar monitoring (2-4x daily)', 'Discuss medication options (metformin) with your doctor'],
        YELLOW: ['Schedule a doctor appointment within 1-2 weeks', 'Reduce sugar and processed food intake', 'Increase physical activity to 150 min/week', 'Monitor blood pressure and weight regularly'],
        GREEN: ['Continue annual fasting glucose screening', 'Maintain balanced diet with low glycemic index foods', 'Regular 30-minute daily exercise', 'Stay hydrated; avoid sugary beverages']
      },
      heart: {
        RED: ['Immediate cardiology evaluation', 'ECG and stress test required', 'Echocardiogram recommended', 'Review all cardiovascular medications', 'Avoid strenuous activity until cleared by cardiologist'],
        YELLOW: ['Consult cardiologist within 2 weeks', 'Lipid panel (LDL, HDL, triglycerides) needed', 'Blood pressure monitoring twice daily', 'Heart-healthy Mediterranean diet', 'Smoking cessation if applicable'],
        GREEN: ['Annual cardiovascular health check', 'Regular aerobic exercise (150 min/week)', 'Maintain healthy weight (BMI 18.5-24.9)', 'Limit saturated fats and sodium']
      },
      cancer: {
        RED: ['Urgent referral to oncologist', 'Tissue biopsy for definitive diagnosis', 'MRI/ultrasound imaging if not yet done', 'Do not delay — early intervention is critical', 'Seek second opinion from cancer specialist'],
        YELLOW: ['Follow-up imaging in 3-6 months', 'Regular clinical breast examinations', 'Genetic counseling if family history present', 'Maintain routine mammography schedule'],
        GREEN: ['Annual mammography screening (per age guidelines)', 'Regular self-breast examinations', 'Maintain healthy weight and limit alcohol', 'Discuss family history risk with doctor']
      },
      liver: {
        RED: ['Urgent hepatology consultation', 'Liver biopsy and imaging studies needed', 'Avoid all alcohol immediately', 'Review all medications for hepatotoxicity', 'Monitor for signs of liver failure'],
        YELLOW: ['Liver function tests (LFTs) in 4 weeks', 'Eliminate alcohol consumption', 'Hepatitis B and C screening if not done', 'Reduce fatty foods, increase vegetables'],
        GREEN: ['Annual liver function tests', 'Maintain healthy weight', 'Limit alcohol intake (< 14 units/week)', 'Hepatitis vaccination if not immune']
      }
    };

    const recList = (recs[disease] || recs.diabetes)[lvl] || [];
    if (recList.length > 0) {
      if (y > pageH - 70) {
        pdf.addPage();
        pdf.setFillColor(10, 14, 26);
        pdf.rect(0, 0, pageW, 14, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(0, 194, 212);
        pdf.text('Pulse XAI — Medical Diagnosis Report (continued)', margin, 9);
        pdf.setFillColor(0, 194, 212);
        pdf.rect(0, 13, pageW, 1, 'F');
        y = 22;
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 194, 212);
      pdf.text('RECOMMENDATIONS', margin, y + 8);
      y += 14;

      pdf.setFillColor(16, 22, 40);
      const recH = 10 + recList.length * 10;
      pdf.roundedRect(margin, y, contentW, recH, 3, 3, 'F');
      pdf.setFillColor(...rColor);
      pdf.rect(margin, y, 4, recH, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(200, 210, 230);
      recList.forEach((rec, i) => {
        pdf.text(`${i + 1}. ${rec}`, margin + 12, y + 9 + i * 10);
      });
      y += recH + 10;
    }

    // ── FOOTER on last page ──────────────────────────────────────────────
    const totalPages = pdf.internal.pages.length - 1;
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFillColor(10, 14, 26);
      pdf.rect(0, pageH - 14, pageW, 14, 'F');
      pdf.setFillColor(0, 194, 212);
      pdf.rect(0, pageH - 14, pageW, 1, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(100, 120, 150);
      pdf.text('Pulse XAI — Explainable AI Medical Diagnosis System | For medical professional use only | Not a substitute for clinical judgement', margin, pageH - 6);
      pdf.text(`Page ${p} of ${totalPages}  |  Generated: ${dateStr} ${timeStr}`, pageW - margin, pageH - 6, { align: 'right' });
    }

    pdf.save(`PulseXAI-Report-${diagId}-${disease}-${now.toISOString().slice(0,10)}.pdf`);

  } catch (err) {
    console.error('PDF export failed', err);
    await screenshotFallback();
  } finally {
    if (dlBtn) { dlBtn.disabled = false; dlBtn.textContent = '📄 Download PDF Report'; }
  }
}

async function screenshotFallback() {
  const el = document.getElementById('step-results');
  if (!el) return alert('No results to export');
  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#0A0E1A' });
    const imgData = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imgData;
    a.download = `PulseXAI-Report-${lastDiagnosis?.diagnosis_id || 'diagnosis'}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}

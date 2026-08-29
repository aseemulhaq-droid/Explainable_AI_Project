document.addEventListener('DOMContentLoaded', () => { initCompare(); });

async function initCompare() {
  if (!sessionStorage.getItem('token')) { window.location.href = 'login.html'; return; }
  document.getElementById('sideBack')?.addEventListener('click', () => { window.history.back(); });
  document.getElementById('compareBtnTop')?.addEventListener('click', () => doCompare());

  const resp = await authFetch('/history');
  if (!resp || !resp.success || !Array.isArray(resp.records)) {
    document.getElementById('cardABody').innerText = 'Failed to load patients';
    return;
  }
  const records = resp.records;
  window.__compareRecords = records;
  const selA = document.getElementById('patientA');
  const selB = document.getElementById('patientB');
  selA.innerHTML = '<option value="">Select patient</option>';
  selB.innerHTML = '<option value="">Select patient</option>';
  records.forEach(r => {
    const label = `${r.patient_name || 'Patient'} • ${r.disease || ''} • ${r.date || ''}`;
    const optA = document.createElement('option'); optA.value = r.diagnosis_id; optA.textContent = label; selA.appendChild(optA);
    const optB = document.createElement('option'); optB.value = r.diagnosis_id; optB.textContent = label; selB.appendChild(optB);
  });
  // Check for URL params to auto-select
  const params = new URLSearchParams(window.location.search);
  const aParam = params.get('a');
  const bParam = params.get('b');
  if (aParam && bParam) {
    // ensure values exist in options
    if (Array.from(selA.options).some(o=>o.value===aParam) && Array.from(selB.options).some(o=>o.value===bParam)) {
      selA.value = aParam; selB.value = bParam;
      // do NOT auto-run compare; wait for explicit user click
      // leave selections populated so user can click Compare
      // fall through
    }
  }
  // preselect first two distinct for convenience but DO NOT auto-run comparison
  if (records.length >= 2) {
    selA.value = records[0].diagnosis_id;
    selB.value = records[1].diagnosis_id;
  }

  // show placeholder guidance until user clicks Compare
  document.getElementById('cardAHeader').innerHTML = '<div style="color:var(--text-secondary)">Select two patients and click Compare to view reports</div>';
  document.getElementById('cardABody').innerHTML = '';
  document.getElementById('cardBHeader').innerHTML = '';
  document.getElementById('cardBBody').innerHTML = '';
  document.getElementById('diffList').innerHTML = '<li style="color:var(--text-secondary)">No comparison yet. Click Compare to generate a detailed comparison.</li>';
}

async function doCompare() {
  const aId = document.getElementById('patientA').value;
  const bId = document.getElementById('patientB').value;
  if (!aId || !bId) return alert('Select two patients to compare');
  if (aId === bId) return alert('Choose two different patients');
  // Disable button while fetching full reports
  const btn = document.getElementById('compareBtnTop'); if (btn) { btn.disabled = true; btn.style.opacity = 0.6; }
  const [aRes, bRes] = await Promise.all([
    authFetch(`/explain?id=${encodeURIComponent(aId)}`, { method:'GET' }),
    authFetch(`/explain?id=${encodeURIComponent(bId)}`, { method:'GET' })
  ]);
  if (!aRes || !aRes.success || !bRes || !bRes.success) {
    if (btn) { btn.disabled = false; btn.style.opacity = 1; }
    return alert('Failed to fetch one or both patient details');
  }
  renderCard('A', aRes);
  renderCard('B', bRes);
  renderDiffs(aRes, bRes);
  if (btn) { btn.disabled = false; btn.style.opacity = 1; }
}

/* quick preview and final assessment removed per UX request */

function renderCard(which, res) {
  const header = document.getElementById(`card${which}Header`);
  const body = document.getElementById(`card${which}Body`);
  header.innerHTML = `<h3 style="margin:0">${res.patient_name || 'Patient'}</h3><div style="color:var(--text-secondary); margin-top:6px">${res.disease || ''} • ${res.date||''}</div><div style="margin-top:10px"><span class="result-badge ${res.result && res.result.toUpperCase().includes('DETECTED')? 'result-detected':'result-safe'}">${res.result||''} • ${res.confidence? Math.round(res.confidence)+'%':''}</span></div>`;
  body.innerHTML = '';
  // Render LIME chart if available
  if (res.lime_scores && res.lime_scores.length) {
    const canvas = document.createElement('canvas'); canvas.id = `chart${which}`; canvas.style.width='100%'; canvas.style.height='220px';
    body.appendChild(canvas);
    try {
      const ctx = canvas.getContext('2d');
      const labels = res.lime_scores.map(s=>s.feature);
      const values = res.lime_scores.map(s=>Math.abs(Number(s.score)));
      const colors = res.lime_scores.map((s,i)=>{
        const hue = (i*47)%360; return `hsl(${hue} 80% 55%)`;
      });
      if (window[`chart${which}Obj`]) { try { window[`chart${which}Obj`].destroy(); } catch(e){} }
      window[`chart${which}Obj`] = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ data:values, backgroundColor:colors, borderRadius:8, barThickness:18 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } } });
    } catch(e) { body.innerText = 'Failed to render explanation chart'; }
  } else {
    body.innerHTML = '<div style="color:var(--text-secondary)">LIME explanation not available for this record.</div>';
  }
}

function renderDiffs(a,b) {
  const list = document.getElementById('diffList');
  list.innerHTML = '';
  try {
    // 1) Outcome comparison
    const outcomeA = (a.result||'').toString().toUpperCase();
    const outcomeB = (b.result||'').toString().toUpperCase();
    if (outcomeA && outcomeB) {
      if (outcomeA === outcomeB && (a.disease||'').toLowerCase() === (b.disease||'').toLowerCase()) {
        const li = document.createElement('li'); li.textContent = `Both patients received the same outcome: ${outcomeA.replace('_',' ')} for ${a.disease}.`; list.appendChild(li);
      } else if ((a.disease||'').toLowerCase() !== (b.disease||'').toLowerCase()) {
        const li = document.createElement('li'); li.textContent = `Patients were diagnosed for different conditions: ${a.disease} vs ${b.disease}.`; list.appendChild(li);
      } else {
        const li = document.createElement('li'); li.textContent = `Outcomes differ for the same disease: ${a.patient_name}=${outcomeA.replace('_',' ')} vs ${b.patient_name}=${outcomeB.replace('_',' ')}.`; list.appendChild(li);
      }
    }

    // 2) Risk level comparison derived from confidence
    const classifyRisk = (conf) => {
      const n = Number(conf||0);
      if (isNaN(n)) return 'unknown';
      if (n >= 75) return 'high';
      if (n >= 50) return 'moderate';
      return 'low';
    };
    const riskA = classifyRisk(a.confidence);
    const riskB = classifyRisk(b.confidence);
    const liRisk = document.createElement('li');
    liRisk.textContent = `${a.patient_name} risk: ${riskA} (${a.confidence||0}%) — ${b.patient_name} risk: ${riskB} (${b.confidence||0}%)`;
    list.appendChild(liRisk);

    // 3) LIME deep comparison
    const topN = 5;
    const norm = (arr) => (arr||[]).map(x=>({ feature: x.feature, score: Number(x.score) })).sort((p,q)=>Math.abs(q.score)-Math.abs(p.score));
    const aTop = norm(a.lime_scores).slice(0, topN);
    const bTop = norm(b.lime_scores).slice(0, topN);
    if ((!aTop || aTop.length===0) && (!bTop || bTop.length===0)) {
      const li = document.createElement('li'); li.textContent = 'No explanation (LIME) available for either patient.'; list.appendChild(li); return;
    }

    const aMap = new Map(aTop.map(x=>[x.feature, x]));
    const bMap = new Map(bTop.map(x=>[x.feature, x]));
    const aFeatures = aTop.map(x=>x.feature);
    const bFeatures = bTop.map(x=>x.feature);
    const shared = aFeatures.filter(f => bFeatures.includes(f));
    const onlyA = aFeatures.filter(f => !bFeatures.includes(f));
    const onlyB = bFeatures.filter(f => !aFeatures.includes(f));

    // Shared factors: list and check sign agreement
    if (shared.length) {
      const agree = [];
      const conflict = [];
      shared.forEach(f => {
        const as = aMap.get(f).score;
        const bs = bMap.get(f).score;
        const aSign = Math.sign(as || 0);
        const bSign = Math.sign(bs || 0);
        if (aSign === 0 && bSign === 0) { agree.push(`${f} (neutral)`); }
        else if (aSign === bSign) { agree.push(`${f} (${as.toFixed(2)} & ${bs.toFixed(2)} — same direction)`); }
        else { conflict.push(`${f} (${as.toFixed(2)} vs ${bs.toFixed(2)} — opposite)`); }
      });
      if (agree.length) { const li = document.createElement('li'); li.innerHTML = `Shared top factors that <strong>agree</strong>: ${agree.join(', ')}`; list.appendChild(li); }
      if (conflict.length) { const li = document.createElement('li'); li.innerHTML = `Shared top factors that <strong>conflict</strong>: ${conflict.join(', ')}`; list.appendChild(li); }
    }

    // Unique factors
    if (onlyA.length) { const li = document.createElement('li'); li.innerHTML = `${a.patient_name} unique top factors: <strong>${onlyA.join(', ')}</strong>`; list.appendChild(li); }
    if (onlyB.length) { const li = document.createElement('li'); li.innerHTML = `${b.patient_name} unique top factors: <strong>${onlyB.join(', ')}</strong>`; list.appendChild(li); }

    // Aggregate strength (sum of abs topN scores)
    const sumAbs = arr => (arr||[]).slice(0, topN).reduce((s,x)=>s+Math.abs(Number(x.score||0)),0);
    const aSum = sumAbs(a.lime_scores);
    const bSum = sumAbs(b.lime_scores);
    const liAgg = document.createElement('li'); liAgg.textContent = `Aggregate top-${topN} importance: ${a.patient_name}=${aSum.toFixed(2)} vs ${b.patient_name}=${bSum.toFixed(2)}`; list.appendChild(liAgg);

    // Strongest single driver per patient with direction relative to detection
    const describeDir = (score) => {
      if (score > 0) return 'pushes toward detection';
      if (score < 0) return 'pushes away from detection';
      return 'neutral';
    };
    const strongest = (arr) => { const n = (arr||[]).slice().sort((p,q)=>Math.abs(q.score)-Math.abs(p.score))[0]; return n || null; };
    const sA = strongest(aTop);
    const sB = strongest(bTop);
    const liTop = document.createElement('li'); liTop.innerHTML = `${a.patient_name} strongest driver: <strong>${sA? sA.feature+' ('+sA.score.toFixed(2)+') — '+describeDir(sA.score) : '—'}</strong>; ${b.patient_name} strongest driver: <strong>${sB? sB.feature+' ('+sB.score.toFixed(2)+') — '+describeDir(sB.score) : '—'}</strong>`; list.appendChild(liTop);

    // Provide a short plain-language recommendation item
    const recs = [];
    if (shared.length) recs.push('Shared drivers suggest common risk factors to investigate further.');
    if (onlyA.length) recs.push(`${a.patient_name} has unique drivers to check clinically.`);
    if (onlyB.length) recs.push(`${b.patient_name} has unique drivers to check clinically.`);
    if (recs.length) { const liRec = document.createElement('li'); liRec.innerHTML = `<em>Recommendation:</em> ${recs.join(' ')}`; list.appendChild(liRec); }
  } catch(e) { list.innerHTML = '<li>Unable to compute differences</li>'; }
}

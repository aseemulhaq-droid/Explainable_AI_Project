// frontend/js/history.js
document.addEventListener('DOMContentLoaded', () => { initHistory(); });

async function initHistory() {
  if (!sessionStorage.getItem('token')) { window.location.href = 'login.html'; return; }
  document.getElementById('logoutBtn')?.addEventListener('click', () => { sessionStorage.clear(); window.location.href='login.html'; });
  document.getElementById('sideBack')?.addEventListener('click', () => { window.history.back(); });
  const resp = await authFetch('/history');
  if (!resp || !resp.success || !Array.isArray(resp.records)) {
    document.querySelector('#historyTable tbody').innerHTML = '<tr><td colspan="8">Failed to load</td></tr>';
    return;
  }

  const data = resp.records;
  window.__historyData = data;
  renderHistoryRows(data);

  // Highlight row if ?highlight=<Dxxxx> is present
  try {
    const params = new URLSearchParams(window.location.search);
    const hl = params.get('highlight');
    if (hl) {
      setTimeout(() => {
        const checkbox = document.querySelector(`#historyTable tbody input[data-id="${hl}"]`);
        const row = checkbox ? checkbox.closest('tr') : null;
        if (row) {
          row.style.transition = 'background-color 0.6s';
          row.style.background = 'rgba(0,194,212,0.08)';
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => { row.style.background = ''; }, 3000);
        }
      }, 300);
    }
  } catch(e) {}

  document.getElementById('searchInput').addEventListener('input', (e) => applyFilters());
  document.getElementById('filterDisease').addEventListener('change', () => applyFilters());
  document.getElementById('filterResult').addEventListener('change', () => applyFilters());

  document.getElementById('compareBtn').addEventListener('click', () => doCompare());

  document.getElementById('modalClose').addEventListener('click', () => { document.getElementById('detailModal').classList.remove('active'); });
  document.getElementById('exportCsv')?.addEventListener('click', () => exportVisibleCsv());
}

function renderHistoryRows(rows) {
  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML = '';
  // optional highlight id from querystring
  const params = new URLSearchParams(window.location.search);
  const highlightId = params.get('highlight');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    if (String(r.diagnosis_id) === String(highlightId)) tr.classList.add('highlighted-row');
    const initials = getInitials(r.patient_name || '');
    const confidence = r.confidence != null ? Number(r.confidence) : null;
    const confidencePct = confidence !== null ? Math.max(0, Math.min(100, confidence)) : 0;
    const resultLabel = (r.result && r.result.toUpperCase().includes('DETECTED')) ? 'DETECTED' : 'SAFE';
    const resultClass = resultLabel === 'DETECTED' ? 'result-detected' : 'result-safe';
    const riskClass = (r.risk_level && r.risk_level.toLowerCase().includes('high')) ? 'risk-high' : 'risk-low';

    tr.innerHTML = `
      <td><input type="checkbox" data-id="${r.diagnosis_id}"></td>
      <td class="patient-cell"><div class="patient-cell-content"><div class="patient-avatar">${initials}</div><div class="patient-details"><div class="patient-name">${r.patient_name||'—'}</div><div class="patient-id">${r.patient_code||''}</div></div></div></td>
      <td class="disease-cell"><div class="disease-cell-content"><span class="disease-icon">${mapDiseaseIcon(r.disease)}</span><span>${r.disease||'—'}</span></div></td>
      <td><span class="result-badge ${resultClass}">${resultLabel}</span></td>
      <td><div class="confidence-cell"><div class="confidence-bar"><div class="confidence-fill" style="width:${confidencePct}%;"></div></div><div class="confidence-text">${confidence!==null?confidencePct+'%':'—'}</div></div></td>
      <td><span class="risk-badge ${riskClass}">${r.risk_level||'—'}</span></td>
      <td>${r.date||'—'}</td>
      <td>
        <button class="view-btn" data-id="${r.diagnosis_id}">View</button>
        <button class="remove-btn" data-id="${r.diagnosis_id}" style="background-color: var(--accent-red); margin-left: 8px;">Remove</button>
      </td>
    `;

    tr.querySelector('.view-btn')?.addEventListener('click', (e) => { e.stopPropagation(); showDetailRemote(e.currentTarget.dataset.id); });
    tr.querySelector('.remove-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const did = e.currentTarget.dataset.id;
      if (confirm('Are you sure you want to remove this diagnosis record?')) {
        const resp = await authFetch('/history/remove', { method: 'POST', body: JSON.stringify({ diagnosis_id: did }) });
        if (resp && resp.success) {
          // Refresh history
          initHistory();
        } else {
          alert(resp.error || 'Failed to delete record.');
        }
      }
    });
    tr.addEventListener('click', (e) => { if (e.target.tagName!=='INPUT' && !e.target.classList.contains('view-btn') && !e.target.classList.contains('remove-btn')) showDetail(r); });
    tbody.appendChild(tr);
  });
}

function getInitials(name) {
  if (!name) return 'NA';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function mapDiseaseIcon(d) {
  if (!d) return '🩺';
  d = d.toLowerCase();
  if (d.includes('heart')) return '❤️';
  if (d.includes('liver')) return '🧡';
  if (d.includes('cancer') || d.includes('breast')) return '🎗️';
  if (d.includes('diabetes')) return '🩸';
  return '🩺';
}

async function showDetailRemote(formattedId) {
  if (!formattedId) return;
  const res = await authFetch(`/explain?id=${encodeURIComponent(formattedId)}`, { method: 'GET' });
  if (!res || !res.success) return alert(res && res.error ? res.error : 'Failed to fetch details');
  // Build modal content from res
  const body = document.getElementById('modalBody');
  let html = `<h3>${res.patient_name || 'Patient'}</h3>`;
  html += `<p><strong>Disease:</strong> ${res.disease || ''}</p><p><strong>Result:</strong> ${res.result || ''}</p><p><strong>Confidence:</strong> ${res.confidence || ''}</p><p><strong>Risk:</strong> ${res.risk_level || ''}</p>`;
  // features
  if (Array.isArray(res.features) && res.features.length) {
    html += `<h4>Measurements</h4><table style="width:100%"><thead><tr><th>Feature</th><th>Value</th><th>Status</th></tr></thead><tbody>`;
    res.features.forEach(f => { html += `<tr><td>${f.feature}</td><td>${f.value}</td><td>${f.status || '—'}</td></tr>`; });
    html += `</tbody></table>`;
  }
  // LIME
  html += `<h4 style="margin-top:12px">Explanation</h4><div style="width:100%"><canvas id="modalLimeChart" style="width:100%; height:260px"></canvas></div>`;
  body.innerHTML = html;
  document.getElementById('detailModal').classList.add('active');
  // render lime into modal canvas
  try {
    if (res.lime_scores && res.lime_scores.length) {
      // reuse renderLimeChart by temporarily swapping canvas id
      const orig = document.getElementById('limeChart');
      const origParent = orig ? orig.parentNode : null;
      // create temp replacement so renderLimeChart can find canvas
      const temp = document.getElementById('modalLimeChart');
      // call chart renderer directly with modal canvas context
      // build a small renderer here to avoid moving DOM nodes
      const ctx = temp.getContext('2d');
      if (window.modalLimeChart) { try { window.modalLimeChart.destroy(); } catch(e){} }
      const labels = res.lime_scores.map(s=>s.feature);
      const data = res.lime_scores.map(s=>Math.abs(Number(s.score)));
      const colors = res.lime_scores.map(s => (Number(s.score)>=0 ? 'rgba(0,194,212,0.85)' : 'rgba(239,68,68,0.85)'));
      window.modalLimeChart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ data, backgroundColor:colors, borderRadius:8, barThickness:18 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } } });
    } else {
      const temp = document.getElementById('modalLimeChart'); if (temp) temp.style.display='none';
    }
  } catch(e) { console.error('Modal LIME render failed', e); }
}

function applyFilters() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const d = document.getElementById('filterDisease').value;
  const res = document.getElementById('filterResult').value;
  const out = window.__historyData.filter(r => {
    if (d && r.disease !== d) return false;
    if (res && r.result !== res) return false;
    if (q) {
      const hay = `${r.patient_name} ${r.disease} ${r.result}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderHistoryRows(out);
}

function showDetail(r) {
  const body = document.getElementById('modalBody');
  body.innerHTML = `<h3>${r.patient_name}</h3><p><strong>Disease:</strong> ${r.disease}</p><p><strong>Result:</strong> ${r.result}</p><p><strong>Confidence:</strong> ${r.confidence}</p><p><strong>Risk:</strong> ${r.risk_level}</p>`;
  document.getElementById('detailModal').classList.add('active');
}

function doCompare() {
  const checked = Array.from(document.querySelectorAll('#historyTable tbody input[type=checkbox]:checked')).map(i=>i.dataset.id);
  if (checked.length !== 2) { alert('Select exactly two rows to compare'); return; }
  // Redirect to patient-compare page with selected ids
  const [a,b] = checked;
  const url = `patient-compare.html?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
  window.location.href = url;
}

function exportVisibleCsv() {
  const table = document.getElementById('historyTable');
  const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
  const rows = [];
  table.querySelectorAll('tbody tr').forEach(tr => {
    if (getComputedStyle(tr).display === 'none') return;
    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g,' ').trim());
    // skip empty rows
    if (cells.length) rows.push(cells);
  });
  let csv = headers.join(',') + '\n';
  rows.forEach(r => { csv += r.map(c => '"' + (c || '') + '"').join(',') + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const stamp = now.toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.download = `patient-history-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

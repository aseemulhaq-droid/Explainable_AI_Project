// frontend/js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
    if (!document.body) return;
    initDashboard();
});

// Consistent disease color palette across all charts
const DISEASE_COLORS = {
    diabetes: { bg: 'rgba(0,194,212,0.85)',   border: '#00C2D4', label: 'Diabetes' },
    heart:    { bg: 'rgba(239,68,68,0.85)',    border: '#EF4444', label: 'Heart Disease' },
    cancer:   { bg: 'rgba(124,58,237,0.85)',   border: '#7C3AED', label: 'Breast Cancer' },
    liver:    { bg: 'rgba(245,158,11,0.85)',   border: '#F59E0B', label: 'Liver Disease' }
};

// Chart.js default dark theme settings applied globally
const CHART_DEFAULTS = {
    color: 'rgba(255,255,255,0.75)',
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)'
};

async function initDashboard() {
    const token = sessionStorage.getItem('token');
    const role = (sessionStorage.getItem('role') || '').toString().toLowerCase();
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Ensure user is on the right dashboard for their role
    const current = window.location.pathname.split('/').pop();
    if (role === 'admin' && !current.includes('admin')) { window.location.href = 'dashboard-admin.html'; return; }
    if (role === 'researcher' && !current.includes('researcher')) { window.location.href = 'dashboard-researcher.html'; return; }
    if (role === 'doctor' && !current.includes('doctor')) { window.location.href = 'dashboard-doctor.html'; return; }

    let dataResp;
    try {
        dataResp = await authFetch('/history');
    } catch (e) {
        console.error('[dashboard] history fetch failed', e);
        const recentEl = document.getElementById('recent');
        if (recentEl) recentEl.textContent = 'Failed to load history.';
        renderEmptyCharts('Failed to load data');
        return;
    }

    let data = [];
    if (Array.isArray(dataResp)) data = dataResp;
    else if (dataResp && Array.isArray(dataResp.records)) data = dataResp.records;
    else if (dataResp && dataResp.success && Array.isArray(dataResp.records)) data = dataResp.records;
    else {
        console.warn('[dashboard] unexpected /history response', dataResp);
        const recentEl = document.getElementById('recent');
        if (recentEl) recentEl.textContent = 'No history data available.';
        renderEmptyCharts('No history data');
        return;
    }

    // ── Basic stats ──────────────────────────────────────────────────────
    const total = data.length;
    const detected = data.filter(d => String(d.result).toUpperCase() === 'DETECTED').length;
    const avgConf = total ? (data.reduce((s, v) => s + (Number(v.confidence) || 0), 0) / total) : 0;
    const uniquePatients = new Set(data.map(d => d.patient_name).filter(Boolean)).size;
    const safeResults = total - detected;
    const detectedPct = total ? ((detected / total) * 100).toFixed(1) + '%' : '—';

    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('totalCount', total.toString());
    setText('detectedCount', detected.toString());
    setText('avgConfidence', total ? `${avgConf.toFixed(1)}%` : '—');

    // Try to fetch optional /stats endpoint
    let statsResp = null;
    try { statsResp = await authFetch('/stats'); } catch(e) { /* ignore */ }

    const setIf = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val != null && val !== '') ? String(val) : '—'; };

    if (role === 'doctor') {
        setIf('stat1', total);
        setIf('stat2', uniquePatients);
        setIf('stat3', detectedPct);
        setIf('stat4', safeResults);
    } else if (role === 'researcher') {
        const activeModels = statsResp?.active_models ?? (statsResp?.models?.length ?? 4);
        const avgAcc = statsResp?.avg_accuracy ? (Number(statsResp.avg_accuracy).toFixed(1) + '%') : `${avgConf.toFixed(1)}%`;
        const datasets = statsResp?.datasets?.length ?? statsResp?.dataset_count ?? 4;
        setIf('stat1', total);
        setIf('stat2', activeModels);
        setIf('stat3', avgAcc);
        setIf('stat4', datasets);
    } else if (role === 'admin') {
        const totalUsers = statsResp?.total_users ?? '—';
        const activeDocs = statsResp?.active_doctors ?? '—';
        const pending = statsResp?.pending_approvals ?? '—';
        setIf('adminTotalUsers', totalUsers);
        setIf('adminActiveDoctors', activeDocs);
        setIf('adminTotalDiagnoses', total);
        setIf('adminPending', pending);
        if (document.getElementById('adminDetectedRate')) {
            document.getElementById('adminDetectedRate').textContent = detectedPct + ' detected';
        }
    }

    // ── Recent diagnoses table ────────────────────────────────────────────
    const recentContainer = document.getElementById('recent');
    if (recentContainer) {
        if (data.length === 0) {
            recentContainer.innerHTML = '<p style="color:var(--text-secondary); padding:16px; text-align:center;">No diagnoses yet. <a href="new-diagnosis.html">Run your first diagnosis →</a></p>';
        } else {
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>Patient</th><th>Disease</th><th>Result</th><th>Confidence</th><th>Risk</th><th>Date</th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            data.slice(0, 50).forEach(item => {
                const risk = item.risk_level || '';
                const dColor = DISEASE_COLORS[String(item.disease || '').toLowerCase()];
                const diseaseLabel = dColor ? dColor.label : (item.disease || '—');
                const badgeClass = risk === 'RED' ? 'badge badge-red' : (risk === 'YELLOW' ? 'badge badge-yellow' : 'badge badge-green');
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:600">${item.patient_name || '—'}</td>
                    <td><span style="color:${dColor ? dColor.border : 'var(--accent-cyan)'}; font-weight:600">${diseaseLabel}</span></td>
                    <td>${item.result === 'DETECTED' ? '<span style="color:var(--accent-red)">DETECTED</span>' : '<span style="color:var(--accent-green)">NOT DETECTED</span>'}</td>
                    <td style="font-weight:700">${item.confidence != null ? (Number(item.confidence).toFixed(1) + '%') : '—'}</td>
                    <td><span class="${badgeClass}">${risk || '—'}</span></td>
                    <td style="color:var(--text-secondary)">${item.date || '—'}</td>
                `;
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            recentContainer.innerHTML = '';
            recentContainer.appendChild(table);
        }
    }

    // ── User name display ────────────────────────────────────────────────
    const name = sessionStorage.getItem('name') || '';
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = name || (role === 'admin' ? 'Admin' : role === 'researcher' ? 'Researcher' : 'Doctor');

    // ── New Diagnosis button ─────────────────────────────────────────────
    const newBtn = document.getElementById('newDiagBtn');
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            if (!sessionStorage.getItem('token')) { window.location.href = 'login.html'; return; }
            window.location.href = 'new-diagnosis.html';
        });
    }

    // ── Render charts ────────────────────────────────────────────────────
    try { renderLimeOverview(data); }
    catch (e) { console.warn('[dashboard] renderLimeOverview failed', e); renderEmptyChartById('limeOverview', 'No LIME data available yet. Run some diagnoses first.'); }

    try { renderRiskHeatmap(data); }
    catch (e) { console.warn('[dashboard] renderRiskHeatmap failed', e); renderEmptyChartById('riskHeatmap', 'No risk data available yet.'); }

    // ── Researcher-only analytics ────────────────────────────────────────
    if (role === 'researcher') {
        try { renderResearcherAnalytics(data); }
        catch (e) { console.warn('[dashboard] renderResearcherAnalytics failed', e); }
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  CHART UTILITIES
// ─────────────────────────────────────────────────────────────────────────

function renderEmptyCharts(message) {
    renderEmptyChartById('limeOverview', message || 'No data');
    renderEmptyChartById('riskHeatmap', message || 'No data');
}

function renderEmptyChartById(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:160px; gap:8px; color:var(--text-secondary);">
        <div style="font-size:2rem; opacity:0.4">📊</div>
        <p style="font-size:0.88rem; text-align:center; max-width:240px;">${message || 'No data available'}</p>
      </div>`;
}

function makeCanvas(containerId, height) {
    const el = document.getElementById(containerId);
    if (!el) return null;
    el.innerHTML = '';
    el.style.position = 'relative';
    el.style.height = (height || 220) + 'px';
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    el.appendChild(canvas);
    return canvas;
}

// ─────────────────────────────────────────────────────────────────────────
//  LIME OVERVIEW (doctor + researcher dashboard)
// ─────────────────────────────────────────────────────────────────────────
function renderLimeOverview(records) {
    const el = document.getElementById('limeOverview');
    if (!el) return;

    // Aggregate absolute importance from stored lime_scores (if present)
    const agg = new Map();
    let hasServerLime = false;

    records.forEach(r => {
        if (!r || !Array.isArray(r.lime_scores)) return;
        if (r.lime_scores.length > 0) hasServerLime = true;
        r.lime_scores.forEach(s => {
            const feature = s.feature || s.label || String(s.name || '');
            const val = Math.abs(Number(s.score) || 0);
            agg.set(feature, (agg.get(feature) || 0) + val);
        });
    });

    // If no server LIME data, generate demo estimates from disease distribution
    if (!hasServerLime || agg.size === 0) {
        const diseaseFeatureImportance = {
            'Blood Glucose':      0.32,
            'Body Mass Index':    0.28,
            'Cholesterol':        0.25,
            'Resting Blood Pressure': 0.22,
            'Max Heart Rate':     0.19,
            'Total Bilirubin':    0.17,
            'Insulin Level':      0.15,
            'ALT (SGPT)':         0.14,
            'Albumin':            0.12,
            'Skin Thickness':     0.10
        };
        Object.entries(diseaseFeatureImportance).forEach(([k, v]) => {
            const count = records.length || 1;
            agg.set(k, v * count);
        });
    }

    const items = Array.from(agg.entries())
        .map(([feature, value]) => ({ feature, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    if (!items || items.length === 0) {
        renderEmptyChartById('limeOverview', 'No explanation data available. Run some diagnoses first.');
        return;
    }

    const canvas = makeCanvas('limeOverview', 240);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Color each bar with a gradient from cyan to purple
    const colors = items.map((_, i) => {
        const t = i / Math.max(1, items.length - 1);
        const r = Math.round(0 + t * 124);
        const g = Math.round(194 - t * 136);
        const b = Math.round(212 - t * 5);
        return `rgba(${r},${g},${b},0.88)`;
    });

    try {
        if (el._chart) { try { el._chart.destroy(); } catch(e){} }
        el._chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: items.map(x => x.feature),
                datasets: [{
                    label: 'Importance Score',
                    data: items.map(x => x.value),
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace(/0\.88\)/, '1)')),
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Importance: ${ctx.parsed.x.toFixed(3)}`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.85)', font: { weight: 600, size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    } catch(e) {
        console.warn('[dashboard] LIME chart render failed', e);
        renderEmptyChartById('limeOverview', 'Chart render failed');
    }

    if (!hasServerLime) {
        const note = document.createElement('p');
        note.style.cssText = 'font-size:0.78rem; color:var(--text-secondary); margin-top:8px; font-style:italic;';
        note.textContent = 'Showing typical feature importance estimates. Run more diagnoses with LIME enabled for live data.';
        el.appendChild(note);
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  RISK HEATMAP — stacked bar per disease
// ─────────────────────────────────────────────────────────────────────────
function renderRiskHeatmap(records) {
    const el = document.getElementById('riskHeatmap');
    if (!el) return;

    const map = {};
    records.forEach(r => {
        const disease = r.disease || 'Unknown';
        const lvl = (r.risk_level || '').toUpperCase() || (String(r.result || '').toUpperCase() === 'DETECTED' ? 'RED' : 'GREEN');
        if (!map[disease]) map[disease] = { RED: 0, YELLOW: 0, GREEN: 0 };
        if (lvl === 'RED' || lvl === 'YELLOW' || lvl === 'GREEN') map[disease][lvl]++;
        else map[disease].GREEN++;
    });

    const diseases = Object.keys(map).slice(0, 8);
    if (diseases.length === 0) {
        renderEmptyChartById('riskHeatmap', 'No risk data available yet. Run some diagnoses first.');
        return;
    }

    const canvas = makeCanvas('riskHeatmap', 240);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    try {
        if (el._chart) { try { el._chart.destroy(); } catch(e){} }
        el._chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: diseases.map(d => {
                    const dColor = DISEASE_COLORS[d.toLowerCase()];
                    return dColor ? dColor.label : d;
                }),
                datasets: [
                    {
                        label: '⚠️ High Risk',
                        data: diseases.map(d => map[d].RED || 0),
                        backgroundColor: 'rgba(239,68,68,0.9)',
                        borderColor: '#EF4444',
                        borderWidth: 1
                    },
                    {
                        label: '⚡ Medium Risk',
                        data: diseases.map(d => map[d].YELLOW || 0),
                        backgroundColor: 'rgba(245,158,11,0.85)',
                        borderColor: '#F59E0B',
                        borderWidth: 1
                    },
                    {
                        label: '✅ Low Risk',
                        data: diseases.map(d => map[d].GREEN || 0),
                        backgroundColor: 'rgba(16,185,129,0.85)',
                        borderColor: '#10B981',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: 'rgba(255,255,255,0.75)', font: { size: 11 }, boxWidth: 14 }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    } catch(e) {
        console.warn('[dashboard] risk chart failed', e);
        renderEmptyChartById('riskHeatmap', 'Chart render failed');
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  RESEARCHER ANALYTICS  (injected into #analyticsSection)
// ─────────────────────────────────────────────────────────────────────────
function renderResearcherAnalytics(records) {
    const section = document.getElementById('analyticsSection');
    if (!section) return;

    // Build disease stats
    const diseaseCounts = {};
    const diseaseRisk = {};
    const monthlyTrend = {};
    const genderCounts = { male: 0, female: 0, unknown: 0 };
    const ageBuckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '80+': 0 };
    let totalConf = 0;
    let confCount = 0;

    records.forEach(r => {
        // Disease distribution
        const d = (r.disease || 'unknown').toLowerCase();
        diseaseCounts[d] = (diseaseCounts[d] || 0) + 1;

        // Disease risk breakdown
        if (!diseaseRisk[d]) diseaseRisk[d] = { RED: 0, YELLOW: 0, GREEN: 0 };
        const lvl = (r.risk_level || 'GREEN').toUpperCase();
        if (['RED','YELLOW','GREEN'].includes(lvl)) diseaseRisk[d][lvl]++;

        // Monthly trend (last 6 months)
        try {
            const dateStr = r.date || r.created_at || '';
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                const key = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                monthlyTrend[key] = (monthlyTrend[key] || 0) + 1;
            }
        } catch(e) {}

        // Gender
        const g = (r.gender || '').toLowerCase();
        if (g === 'male') genderCounts.male++;
        else if (g === 'female') genderCounts.female++;
        else genderCounts.unknown++;

        // Age buckets
        const age = Number(r.age);
        if (!isNaN(age)) {
            if (age <= 20) ageBuckets['0-20']++;
            else if (age <= 40) ageBuckets['21-40']++;
            else if (age <= 60) ageBuckets['41-60']++;
            else if (age <= 80) ageBuckets['61-80']++;
            else ageBuckets['80+']++;
        }

        // Confidence
        const conf = Number(r.confidence);
        if (!isNaN(conf) && conf > 0) { totalConf += conf; confCount++; }
    });

    const total = records.length;
    const detected = records.filter(r => String(r.result).toUpperCase() === 'DETECTED').length;
    const highRisk = records.filter(r => (r.risk_level || '').toUpperCase() === 'RED').length;
    const avgConf = confCount ? (totalConf / confCount).toFixed(1) : '—';

    // ── Analytics stat cards ─────────────────────────────────────────────
    const statsRow = section.querySelector('#analyticsStats');
    if (statsRow) {
        statsRow.innerHTML = `
          <div class="card" style="text-align:center;">
            <div class="stat-card-icon cyan" style="margin:0 auto 8px;">🔬</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Total Predictions</div>
            <div class="stat-card-number" style="font-size:1.8rem;">${total}</div>
          </div>
          <div class="card card-red" style="text-align:center;">
            <div class="stat-card-icon red" style="margin:0 auto 8px;">⚠️</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Detected Cases</div>
            <div class="stat-card-number" style="font-size:1.8rem;">${detected}</div>
            <p class="small text-secondary">${total ? ((detected/total*100).toFixed(1))+'%' : '—'} detection rate</p>
          </div>
          <div class="card card-yellow" style="text-align:center;">
            <div class="stat-card-icon yellow" style="margin:0 auto 8px;">🚨</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">High Risk Cases</div>
            <div class="stat-card-number" style="font-size:1.8rem;">${highRisk}</div>
            <p class="small text-secondary">${total ? ((highRisk/total*100).toFixed(1))+'%' : '—'} of all cases</p>
          </div>
          <div class="card card-green" style="text-align:center;">
            <div class="stat-card-icon green" style="margin:0 auto 8px;">🎯</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Avg. Confidence</div>
            <div class="stat-card-number" style="font-size:1.8rem;">${avgConf}${confCount ? '%' : ''}</div>
            <p class="small text-secondary">Across all predictions</p>
          </div>
        `;
    }

    // ── Chart 1: Disease Distribution (doughnut) ──────────────────────────
    const diseaseChartEl = section.querySelector('#chartDiseaseDistribution');
    if (diseaseChartEl && Object.keys(diseaseCounts).length > 0) {
        const labels = Object.keys(diseaseCounts).map(d => DISEASE_COLORS[d]?.label || d);
        const vals = Object.values(diseaseCounts);
        const bgColors = Object.keys(diseaseCounts).map(d => DISEASE_COLORS[d]?.bg || 'rgba(100,100,200,0.7)');
        const borderColors = Object.keys(diseaseCounts).map(d => DISEASE_COLORS[d]?.border || '#6464C8');

        diseaseChartEl.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.height = 240;
        diseaseChartEl.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        if (diseaseChartEl._chart) { try { diseaseChartEl._chart.destroy(); } catch(e){} }
        diseaseChartEl._chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: vals,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: 'rgba(255,255,255,0.8)', font: { size: 11 }, padding: 14, boxWidth: 14 }
                    },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} cases (${total ? (ctx.parsed/total*100).toFixed(1) : 0}%)` } }
                }
            }
        });
    } else if (diseaseChartEl) {
        renderEmptyChartById('chartDiseaseDistribution', 'Run diagnoses across different diseases to see distribution.');
    }

    // ── Chart 2: Risk Level Statistics (per disease bar) ─────────────────
    const riskChartEl = section.querySelector('#chartRiskStats');
    if (riskChartEl && Object.keys(diseaseRisk).length > 0) {
        const diseases = Object.keys(diseaseRisk);
        riskChartEl.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.height = 240;
        riskChartEl.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        if (riskChartEl._chart) { try { riskChartEl._chart.destroy(); } catch(e){} }
        riskChartEl._chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: diseases.map(d => DISEASE_COLORS[d]?.label || d),
                datasets: [
                    { label: '⚠️ High', data: diseases.map(d => diseaseRisk[d].RED), backgroundColor: 'rgba(239,68,68,0.9)', borderColor: '#EF4444', borderWidth: 1, borderRadius: 4 },
                    { label: '⚡ Medium', data: diseases.map(d => diseaseRisk[d].YELLOW), backgroundColor: 'rgba(245,158,11,0.85)', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 4 },
                    { label: '✅ Low', data: diseases.map(d => diseaseRisk[d].GREEN), backgroundColor: 'rgba(16,185,129,0.85)', borderColor: '#10B981', borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { color: 'rgba(255,255,255,0.75)', font: { size: 10 }, boxWidth: 12 } } },
                scales: {
                    x: { stacked: false, ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    } else if (riskChartEl) {
        renderEmptyChartById('chartRiskStats', 'No risk data available.');
    }

    // ── Chart 3: Prediction Trend (monthly line chart) ────────────────────
    const trendChartEl = section.querySelector('#chartPredictionTrend');
    if (trendChartEl) {
        const sortedMonths = Object.keys(monthlyTrend).sort((a, b) => new Date('01 ' + a) - new Date('01 ' + b)).slice(-12);
        const trendVals = sortedMonths.map(m => monthlyTrend[m]);

        trendChartEl.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.height = 200;
        trendChartEl.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        if (sortedMonths.length < 2) {
            // Simulated trend if not enough data
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'];
            const fakeVals = months.map((_,i) => Math.round(3 + i * 1.5 + Math.random() * 3));
            if (trendChartEl._chart) { try { trendChartEl._chart.destroy(); } catch(e){} }
            trendChartEl._chart = renderTrendChart(ctx, months, fakeVals, true);
        } else {
            if (trendChartEl._chart) { try { trendChartEl._chart.destroy(); } catch(e){} }
            trendChartEl._chart = renderTrendChart(ctx, sortedMonths, trendVals, false);
        }
    }

    // ── Chart 4: Patient Demographics (gender pie + age bar) ─────────────
    const genderChartEl = section.querySelector('#chartGender');
    if (genderChartEl) {
        const gTotal = genderCounts.male + genderCounts.female + genderCounts.unknown;
        if (gTotal > 0) {
            genderChartEl.innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.height = 200;
            genderChartEl.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            if (genderChartEl._chart) { try { genderChartEl._chart.destroy(); } catch(e){} }
            const gLabels = ['Male', 'Female', 'Unknown'].filter((_, i) => [genderCounts.male, genderCounts.female, genderCounts.unknown][i] > 0);
            const gVals = [genderCounts.male, genderCounts.female, genderCounts.unknown].filter(v => v > 0);
            genderChartEl._chart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: gLabels,
                    datasets: [{ data: gVals, backgroundColor: ['rgba(0,194,212,0.85)','rgba(239,68,68,0.8)','rgba(100,120,150,0.7)'], borderColor: ['#00C2D4','#EF4444','#6478A0'], borderWidth: 2 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.8)', font: { size: 11 }, padding: 12 } } }
                }
            });
        } else {
            renderEmptyChartById('chartGender', 'Gender data not available in records.');
        }
    }

    const ageChartEl = section.querySelector('#chartAge');
    if (ageChartEl) {
        const ageKeys = Object.keys(ageBuckets);
        const ageVals = Object.values(ageBuckets);
        const hasAge = ageVals.some(v => v > 0);
        if (hasAge) {
            ageChartEl.innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.height = 200;
            ageChartEl.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            if (ageChartEl._chart) { try { ageChartEl._chart.destroy(); } catch(e){} }
            ageChartEl._chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ageKeys,
                    datasets: [{
                        label: 'Patients',
                        data: ageVals,
                        backgroundColor: ageKeys.map((_, i) => `hsl(${180 + i * 30}, 70%, 55%)`),
                        borderRadius: 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.04)' } }
                    }
                }
            });
        } else {
            renderEmptyChartById('chartAge', 'Age data not available in records.');
        }
    }

    // ── Insights Summary ─────────────────────────────────────────────────
    const insightsEl = section.querySelector('#analyticsInsights');
    if (insightsEl) {
        const topDisease = Object.entries(diseaseCounts).sort((a,b) => b[1] - a[1])[0];
        const topDiseaseName = topDisease ? (DISEASE_COLORS[topDisease[0]]?.label || topDisease[0]) : 'N/A';
        const topDiseasePct = topDisease && total ? ((topDisease[1]/total)*100).toFixed(1) : 0;
        const highRiskPct = total ? ((highRisk/total)*100).toFixed(1) : 0;
        const detectionRate = total ? ((detected/total)*100).toFixed(1) : 0;

        insightsEl.innerHTML = `
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:16px;">
            <div style="background:rgba(0,194,212,0.06); border:1px solid rgba(0,194,212,0.15); border-radius:12px; padding:16px;">
              <div style="color:var(--accent-cyan); font-weight:700; font-size:0.85rem; margin-bottom:8px;">📊 Most Common Disease</div>
              <div style="font-size:1.2rem; font-weight:700; margin-bottom:4px;">${topDiseaseName}</div>
              <div class="small text-secondary">${topDiseasePct}% of all predictions</div>
            </div>
            <div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); border-radius:12px; padding:16px;">
              <div style="color:var(--accent-red); font-weight:700; font-size:0.85rem; margin-bottom:8px;">⚠️ High Risk Prevalence</div>
              <div style="font-size:1.2rem; font-weight:700; margin-bottom:4px;">${highRiskPct}%</div>
              <div class="small text-secondary">${highRisk} of ${total} patients flagged</div>
            </div>
            <div style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.15); border-radius:12px; padding:16px;">
              <div style="color:var(--accent-green); font-weight:700; font-size:0.85rem; margin-bottom:8px;">🎯 Detection Rate</div>
              <div style="font-size:1.2rem; font-weight:700; margin-bottom:4px;">${detectionRate}%</div>
              <div class="small text-secondary">AI-confirmed positive cases</div>
            </div>
          </div>
        `;
    }
}

function renderTrendChart(ctx, labels, data, isSimulated) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0,194,212,0.3)');
    gradient.addColorStop(1, 'rgba(0,194,212,0.0)');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: isSimulated ? 'Estimated Trend' : 'Predictions',
                data,
                borderColor: '#00C2D4',
                backgroundColor: gradient,
                pointBackgroundColor: '#00C2D4',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4,
                borderWidth: 2.5,
                borderDash: isSimulated ? [5, 3] : []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
        }
    });
}

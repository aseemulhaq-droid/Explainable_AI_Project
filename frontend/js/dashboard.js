// frontend/js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
    if (!document.body) return;
    initDashboard();
});

async function initDashboard() {
    // Guard: require token
    const token = sessionStorage.getItem('token');
    const role = (sessionStorage.getItem('role') || '').toString().toLowerCase();
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Ensure user is on the right dashboard for their role
    const current = window.location.pathname.split('/').pop();
    if (role === 'admin' && !current.includes('admin')) window.location.href = 'dashboard-admin.html';
    if (role === 'researcher' && !current.includes('researcher')) window.location.href = 'dashboard-researcher.html';
    if (role === 'doctor' && !current.includes('doctor')) window.location.href = 'dashboard-doctor.html';

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    let dataResp;
    try {
        dataResp = await authFetch('/history');
    } catch (e) {
        console.error('[dashboard] history fetch failed', e);
        document.getElementById('recent').textContent = 'Failed to load history.';
        // leave stat cards as placeholders
        renderEmptyCharts('Failed to load data');
        return;
    }
    let data = [];
    if (Array.isArray(dataResp)) data = dataResp;
    else if (dataResp && Array.isArray(dataResp.records)) data = dataResp.records;
    else if (dataResp && dataResp.success && Array.isArray(dataResp.records)) data = dataResp.records;
    else {
        console.warn('[dashboard] unexpected /history response', dataResp);
        document.getElementById('recent').textContent = 'No history data available.';
        renderEmptyCharts('No history data');
        return;
    }

    // Basic stats
    const total = data.length;
    const detected = data.filter(d => String(d.result).toUpperCase() === 'DETECTED').length;
    const avgConf = total ? (data.reduce((s, v) => s + (Number(v.confidence) || 0), 0) / total) : 0;

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    setText('totalCount', total.toString());
    setText('detectedCount', detected.toString());
    setText('avgConfidence', total ? `${avgConf.toFixed(1)}%` : '—');

    // Try to fetch optional /stats endpoint for richer role dashboards
    let statsResp = null;
    try { statsResp = await authFetch('/stats'); } catch(e) { /* ignore */ }

    // Populate generic stat1..stat4 if present (role-specific mapping)
    const setIf = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val != null && val !== '') ? String(val) : '—'; };
    const uniquePatients = new Set(data.map(d => d.patient_name).filter(Boolean)).size;
    const safeResults = total - detected;
    const detectedPct = total ? ((detected/total)*100).toFixed(1) + '%' : '—';

    if (role === 'doctor') {
        setIf('stat1', total);
        setIf('stat2', uniquePatients);
        setIf('stat3', detectedPct);
        setIf('stat4', safeResults);
    } else if (role === 'researcher') {
        // researcher: Total Cases Analyzed, Active Models, Average Model Accuracy, Datasets In Use
        const activeModels = statsResp && statsResp.active_models ? statsResp.active_models : (statsResp && statsResp.models ? statsResp.models.length : '—');
        const avgAcc = statsResp && statsResp.avg_accuracy ? (Number(statsResp.avg_accuracy).toFixed(1) + '%') : `${avgConf.toFixed(1)}%`;
        const datasets = statsResp && statsResp.datasets ? statsResp.datasets.length : (statsResp && statsResp.dataset_count ? statsResp.dataset_count : '—');
        setIf('stat1', total);
        setIf('stat2', activeModels);
        setIf('stat3', avgAcc);
        setIf('stat4', datasets);
    } else if (role === 'admin') {
        const totalUsers = statsResp && statsResp.total_users ? statsResp.total_users : '—';
        const activeDocs = statsResp && statsResp.active_doctors ? statsResp.active_doctors : '—';
        const uptime = statsResp && statsResp.uptime ? statsResp.uptime : '—';
        const pending = statsResp && statsResp.pending_approvals ? statsResp.pending_approvals : '—';
        setIf('stat1', totalUsers);
        setIf('stat2', activeDocs);
        setIf('stat3', uptime);
        setIf('stat4', pending);
    } else {
        // generic fallback: fill stat1..4 with useful summaries
        setIf('stat1', total);
        setIf('stat2', uniquePatients);
        setIf('stat3', `${avgConf.toFixed(1)}%`);
        setIf('stat4', detected);
    }

    // Render recent table
    const recentContainer = document.getElementById('recent');
    if (!recentContainer) return;

    if (data.length === 0) {
        recentContainer.textContent = 'No diagnoses yet.';
        // still render empty charts
        renderEmptyCharts('No diagnoses yet');
        return;
    }

    // Render a simple table for recent records
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Patient</th><th>Disease</th><th>Result</th><th>Confidence</th><th>Risk</th><th>Date</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    data.slice(0,50).forEach(item => {
        const risk = item.risk_level || '';
        const badgeClass = risk === 'RED' ? 'badge badge-red' : (risk === 'YELLOW' ? 'badge badge-yellow' : 'badge badge-green');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.patient_name || '—'}</td>
            <td>${item.disease || '—'}</td>
            <td>${item.result || '—'}</td>
            <td>${item.confidence != null ? (Number(item.confidence).toFixed(1) + '%') : '—'}</td>
            <td><span class="${badgeClass}">${risk || '—'}</span></td>
            <td>${item.date || '—'}</td>
        `;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    recentContainer.innerHTML = '';
    recentContainer.appendChild(table);

    // show user name if available
    const name = sessionStorage.getItem('name') || '';
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = name || 'Doctor';

    // New Diagnosis button: ensure auth before navigating
    const newBtn = document.getElementById('newDiagBtn');
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            const token = sessionStorage.getItem('token');
            if (!token) {
                // prompt login
                window.location.href = 'login.html';
                return;
            }
            window.location.href = 'new-diagnosis.html';
        });
    }

    // Render LIME overview and risk heatmap
    try {
        renderLimeOverview(data);
    } catch (e) { console.warn('[dashboard] renderLimeOverview failed', e); renderEmptyChartById('limeOverview', 'Failed to render LIME overview'); }
    try {
        renderRiskHeatmap(data);
    } catch (e) { console.warn('[dashboard] renderRiskHeatmap failed', e); renderEmptyChartById('riskHeatmap', 'Failed to render risk heatmap'); }
}

function renderEmptyCharts(message) {
    renderEmptyChartById('limeOverview', message || 'No data');
    renderEmptyChartById('riskHeatmap', message || 'No data');
}

function renderEmptyChartById(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.color = 'var(--text-secondary)';
    msg.style.padding = '12px';
    msg.textContent = message || 'No data available';
    el.appendChild(msg);
}

function renderLimeOverview(records) {
    const el = document.getElementById('limeOverview');
    if (!el) return;
    el.innerHTML = '';
    // aggregate absolute importance per feature across records
    const agg = new Map();
    records.forEach(r => {
        if (!r || !Array.isArray(r.lime_scores)) return;
        r.lime_scores.forEach(s => {
            const feature = s.feature || s.label || String(s.name || '');
            const val = Math.abs(Number(s.score) || 0);
            agg.set(feature, (agg.get(feature) || 0) + val);
        });
    });
    const items = Array.from(agg.entries()).map(([feature, value]) => ({ feature, value })).sort((a, b) => b.value - a.value);
    if (!items || items.length === 0) { renderEmptyChartById('limeOverview', 'No explanation data available'); return; }
    const top = items.slice(0, 10);
    const canvas = document.createElement('canvas'); canvas.style.width = '100%'; canvas.style.height = '220px'; el.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const labels = top.map(x => x.feature);
    const data = top.map(x => x.value);
    const colors = top.map((_,i) => `hsl(${(i*37)%360} 70% 50%)`);
    try {
        if (el._chart) { try { el._chart.destroy(); } catch(e){} }
        el._chart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ data, backgroundColor: colors, borderRadius:8 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } } });
    } catch(e) { console.warn('[dashboard] Chart render failed', e); renderEmptyChartById('limeOverview','Chart render failed'); }
}

function renderRiskHeatmap(records) {
    const el = document.getElementById('riskHeatmap');
    if (!el) return;
    el.innerHTML = '';
    // Build disease -> counts of risk levels
    const map = {};
    records.forEach(r => {
        const disease = r.disease || 'Unknown';
        const lvl = (r.risk_level || '').toString().toUpperCase() || (r.result && r.result.toString().toUpperCase() === 'DETECTED' ? 'RED' : 'GREEN');
        if (!map[disease]) map[disease] = { RED:0, YELLOW:0, GREEN:0, OTHER:0 };
        if (lvl === 'RED' || lvl === 'YELLOW' || lvl === 'GREEN') map[disease][lvl]++;
        else map[disease].OTHER++;
    });
    const diseases = Object.keys(map).slice(0, 12);
    if (diseases.length === 0) { renderEmptyChartById('riskHeatmap','No risk data available'); return; }
    const red = diseases.map(d => map[d].RED || 0);
    const yellow = diseases.map(d => map[d].YELLOW || 0);
    const green = diseases.map(d => map[d].GREEN || 0);
    const canvas = document.createElement('canvas'); canvas.style.width='100%'; canvas.style.height='220px'; el.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    try {
        if (el._chart) { try { el._chart.destroy(); } catch(e){} }
        el._chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: diseases,
                datasets: [
                    { label: 'High (RED)', data: red, backgroundColor: 'rgba(239,68,68,0.9)' },
                    { label: 'Medium (YELLOW)', data: yellow, backgroundColor: 'rgba(245,158,11,0.9)' },
                    { label: 'Low (GREEN)', data: green, backgroundColor: 'rgba(16,185,129,0.9)' }
                ]
            },
            options: {
                responsive:true,
                maintainAspectRatio:false,
                plugins: { legend: { position: 'top' } },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero:true } }
            }
        });
    } catch(e) { console.warn('[dashboard] risk chart failed', e); renderEmptyChartById('riskHeatmap','Chart render failed'); }
}

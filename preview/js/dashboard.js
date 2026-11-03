'use strict';
// Dashboard tab: Chart.js charts over the currently filtered entries
// (same four charts as the original renderCharts).
const Dashboard = {
  charts: {},
  COLORS: ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'],

  init() { /* nothing to bind; charts render on tab show */ },

  cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },

  render() {
    if (typeof Chart === 'undefined') return;
    Object.values(this.charts).forEach(c => c.destroy());
    this.charts = {};
    const filtered = App.state.filtered;
    const tick = this.cssVar('--text2') || '#94a3b8';
    const grid = App.theme.current() === 'dark' ? 'rgba(148,163,184,0.15)' : 'rgba(30,41,59,0.08)';
    const colors = this.COLORS;
    document.getElementById('dash-scope').textContent =
      'Based on ' + filtered.length + ' entries' + (filtered.length !== App.state.all.length ? ' (Log Book filters applied)' : ' (all entries)') + '.';

    const yearMap = {};
    filtered.forEach(r => { const y = r.date.substring(0, 4); yearMap[y] = (yearMap[y] || 0) + r.total_time; });
    const years = Object.keys(yearMap).sort();
    this.charts.yearly = new Chart(document.getElementById('chart-yearly'), {
      type: 'bar',
      data: { labels: years, datasets: [{ label: 'Hours', data: years.map(y => Math.round(yearMap[y] * 10) / 10), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tick }, grid: { color: grid } }, x: { ticks: { color: tick }, grid: { display: false } } } }
    });

    const acMap = {};
    filtered.forEach(r => { if (r.aircraft) acMap[r.aircraft] = (acMap[r.aircraft] || 0) + r.total_time; });
    const acSorted = Object.entries(acMap).sort((a, b) => b[1] - a[1]);
    this.charts.aircraft = new Chart(document.getElementById('chart-aircraft'), {
      type: 'doughnut',
      data: { labels: acSorted.map(a => a[0]), datasets: [{ data: acSorted.map(a => Math.round(a[1] * 10) / 10), backgroundColor: colors.concat(colors, colors) }] },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: tick, font: { size: 11 } } } } }
    });

    const now = new Date();
    const months = [];
    for (let i = 23; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(ymd(d).substring(0, 7)); }
    const monthMap = {};
    filtered.forEach(r => { const m = r.date.substring(0, 7); monthMap[m] = (monthMap[m] || 0) + r.total_time; });
    this.charts.monthly = new Chart(document.getElementById('chart-monthly'), {
      type: 'line',
      data: { labels: months.map(m => m.substring(2)), datasets: [{ label: 'Hours', data: months.map(m => Math.round((monthMap[m] || 0) * 10) / 10), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)', fill: true, tension: 0.3 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tick }, grid: { color: grid } }, x: { ticks: { color: tick, maxRotation: 45 }, grid: { display: false } } } }
    });

    const cats = [{ k: 'pic', l: 'PIC' }, { k: 'sic', l: 'SIC' }, { k: 'night', l: 'Night' }, { k: 'cross_country', l: 'XC' }, { k: 'actual_inst', l: 'Act Inst' }, { k: 'sim_inst', l: 'Sim Inst' }, { k: 'single_engine', l: 'Single' }, { k: 'multi_engine', l: 'Multi' }, { k: 'jet', l: 'Jet' }, { k: 'turbo_prop', l: 'Turbo Prop' }];
    const catVals = cats.map(c => sumKey(filtered, c.k));
    this.charts.categories = new Chart(document.getElementById('chart-categories'), {
      type: 'bar',
      data: { labels: cats.map(c => c.l), datasets: [{ data: catVals.map(v => Math.round(v * 10) / 10), backgroundColor: colors }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { color: tick }, grid: { color: grid } }, y: { ticks: { color: tick }, grid: { display: false } } } }
    });
  }
};

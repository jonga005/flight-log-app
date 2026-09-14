'use strict';
// Summary tab: period x grouping totals over the currently filtered entries.
const Summary = {
  SUM_KEYS: ['total_time', 'pic', 'sic', 'night', 'cross_country', 'actual_inst', 'sim_inst', 'approaches', 'drops', 'single_engine', 'multi_engine', 'jet', 'turbo_prop', 'day_landings', 'night_landings', 'c130_total', 'b737_total', 'bae146_total', 'citation', 'over_12500', 'p2_pic'],
  SUM_LABELS: { total_time: 'Total Time', pic: 'PIC', sic: 'SIC', night: 'Night', cross_country: 'Cross Country', actual_inst: 'Act. Instrument', sim_inst: 'Sim Instrument', approaches: 'Approaches', drops: 'Drops', single_engine: 'Single Engine', multi_engine: 'Multi Engine', jet: 'Jet', turbo_prop: 'Turbo Prop', day_landings: 'Day Landings', night_landings: 'Night Landings', c130_total: 'C130/L382', b737_total: 'B737', bae146_total: 'BAe 146', citation: 'Citation', over_12500: '>12,500 lbs', p2_pic: 'P2V PIC' },

  init() {
    document.getElementById('s-period').addEventListener('change', () => this.render());
    document.getElementById('s-group').addEventListener('change', () => this.render());
  },

  // Pure: filter rows to a period relative to `now`.
  periodFilter(rows, period, now) {
    now = now || new Date();
    let cutoff = null;
    if (period === 'last12') cutoff = ymd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
    else if (period === 'last90') cutoff = ymd(new Date(now.getTime() - 90 * 86400000));
    else if (period === 'last30') cutoff = ymd(new Date(now.getTime() - 30 * 86400000));
    else if (period === 'year') cutoff = now.getFullYear() + '-01-01';
    return cutoff ? rows.filter(r => r.date >= cutoff) : rows.slice();
  },

  totalsOf(recs) {
    const t = {};
    this.SUM_KEYS.forEach(k => { t[k] = sumKey(recs, k); });
    return t;
  },

  card(title, recs) {
    const totals = this.totalsOf(recs);
    let html = '<div class="summary-card"><h3>' + escapeHtml(title) + ' (' + recs.length + ' entries)</h3><table class="summary-table">';
    this.SUM_KEYS.forEach(k => {
      if (totals[k] > 0) html += '<tr><td class="row-label">' + this.SUM_LABELS[k] + '</td><td class="row-value">' + totals[k].toFixed(1) + '</td></tr>';
    });
    return html + '</table></div>';
  },

  render() {
    const period = document.getElementById('s-period').value;
    const group = document.getElementById('s-group').value;
    const data = this.periodFilter(App.state.filtered, period, new Date());
    const scope = document.getElementById('summary-scope');
    scope.textContent = App.state.filtered.length !== App.state.all.length ? 'Log Book filters are applied (' + App.state.filtered.length + ' of ' + App.state.all.length + ' entries).' : '';
    const out = document.getElementById('summary-content');

    if (group === 'totals') {
      out.innerHTML = '<div style="max-width:600px">' + this.card('Totals', data) + '</div>';
      return;
    }
    const groups = {};
    data.forEach(r => {
      let g;
      if (group === 'aircraft') g = r.aircraft || 'Unknown';
      else if (group === 'year') g = r.date.substring(0, 4);
      else if (group === 'month') g = r.date.substring(0, 7);
      else g = r.tail_number || 'Unknown';
      if (!groups[g]) groups[g] = [];
      groups[g].push(r);
    });
    const sorted = Object.keys(groups).sort((a, b) => (group === 'year' || group === 'month')
      ? a.localeCompare(b)
      : sumKey(groups[b], 'total_time') - sumKey(groups[a], 'total_time'));
    out.innerHTML = '<div class="summary-grid">' + sorted.map(g => this.card(g, groups[g])).join('') + '</div>';
  }
};

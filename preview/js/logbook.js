'use strict';
// Log Book tab: filters, sortable table with totals, stat cards, currency
// panel, column visibility, and the add/edit/delete entry modal.
const Logbook = {
  sortCol: 'date',
  sortDir: 'desc',
  CHUNK: 200,          // rows added each time the list scrolls near the bottom
  shown: 200,
  hiddenCols: [],
  editingId: null,
  seed: null,          // values a new entry starts from (Next leg / Duplicate)
  warned: false,       // save checks shown once; the next Save goes through
  showAllFields: false,
  userTailMap: {},

  $(id) { return document.getElementById(id); },

  // ---- init ------------------------------------------------------------
  init() {
    const savedCols = Data.getSetting('hiddenCols', null);
    this.hiddenCols = savedCols ? savedCols.slice() : presetHiddenCols('current');
    this.userTailMap = Object.assign({}, Data.getSetting('tail_map', {}));
    Object.assign(TAIL_MAP, this.userTailMap);

    this.populateDropdowns();
    this.renderColPanel();

    // filters
    this.$('btn-more-filters').addEventListener('click', () => { const m = this.$('more-filters'); m.hidden = !m.hidden; });
    this.$('btn-clear').addEventListener('click', () => this.clearFilters());
    ['f-aircraft', 'f-tail', 'f-category'].forEach(id => this.$(id).addEventListener('change', () => this.applyFilters()));
    ['f-search', 'f-date-from', 'f-date-to'].forEach(id => {
      this.$(id).addEventListener('keydown', e => { if (e.key === 'Enter') this.applyFilters(); });
      this.$(id).addEventListener('change', () => this.applyFilters());
    });
    this.$('f-date-from').addEventListener('input', () => this.syncQuickNavFromDates());
    this.$('f-date-to').addEventListener('input', () => this.syncQuickNavFromDates());
    this.$('f-year').addEventListener('change', () => this.quickNav());
    this.$('f-month').addEventListener('change', () => this.quickNav());
    this.$('nav-prev').addEventListener('click', () => this.navStep(-1));
    this.$('nav-next').addEventListener('click', () => this.navStep(1));

    // toolbar actions
    this.$('btn-add').addEventListener('click', () => this.openAdd());
    this.$('btn-import').addEventListener('click', () => ImportMod.open());
    this.$('btn-columns').addEventListener('click', () => { const p = this.$('col-panel'); p.hidden = !p.hidden; });
    const menu = this.$('export-menu');
    this.$('btn-export').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', () => { menu.hidden = true; });
    this.$('btn-export-csv').addEventListener('click', () => ExportMod.csv(App.state.filtered, this.visibleFields()));
    this.$('btn-export-json').addEventListener('click', () => ExportMod.json());
    this.$('btn-export-xlsx').addEventListener('click', () => ExportMod.xlsx());

    // column panel
    this.$('col-grid').addEventListener('click', e => {
      const t = e.target.closest('.col-toggle');
      if (t) this.toggleCol(t.dataset.key);
    });
    this.$('col-presets').addEventListener('click', e => {
      const b = e.target.closest('button[data-preset]');
      if (b) this.applyPreset(b.dataset.preset);
    });

    // table interactions (delegated): one click on a row opens it in the panel
    const wrap = this.$('table-wrap');
    wrap.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (th) { this.setSort(th.dataset.sort); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) this.openEdit(tr.dataset.id);
    });
    // one continuous list: more rows load as you scroll near the bottom
    wrap.addEventListener('scroll', () => {
      if (this.shown >= App.state.filtered.length) return;
      if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 400) this.showMore();
    });
    // on a phone the whole page scrolls instead of the table box
    window.addEventListener('scroll', () => {
      if (this.shown >= App.state.filtered.length || App.state.tab !== 'logbook') return;
      if (window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 600) this.showMore();
    }, { passive: true });
    this.$('btn-dock-add').addEventListener('click', () => this.openAdd());
    this.$('btn-dock-next').addEventListener('click', () => {
      const latest = App.state.all.reduce((a, r) => (!a || r.date > a.date ? r : a), null);
      if (latest) this.nextLegFrom(latest); else this.openAdd();
    });
    this.$('table-status').addEventListener('click', e => {
      if (e.target.closest('[data-show-all]')) { this.shown = App.state.filtered.length; this.renderTable(); }
    });

    // entry panel
    this.$('btn-entry-save').addEventListener('click', () => this.saveEntry());
    this.$('btn-entry-cancel').addEventListener('click', () => this.closePanel());
    this.$('btn-entry-close').addEventListener('click', () => this.closePanel());
    this.$('btn-entry-nextleg').addEventListener('click', () => this.nextLeg());
    this.$('btn-entry-dup').addEventListener('click', () => this.duplicate());
    this.$('btn-entry-delete').addEventListener('click', () => this.deleteEntry());
    this.$('btn-entry-history').addEventListener('click', () => this.showHistory());
    this.$('btn-entry-allfields').addEventListener('click', () => {
      const cur = this.readForm();
      this.showAllFields = !this.showAllFields;
      this.buildForm(cur);
    });
    this.$('entry-form-el').addEventListener('submit', e => { e.preventDefault(); this.saveEntry(); });
    this.$('entry-form').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); this.saveEntry(); }
    });
    this.$('entry-form').addEventListener('input', e => {
      this.onFormInput(e);
      this.clearWarnings();
    });
    this.$('entry-form').addEventListener('click', e => {
      const b = e.target.closest('button[data-role]');
      if (b) this.setRole(b.dataset.role);
    });
    // Esc closes the panel, unless a dialog (history, import) is open on top of it.
    // Capture phase so we see the overlays before App's handler hides them.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || this.$('modal').hidden) return;
      if (Array.from(document.querySelectorAll('.modal-overlay')).some(m => !m.hidden)) return;
      this.closePanel();
    }, true);
    this.$('btn-history-close').addEventListener('click', () => App.closeModal('history-modal'));
    this.$('history-modal').addEventListener('click', e => { if (e.target.id === 'history-modal') App.closeModal('history-modal'); });
  },

  onDataChanged() {
    this.populateDropdowns();
    this.applyFilters();
  },

  // ---- columns ----------------------------------------------------------
  isColVisible(key) { return this.hiddenCols.indexOf(key) < 0; },
  visibleFields() { return FIELDS.filter(f => this.isColVisible(f.key)); },
  toggleCol(key) {
    if (this.hiddenCols.indexOf(key) >= 0) this.hiddenCols = this.hiddenCols.filter(k => k !== key);
    else this.hiddenCols.push(key);
    Data.setSetting('hiddenCols', this.hiddenCols.slice());
    this.renderColPanel();
    this.renderTable();
  },
  applyPreset(name) {
    this.hiddenCols = presetHiddenCols(name);
    Data.setSetting('hiddenCols', this.hiddenCols.slice());
    this.renderColPanel();
    this.renderTable();
  },
  renderColPanel() {
    this.$('col-grid').innerHTML = FIELDS.filter(f => f.hideable).map(f => {
      const vis = this.isColVisible(f.key);
      return '<div class="col-toggle ' + (vis ? '' : 'hidden-col') + '" data-key="' + f.key + '">' + (vis ? '&#10003; ' : '') + escapeHtml(f.label) + '</div>';
    }).join('');
  },

  // ---- dropdowns / quick nav -------------------------------------------
  populateDropdowns() {
    const all = App.state.all;
    const fill = (id, values, allLabel) => {
      const sel = this.$(id);
      const cur = sel.value;
      sel.innerHTML = '<option value="">' + allLabel + '</option>' + values.map(v => '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>').join('');
      if (values.indexOf(cur) >= 0) sel.value = cur;
    };
    fill('f-aircraft', [...new Set(all.map(r => r.aircraft).filter(Boolean))].sort(), 'All aircraft');
    fill('f-tail', [...new Set(all.map(r => r.tail_number).filter(Boolean))].sort(), 'All tails');
    const years = [...new Set(all.map(r => r.date.substring(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort().reverse();
    fill('f-year', years, 'All years');
  },

  quickNav() {
    const y = this.$('f-year').value, m = this.$('f-month').value;
    if (!y) {
      this.$('f-month').value = '';
      this.$('f-date-from').value = '';
      this.$('f-date-to').value = '';
    } else if (!m) {
      this.$('f-date-from').value = y + '-01-01';
      this.$('f-date-to').value = y + '-12-31';
    } else {
      const last = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
      this.$('f-date-from').value = y + '-' + m + '-01';
      this.$('f-date-to').value = y + '-' + m + '-' + String(last).padStart(2, '0');
    }
    this.applyFilters();
  },

  navStep(dir) {
    const ySel = this.$('f-year'), mSel = this.$('f-month');
    const years = Array.from(ySel.options).map(o => o.value).filter(Boolean); // newest first
    if (!years.length) return;
    if (!ySel.value) { ySel.value = years[0]; mSel.value = ''; this.quickNav(); return; }
    if (mSel.value) {
      let y = parseInt(ySel.value, 10), m = parseInt(mSel.value, 10) + dir;
      if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
      const ys = String(y);
      if (years.indexOf(ys) < 0) return;
      ySel.value = ys; mSel.value = String(m).padStart(2, '0');
    } else {
      const idx = years.indexOf(ySel.value);
      const next = years[idx - dir]; // list is newest-first
      if (!next) return;
      ySel.value = next;
    }
    this.quickNav();
  },

  syncQuickNavFromDates() {
    const df = this.$('f-date-from').value, dt = this.$('f-date-to').value;
    const ySel = this.$('f-year'), mSel = this.$('f-month');
    if (df && dt && df.substring(0, 4) === dt.substring(0, 4)) {
      const y = df.substring(0, 4);
      if (Array.from(ySel.options).some(o => o.value === y)) ySel.value = y; else ySel.value = '';
      mSel.value = (df.substring(5, 7) === dt.substring(5, 7)) ? df.substring(5, 7) : '';
    } else { ySel.value = ''; mSel.value = ''; }
  },

  // ---- filtering / sorting ---------------------------------------------
  applyFilters() {
    const df = this.$('f-date-from').value;
    const dt = this.$('f-date-to').value;
    const ac = this.$('f-aircraft').value;
    const tl = this.$('f-tail').value;
    const q = this.$('f-search').value.trim().toUpperCase();
    const cat = this.$('f-category').value;
    App.state.filtered = App.state.all.filter(r => {
      if (df && r.date < df) return false;
      if (dt && r.date > dt) return false;
      if (ac && r.aircraft !== ac) return false;
      if (tl && r.tail_number !== tl) return false;
      if (q && !(r.route_from + ' ' + r.route_to + ' ' + r.notes + ' ' + r.tail_number + ' ' + r.aircraft).toUpperCase().includes(q)) return false;
      if (cat && !r[cat]) return false;
      return true;
    });
    this.shown = this.CHUNK;
    this.sortData();
    this.render();
    if (App.state.tab === 'dashboard') Dashboard.render();
    if (App.state.tab === 'summary') Summary.render();
  },

  clearFilters() {
    ['f-date-from', 'f-date-to', 'f-search', 'f-aircraft', 'f-tail', 'f-category', 'f-year', 'f-month'].forEach(id => { this.$(id).value = ''; });
    this.applyFilters();
  },

  sortData() {
    const col = this.sortCol, dir = this.sortDir;
    App.state.filtered.sort((a, b) => {
      let va = a[col], vb = b[col];
      if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va;
      va = String(va); vb = String(vb);
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  },

  setSort(col) {
    if (this.sortCol === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortCol = col; this.sortDir = col === 'date' ? 'desc' : 'asc'; }
    this.sortData();
    this.renderTable();
  },

  // ---- rendering ---------------------------------------------------------
  render() {
    this.renderStats();
    this.renderCurrency();
    this.renderTable();
  },

  showMore() {
    const wrap = this.$('table-wrap'), top = wrap.scrollTop, pageTop = window.scrollY;
    this.shown += this.CHUNK;
    this.renderTable();
    wrap.scrollTop = top;
    window.scrollTo(0, pageTop);
  },

  // Phone / iPad portrait: the panel is a full-height sheet over the list.
  isCompact() { return window.matchMedia && matchMedia('(max-width: 1024px)').matches; },
  isPhone() { return window.matchMedia && matchMedia('(max-width: 640px)').matches; },

  renderTable() {
    const data = App.state.filtered;
    const visCols = this.visibleFields().filter(f => f.key !== 'notes');
    const end = Math.min(this.shown, data.length);
    const rows = data.slice(0, end);
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Month header rows with that month's totals, only when sorted by date.
    const byMonth = this.sortCol === 'date';
    const monthSets = {};
    if (byMonth) data.forEach(r => { const k = r.date.substring(0, 7); (monthSets[k] = monthSets[k] || []).push(r); });
    let lead = 0; // text columns before the first number column; the month label spans them
    while (lead < visCols.length && visCols[lead].type !== 'num') lead++;
    const monthRow = key => {
      const set = monthSets[key] || [];
      const label = /^\d{4}-\d{2}$/.test(key) ? MONTHS[parseInt(key.substring(5), 10) - 1] + ' ' + key.substring(0, 4) : key;
      let h = '<tr class="month-row"><td></td><td class="month-label" colspan="' + lead + '">' + escapeHtml(label) + ' <span class="muted">· ' + set.length + (set.length === 1 ? ' flight' : ' flights') + '</span></td>';
      visCols.slice(lead).forEach(f => {
        const s = f.type === 'num' ? sumKey(set, f.key) : 0;
        h += '<td class="num col-' + f.key + '">' + (s ? fmtNum(Math.round(s * 10) / 10) : '') + '</td>';
      });
      return h + '<td></td></tr>';
    };

    let html = '<table class="log"><thead><tr><th style="width:36px">#</th>';
    visCols.forEach(f => {
      const cls = (this.sortCol === f.key ? (this.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : '') + (f.type === 'num' ? ' num' : '');
      html += '<th class="' + cls + '" data-sort="' + f.key + '">' + escapeHtml(f.label) + '</th>';
    });
    html += '<th data-sort="notes">Notes</th></tr></thead><tbody>';

    let lastMonth = null;
    rows.forEach((r, i) => {
      const mk = r.date.substring(0, 7);
      if (byMonth && mk !== lastMonth) { html += monthRow(mk); lastMonth = mk; }
      html += '<tr data-id="' + escapeHtml(r.id) + '"' + (r.id === this.editingId ? ' class="sel"' : '') + ' title="Click to open"><td class="num muted">' + (i + 1) + '</td>';
      visCols.forEach(f => {
        if (f.type === 'num') {
          const v = r[f.key];
          html += '<td class="num col-' + f.key + (v === 0 ? ' zero' : '') + '">' + fmtNum(v) + '</td>';
        } else {
          html += '<td class="col-' + f.key + '" title="' + escapeHtml(r[f.key]) + '">' + escapeHtml(r[f.key]) + '</td>';
        }
      });
      const notes = r.notes ? r.notes.substring(0, 30) + (r.notes.length > 30 ? '…' : '') : '';
      html += '<td class="notes-cell" title="' + escapeHtml(r.notes || '') + '">' + escapeHtml(notes) +
        (r.source && r.source !== 'historical' ? '<span class="source-tag">' + escapeHtml(r.source) + '</span>' : '') + '</td></tr>';
    });
    html += '</tbody>';

    // grand total of the filtered set, like the bottom of a paper log page
    const totalsRow = (label, set, cls) => {
      let h = '<tr class="' + cls + '"><td class="label" colspan="1">' + label + '</td>';
      visCols.forEach(f => {
        if (f.type === 'num') {
          const s = sumKey(set, f.key);
          h += '<td class="num">' + (s ? (Math.round(s * 10) / 10).toFixed(1) : '') + '</td>';
        } else if (f.key === 'date') {
          h += '<td class="muted small">' + set.length + ' entries</td>';
        } else h += '<td></td>';
      });
      return h + '<td></td></tr>';
    };
    html += '<tfoot>' + totalsRow('Total', data, 'all-totals') + '</tfoot></table>';
    this.$('table-wrap').innerHTML = html;

    this.$('table-status').innerHTML = '<span>Showing ' + end.toLocaleString() + ' of <b>' + data.length.toLocaleString() + '</b> entries' +
      (end < data.length ? ' · scroll for more</span><button class="btn btn-sm btn-ghost" data-show-all>Show all</button>' : '</span>') +
      (byMonth ? '' : '<span class="small muted">Month totals show when sorted by date</span>');
  },

  // Plain-words description of what the Log Book filters currently select.
  scopeLabel() {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const y = this.$('f-year').value, m = this.$('f-month').value;
    const df = this.$('f-date-from').value, dt = this.$('f-date-to').value;
    const parts = [];
    if (y && m) parts.push(MONTHS[parseInt(m, 10) - 1] + ' ' + y);
    else if (y) parts.push(y);
    else if (df || dt) parts.push((df || 'start') + ' to ' + (dt || 'today'));
    ['f-aircraft', 'f-tail'].forEach(id => { if (this.$(id).value) parts.push(this.$(id).value); });
    const cat = this.$('f-category');
    if (cat.value) parts.push(cat.options[cat.selectedIndex].text);
    if (this.$('f-search').value.trim()) parts.push('"' + this.$('f-search').value.trim() + '"');
    return parts.length ? parts.join(' · ') : 'All flights';
  },

  renderStats() {
    const d = App.state.filtered;
    const items = [
      { key: 'total_time', label: 'Total', value: sumKey(d, 'total_time').toFixed(1) },
      { key: 'pic', label: 'PIC', value: sumKey(d, 'pic').toFixed(1) },
      { key: 'sic', label: 'SIC', value: sumKey(d, 'sic').toFixed(1) },
      { key: 'night', label: 'Night', value: sumKey(d, 'night').toFixed(1) },
      { key: 'landings', label: 'Landings', value: (sumKey(d, 'day_landings') + sumKey(d, 'night_landings')).toFixed(0) },
      { key: 'drops', label: 'Drops', value: sumKey(d, 'drops').toFixed(0) }
    ];
    this.$('stats').innerHTML =
      '<div class="scope" id="stat-entries" data-value="' + d.length + '" title="Totals follow the filters below">' +
        '<div class="scope-what">' + escapeHtml(this.scopeLabel()) + '</div>' +
        '<div class="scope-count">' + d.length.toLocaleString() + ' flights</div></div>' +
      items.map(i =>
        '<div class="stat" id="stat-' + i.key + '" data-value="' + i.value + '"><div class="label">' + i.label + '</div><div class="value">' + Number(i.value).toLocaleString() + '</div></div>'
      ).join('');
  },

  // Pure: recency/currency figures from all entries as of `now`.
  currency(all, now) {
    now = now || new Date();
    const cut = d => ymd(d);
    const d90 = cut(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
    const d30 = cut(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    const d6m = cut(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()));
    const d12 = cut(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
    const today = cut(now);
    const inRange = (r, from) => r.date >= from && r.date <= today;
    const l90 = all.filter(r => inRange(r, d90));
    const l30 = all.filter(r => inRange(r, d30));
    const l6m = all.filter(r => inRange(r, d6m));
    const l12 = all.filter(r => inRange(r, d12));
    const r1 = v => Math.round(v * 10) / 10;
    return {
      dayLandings90: sumKey(l90, 'day_landings'),
      nightLandings90: sumKey(l90, 'night_landings'),
      landings90: sumKey(l90, 'day_landings') + sumKey(l90, 'night_landings'),
      approaches6mo: sumKey(l6m, 'approaches'),
      hours12mo: r1(sumKey(l12, 'total_time')),
      hours30d: r1(sumKey(l30, 'total_time')),
      hours90d: r1(sumKey(l90, 'total_time'))
    };
  },

  renderCurrency() {
    const c = this.currency(App.state.all, new Date());
    // state: 'ok' / 'warn' pills against the 61.57 counts (3 landings, 6 approaches); 'info' for hours
    const pill = (id, text, value, state, tip) => '<span class="pill pill-' + state + '" id="cur-' + id + '" data-value="' + value + '" title="' + tip + '">' + text + '</span>';
    const need = (n, min) => n >= min ? 'ok' : 'warn';
    this.$('currency').innerHTML =
      '<span class="cur-title" title="Always counted over every flight, ignoring the filters">Currency · all flights</span>' +
      pill('ldg90', 'Ldg 90d ' + c.landings90, c.landings90, need(c.landings90, 3), 'Landings in the last 90 days: ' + c.dayLandings90 + ' day, ' + c.nightLandings90 + ' night (3 needed)') +
      pill('nldg90', 'Night ldg 90d ' + c.nightLandings90, c.nightLandings90, need(c.nightLandings90, 3), 'Night landings in the last 90 days (3 needed for night passengers)') +
      pill('appr6', 'Appr 6 mo ' + c.approaches6mo, c.approaches6mo, need(c.approaches6mo, 6), 'Instrument approaches in the last 6 months (6 needed)') +
      pill('hrs30', '30d ' + c.hours30d.toFixed(1), c.hours30d.toFixed(1), 'info', 'Hours in the last 30 days') +
      pill('hrs90', '90d ' + c.hours90d.toFixed(1), c.hours90d.toFixed(1), 'info', 'Hours in the last 90 days') +
      pill('hrs12', '12 mo ' + c.hours12mo.toFixed(1), c.hours12mo.toFixed(1), 'info', 'Hours in the last 12 months');
  },

  // ---- entry panel -------------------------------------------------------
  // Number fields outside FORM_SECTIONS, shown under "More fields" when
  // toggled on, or individually whenever the entry already has a value there.
  extraFields(values) {
    const inSections = [].concat(...FORM_SECTIONS.map(s => s.keys));
    return NUM_FIELDS.filter(f => inSections.indexOf(f.key) < 0 && (this.showAllFields || values[f.key]));
  },

  buildForm(values) {
    values = values || {};
    const tails = [...new Set(App.state.all.map(r => r.tail_number).filter(Boolean))].sort();
    const val = k => escapeHtml(values[k] === undefined || values[k] === null ? '' : values[k]);
    const numVal = k => (values[k] ? escapeHtml(values[k]) : '');
    const numInput = f => '<div class="form-group"><label for="inp-' + f.key + '">' + escapeHtml(f.label) + '</label><input type="text" id="inp-' + f.key + '" inputmode="decimal" value="' + numVal(f.key) + '"></div>';
    const section = (title, inner, cls) => '<div class="form-section"><div class="form-section-title">' + title + '</div><div class="form-grid ' + (cls || '') + '">' + inner + '</div></div>';

    let flight = '';
    flight += '<div class="form-group span2"><label for="inp-date">Date</label><input type="date" id="inp-date" value="' + val('date') + '" required></div>';
    flight += '<div class="form-group"><label for="inp-tail_number">Tail #</label><input type="text" id="inp-tail_number" list="tail-list" value="' + val('tail_number') + '"><datalist id="tail-list">' + tails.map(t => '<option value="' + escapeHtml(t) + '">').join('') + '</datalist></div>';
    flight += '<div class="form-group"><label for="inp-aircraft">Aircraft <span class="hint">(from tail)</span></label><input type="text" id="inp-aircraft" value="' + val('aircraft') + '"></div>';
    flight += '<div class="form-group"><label for="inp-route_from">From</label><input type="text" id="inp-route_from" value="' + val('route_from') + '"></div>';
    flight += '<div class="form-group"><label for="inp-route_to">To</label><input type="text" id="inp-route_to" value="' + val('route_to') + '"></div>';
    let html = section('Flight', flight);
    FORM_SECTIONS.forEach(s => {
      let inner = s.keys.map(k => numInput(NUM_FIELDS.find(f => f.key === k))).join('');
      if (s.role) {
        inner = inner.replace('</div>', '</div>' + // role toggle right after Total Time
          '<div class="form-group span2"><span class="label">Role</span><div class="role-toggle" id="role-toggle">' +
          ['pic', 'sic', 'none'].map(r => '<button type="button" data-role="' + r + '">' + (r === 'none' ? 'Neither' : r.toUpperCase()) + '</button>').join('') +
          '</div></div>');
      }
      const title = s.auto ? s.title + ' <span class="hint">shaded = filled for you; type in a box to set it yourself</span>' : s.title;
      html += section(title, inner);
    });
    const extra = this.extraFields(values);
    if (extra.length) html += section(this.showAllFields ? 'More fields' : 'Other fields with values', extra.map(numInput).join(''));
    html += '<div class="form-section"><div class="form-group"><label for="inp-notes">Notes</label><textarea id="inp-notes">' + val('notes') + '</textarea></div></div>';
    this.$('entry-form').innerHTML = html;
    this.$('btn-entry-allfields').textContent = this.showAllFields ? 'Fewer fields' : 'More fields';
    this.initAuto(values);
    this.clearWarnings();
  },

  // ---- auto-fill from aircraft type + role --------------------------------
  // A field is "auto" while its value is what the rules would give (or it is
  // empty on a new entry). Auto fields follow Total / Aircraft / Role as they
  // change; typing in one makes it the user's own and it is never touched again.
  AUTO_KEYS: ['single_engine', 'multi_engine', 'jet', 'turbo_prop', 'over_12500', 'pic', 'sic', 'cross_country',
    'b737_total', 'b737_pic', 'bae146_total', 'bae146_pic', 'c130_total', 'c130_pic', 'c130_sic', 'citation', 'p2_pic', 'p2_sic'],

  expectedAuto(aircraft, t, role) {
    t = t || 0;
    const d = String(aircraft || '').trim()
      ? deriveFromType(aircraft, t, role === 'pic', role === 'sic')
      : { pic: role === 'pic' ? t : 0, sic: role === 'sic' ? t : 0 }; // unknown type: only the role fields
    const out = {};
    this.AUTO_KEYS.forEach(k => { out[k] = d[k] || 0; });
    out.cross_country = t;
    return out;
  },

  initAuto(values) {
    const isNew = !this.editingId;
    if (values.sic && !values.pic) this.role = 'sic';
    else if (values.pic || isNew || !values.total_time) this.role = 'pic';
    else this.role = 'none';
    const exp = this.expectedAuto(values.aircraft, values.total_time, this.role);
    this.autoKeys = new Set(this.AUTO_KEYS.filter(k => {
      const v = values[k] || 0;
      return (isNew && !v) || Math.abs(v - exp[k]) < 0.001; // exact match only, so stored odd values are never rewritten
    }));
    this.applyAuto();
  },

  readAutoInputs() {
    const t = parseFloat(this.$('inp-total_time').value) || 0;
    return this.expectedAuto(this.$('inp-aircraft').value, t, this.role);
  },

  applyAuto() {
    const exp = this.readAutoInputs();
    this.$('role-toggle').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.role === this.role));
    this.AUTO_KEYS.forEach(k => {
      const el = this.$('inp-' + k);
      if (!el) return;
      const auto = this.autoKeys.has(k);
      if (auto) el.value = exp[k] ? String(exp[k]) : '';
      el.classList.toggle('auto', auto);
      el.tabIndex = auto ? -1 : 0; // Tab skips filled boxes: Total -> Night -> landings
    });
  },

  onFormInput(e) {
    const id = e.target.id || '';
    const key = id.replace(/^inp-/, '');
    if (this.AUTO_KEYS.indexOf(key) >= 0) {
      this.autoKeys.delete(key);
      e.target.classList.remove('auto');
      e.target.tabIndex = 0;
      return;
    }
    if (id === 'inp-tail_number') this.onTailInput();
    if (id === 'inp-tail_number' || id === 'inp-aircraft' || id === 'inp-total_time') this.applyAuto();
  },

  setRole(role) {
    this.role = role;
    this.applyAuto();
    this.clearWarnings();
  },

  showPanel(title, meta, editing) {
    this.$('modal-title').textContent = title;
    this.$('entry-meta').textContent = meta;
    this.$('btn-entry-delete').hidden = !editing;
    this.$('btn-entry-history').hidden = !editing;
    this.$('entry-quick').hidden = !editing;
    App.openModal('modal');
    document.body.classList.add('panel-open');
    this.$('modal').scrollTop = 0;
    this.markSelected();
    if (!this.isPhone()) this.$('inp-date').focus(); // on a phone, don't pop the keyboard until a box is tapped
  },

  closePanel() {
    App.closeModal('modal');
    document.body.classList.remove('panel-open');
    this.editingId = null;
    this.seed = null;
    this.markSelected();
  },

  markSelected() {
    this.$('table-wrap').querySelectorAll('tr.sel').forEach(tr => tr.classList.remove('sel'));
    if (!this.editingId || this.$('modal').hidden) return;
    const tr = this.$('table-wrap').querySelector('tr[data-id="' + CSS.escape(this.editingId) + '"]');
    if (tr) tr.classList.add('sel');
  },

  // New entry continuing from the open one: same day and aircraft, departing
  // from where that one landed.
  nextLeg() {
    const r = this.editingId && Data.get(this.editingId);
    if (r) this.nextLegFrom(r);
  },

  nextLegFrom(r) {
    // imported multi-leg days keep the whole route in From (e.g. KRDD-KMCC-KRDD): use its last airport
    const landed = r.route_to || String(r.route_from || '').split('-').pop().trim();
    this.openAdd({ date: r.date, tail_number: r.tail_number, aircraft: r.aircraft, route_from: landed }, 'Next leg after ' + r.date);
    if (!this.isPhone()) this.$('inp-route_to').focus();
  },

  duplicate() {
    const r = this.editingId && Data.get(this.editingId);
    if (!r) return;
    this.openAdd(normalizeFields(r), 'Duplicate of ' + r.date);
  },

  // Non-blocking sanity checks; returns a list of messages.
  checkEntry(r) {
    const w = [];
    const t = r.total_time || 0, eps = 0.05;
    const today = ymd(new Date());
    if (r.date > today) w.push('Date is in the future.');
    if (t > 24) w.push('Total time is over 24 hours.');
    if ((r.pic || 0) + (r.sic || 0) > t + eps) w.push('PIC + SIC (' + fmtNum((r.pic || 0) + (r.sic || 0)) + ') is more than total time (' + fmtNum(t) + ').');
    ['multi_engine', 'single_engine', 'jet', 'turbo_prop', 'cross_country', 'night', 'actual_inst', 'over_12500', 'b737_total', 'c130_total', 'bae146_total']
      .forEach(k => { if ((r[k] || 0) > t + eps) w.push(FIELD_LABEL[k] + ' (' + fmtNum(r[k]) + ') is more than total time.'); });
    if ((r.b737_pic || 0) > (r.b737_total || 0) + eps) w.push('B737 PIC is more than B737 Total.');
    if ((r.c130_pic || 0) > (r.c130_total || 0) + eps) w.push('C130 PIC is more than C130 Total.');
    return w;
  },

  showWarnings(list) {
    const el = this.$('entry-warn');
    el.innerHTML = '<b>Check before saving:</b><ul>' + list.map(m => '<li>' + escapeHtml(m) + '</li>').join('') + '</ul><div class="small">Fix the numbers, or press Save again to keep them as they are.</div>';
    el.hidden = false;
    this.$('btn-entry-save').textContent = 'Save anyway';
    this.warned = true;
  },

  clearWarnings() {
    if (!this.warned && this.$('entry-warn').hidden) return;
    this.$('entry-warn').hidden = true;
    this.$('btn-entry-save').textContent = 'Save';
    this.warned = false;
  },

  readForm() {
    const r = {};
    FIELDS.forEach(f => {
      const el = this.$('inp-' + f.key);
      if (!el) return;
      r[f.key] = f.type === 'num' ? (parseFloat(el.value) || 0) : el.value.trim();
    });
    return r;
  },

  openAdd(seed, meta) {
    this.editingId = null;
    this.seed = seed || null;
    this.buildForm(seed || { date: ymd(new Date()) });
    this.showPanel('Add Entry', meta || '', false);
  },

  openEdit(id) {
    const r = Data.get(id);
    if (!r) return;
    this.editingId = id;
    this.seed = null;
    this.buildForm(r);
    this.showPanel('Edit Entry', (r.source || '') + (r.updated_at ? ' · updated ' + new Date(r.updated_at).toLocaleString() : ''), true);
  },

  onTailInput() {
    const tail = this.$('inp-tail_number').value.trim();
    if (TAIL_MAP[tail]) this.$('inp-aircraft').value = TAIL_MAP[tail];
  },

  async rememberTail(tail, aircraft) {
    if (!tail || !aircraft) return;
    if (TAIL_MAP[tail] === aircraft) return;
    TAIL_MAP[tail] = aircraft;
    this.userTailMap[tail] = aircraft;
    try { await Data.setSetting('tail_map', this.userTailMap); } catch (e) { console.warn(e); }
  },

  async saveEntry() {
    const form = this.readForm();
    if (!form.date) { App.toast('Date is required', 'error'); this.$('inp-date').focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { App.toast('Date must be YYYY-MM-DD', 'error'); return; }
    let r;
    if (this.editingId) {
      r = Object.assign({}, Data.get(this.editingId), form); // fields absent from the form keep their values
    } else {
      r = Object.assign(normalizeFields(this.seed || {}), form); // a duplicate keeps fields not shown in the form
    }
    // auto fields with no box on screen (e.g. C130 SIC, BAe146) still follow the rules
    const exp = this.readAutoInputs();
    this.autoKeys.forEach(k => { if (!this.$('inp-' + k)) r[k] = exp[k]; });
    if (!this.warned) {
      const warnings = this.checkEntry(r);
      if (warnings.length) { this.showWarnings(warnings); return; }
    }
    const btn = this.$('btn-entry-save');
    btn.disabled = true;
    try {
      await this.rememberTail(r.tail_number, r.aircraft);
      if (this.editingId) { await Data.update(this.editingId, r); App.toast('Entry updated'); }
      else { await Data.add(r, 'manual'); App.toast('Entry added: ' + r.date + ' ' + r.tail_number + ' ' + fmtNum(r.total_time) + ' h'); }
      this.closePanel();
      App.refresh();
    } catch (e) {
      App.toast('Save failed: ' + e.message, 'error');
    } finally { btn.disabled = false; }
  },

  async deleteEntry() {
    if (!this.editingId) return;
    const r = Data.get(this.editingId);
    if (!confirm('Delete entry: ' + r.date + ' | ' + r.tail_number + ' ' + r.aircraft + ' | ' + r.total_time + 'h?')) return;
    try {
      await Data.remove(this.editingId);
      this.closePanel();
      App.toast('Entry deleted');
      App.refresh();
    } catch (e) { App.toast('Delete failed: ' + e.message, 'error'); }
  },

  async showHistory() {
    if (!this.editingId) return;
    const body = this.$('history-body');
    body.innerHTML = '<div class="muted">Loading…</div>';
    App.openModal('history-modal');
    let items = [];
    try { items = await Data.history(this.editingId); } catch (e) { body.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>'; return; }
    if (!items.length) { body.innerHTML = '<div class="muted">No recorded changes (original historical entry).</div>'; return; }
    body.innerHTML = items.slice().reverse().map(h => {
      let diff = '';
      if (h.action === 'update' && h.before && h.after) {
        FIELDS.forEach(f => {
          const a = h.before[f.key], b = h.after[f.key];
          if (String(a) !== String(b)) diff += '<span class="k">' + escapeHtml(f.label) + '</span><span class="old">' + escapeHtml(a) + '</span><span class="new">' + escapeHtml(b) + '</span>';
        });
        if (!diff) diff = '<span class="muted">(no field changes)</span>';
        diff = '<div class="history-diff">' + diff + '</div>';
      }
      return '<div class="history-item"><div><b>' + escapeHtml(h.action) + '</b> <span class="when">' + new Date(h.changed_at).toLocaleString() + '</span></div>' + diff + '</div>';
    }).join('');
  }
};

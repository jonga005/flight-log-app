'use strict';
// Log Book tab: filters, sortable table with totals, stat cards, currency
// panel, column visibility, and the add/edit/delete entry modal.
const Logbook = {
  sortCol: 'date',
  sortDir: 'desc',
  page: 0,
  perPage: 50,
  hiddenCols: [],
  editingId: null,
  showAllFields: false,
  userTailMap: {},

  $(id) { return document.getElementById(id); },

  // ---- init ------------------------------------------------------------
  init() {
    this.hiddenCols = Data.getSetting('hiddenCols', []).slice();
    this.perPage = Data.getSetting('perPage', 50);
    this.userTailMap = Object.assign({}, Data.getSetting('tail_map', {}));
    Object.assign(TAIL_MAP, this.userTailMap);

    this.populateDropdowns();
    this.renderColPanel();

    // filters
    this.$('btn-filter').addEventListener('click', () => this.applyFilters());
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

    // table interactions (delegated)
    const wrap = this.$('table-wrap');
    wrap.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (th) { this.setSort(th.dataset.sort); return; }
      const btn = e.target.closest('button[data-edit]');
      if (btn) { this.openEdit(btn.dataset.edit); }
    });
    wrap.addEventListener('dblclick', e => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) this.openEdit(tr.dataset.id);
    });
    ['pagination-top', 'pagination-bottom'].forEach(id => {
      this.$(id).addEventListener('click', e => {
        const b = e.target.closest('button[data-page]');
        if (!b || b.disabled) return;
        const total = this.totalPages();
        const a = b.dataset.page;
        if (a === 'first') this.page = 0;
        else if (a === 'prev') this.page = Math.max(0, this.page - 1);
        else if (a === 'next') this.page = Math.min(total - 1, this.page + 1);
        else if (a === 'last') this.page = Math.max(0, total - 1);
        this.renderTable();
      });
      this.$(id).addEventListener('change', e => {
        if (e.target.matches('select[data-perpage]')) {
          this.perPage = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
          this.page = 0;
          Data.setSetting('perPage', this.perPage);
          this.renderTable();
        }
      });
    });

    // entry modal
    this.$('btn-entry-save').addEventListener('click', () => this.saveEntry());
    this.$('btn-entry-cancel').addEventListener('click', () => App.closeModal('modal'));
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
      if (e.target.id === 'inp-tail_number') this.onTailInput();
    });
    this.$('modal').addEventListener('click', e => { if (e.target.id === 'modal') App.closeModal('modal'); });
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
    fill('f-aircraft', [...new Set(all.map(r => r.aircraft).filter(Boolean))].sort(), 'All');
    fill('f-tail', [...new Set(all.map(r => r.tail_number).filter(Boolean))].sort(), 'All');
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
    this.page = 0;
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

  totalPages() {
    const n = App.state.filtered.length;
    if (this.perPage === 'all') return n ? 1 : 0;
    return Math.ceil(n / this.perPage);
  },

  renderTable() {
    const data = App.state.filtered;
    const visCols = this.visibleFields().filter(f => f.key !== 'notes');
    const per = this.perPage === 'all' ? Math.max(1, data.length) : this.perPage;
    const totalPages = this.totalPages();
    if (this.page > totalPages - 1) this.page = Math.max(0, totalPages - 1);
    const start = this.page * per;
    const end = Math.min(start + per, data.length);
    const rows = data.slice(start, end);

    let html = '<table class="log"><thead><tr><th style="width:36px">#</th>';
    visCols.forEach(f => {
      const cls = (this.sortCol === f.key ? (this.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : '') + (f.type === 'num' ? ' num' : '');
      html += '<th class="' + cls + '" data-sort="' + f.key + '">' + escapeHtml(f.label) + '</th>';
    });
    html += '<th data-sort="notes">Notes</th><th></th></tr></thead><tbody>';

    rows.forEach((r, i) => {
      html += '<tr data-id="' + escapeHtml(r.id) + '" title="Double-click to edit"><td class="num muted">' + (start + i + 1) + '</td>';
      visCols.forEach(f => {
        if (f.type === 'num') {
          const v = r[f.key];
          html += '<td class="num' + (v === 0 ? ' zero' : '') + '">' + fmtNum(v) + '</td>';
        } else {
          html += '<td>' + escapeHtml(r[f.key]) + '</td>';
        }
      });
      const notes = r.notes ? r.notes.substring(0, 30) + (r.notes.length > 30 ? '…' : '') : '';
      html += '<td class="notes-cell" title="' + escapeHtml(r.notes || '') + '">' + escapeHtml(notes) +
        (r.source && r.source !== 'historical' ? '<span class="source-tag">' + escapeHtml(r.source) + '</span>' : '') + '</td>';
      html += '<td><button class="btn btn-sm btn-secondary" data-edit="' + escapeHtml(r.id) + '">Edit</button></td></tr>';
    });
    html += '</tbody>';

    // totals rows (page and whole filtered set), like the bottom of a paper log page
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
      return h + '<td></td><td></td></tr>';
    };
    html += '<tfoot>';
    if (this.perPage !== 'all' && data.length > per) html += totalsRow('Page', rows, 'page-totals');
    html += totalsRow('Total', data, 'all-totals');
    html += '</tfoot></table>';
    this.$('table-wrap').innerHTML = html;

    const opt = v => '<option value="' + v + '"' + (String(this.perPage) === String(v) ? ' selected' : '') + '>' + v + '</option>';
    const pag = '<span>Showing ' + (data.length ? start + 1 : 0) + '–' + end + ' of <b>' + data.length + '</b> entries</span>' +
      '<div class="pager">' +
      '<label class="small">Per page <select data-perpage>' + opt(50) + opt(100) + opt(200) + opt('all') + '</select></label>' +
      '<button class="btn btn-sm btn-secondary" data-page="first"' + (this.page === 0 ? ' disabled' : '') + '>&#10094;&#10094;</button>' +
      '<button class="btn btn-sm btn-secondary" data-page="prev"' + (this.page === 0 ? ' disabled' : '') + '>&#10094;</button>' +
      '<span>Page ' + (totalPages ? this.page + 1 : 0) + ' of ' + totalPages + '</span>' +
      '<button class="btn btn-sm btn-secondary" data-page="next"' + (this.page >= totalPages - 1 ? ' disabled' : '') + '>&#10095;</button>' +
      '<button class="btn btn-sm btn-secondary" data-page="last"' + (this.page >= totalPages - 1 ? ' disabled' : '') + '>&#10095;&#10095;</button>' +
      '</div>';
    this.$('pagination-top').innerHTML = pag;
    this.$('pagination-bottom').innerHTML = pag;
  },

  renderStats() {
    const d = App.state.filtered;
    const items = [
      { key: 'total_time', label: 'Total Time', value: sumKey(d, 'total_time').toFixed(1), color: 'var(--accent2)' },
      { key: 'pic', label: 'PIC', value: sumKey(d, 'pic').toFixed(1), color: 'var(--green)' },
      { key: 'sic', label: 'SIC', value: sumKey(d, 'sic').toFixed(1), color: 'var(--orange)' },
      { key: 'night', label: 'Night', value: sumKey(d, 'night').toFixed(1), color: 'var(--purple)' },
      { key: 'cross_country', label: 'Cross Country', value: sumKey(d, 'cross_country').toFixed(1), color: 'var(--accent2)' },
      { key: 'actual_inst', label: 'Act. Instrument', value: sumKey(d, 'actual_inst').toFixed(1), color: 'var(--orange)' },
      { key: 'entries', label: 'Entries', value: d.length, color: 'var(--text)' },
      { key: 'landings', label: 'Landings', value: (sumKey(d, 'day_landings') + sumKey(d, 'night_landings')).toFixed(0), color: 'var(--green)' }
    ];
    this.$('stats').innerHTML = items.map(i =>
      '<div class="stat-card" id="stat-' + i.key + '" data-value="' + i.value + '"><div class="label">' + i.label + '</div><div class="value" style="color:' + i.color + '">' + Number(i.value).toLocaleString() + '</div></div>'
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
    const item = (label, value, id) => '<div class="cur-item" id="cur-' + id + '" data-value="' + value + '"><div class="cur-label">' + label + '</div><div class="cur-value">' + value + '</div></div>';
    this.$('currency').innerHTML =
      '<div class="cur-title">Currency (as of today, all entries)</div>' +
      item('Ldg 90d day / night', c.dayLandings90 + ' / ' + c.nightLandings90, 'ldg90') +
      item('Night ldg 90d', c.nightLandings90, 'nldg90') +
      item('Appr 6 mo', c.approaches6mo, 'appr6') +
      item('Hrs 12 mo', c.hours12mo.toFixed(1), 'hrs12') +
      item('Hrs 90d', c.hours90d.toFixed(1), 'hrs90') +
      item('Hrs 30d', c.hours30d.toFixed(1), 'hrs30');
  },

  // ---- entry modal -------------------------------------------------------
  formFieldList() {
    const nums = this.showAllFields ? NUM_FIELDS : NUM_FIELDS.filter(f => this.isColVisible(f.key));
    return nums;
  },

  buildForm(values) {
    values = values || {};
    const tails = [...new Set(App.state.all.map(r => r.tail_number).filter(Boolean))].sort();
    const val = k => escapeHtml(values[k] === undefined || values[k] === null ? '' : values[k]);
    const numVal = k => (values[k] ? escapeHtml(values[k]) : '');
    let html = '';
    html += '<div class="form-group"><label>Date</label><input type="date" id="inp-date" value="' + val('date') + '" required></div>';
    html += '<div class="form-group"><label>Tail #</label><input type="text" id="inp-tail_number" list="tail-list" value="' + val('tail_number') + '"><datalist id="tail-list">' + tails.map(t => '<option value="' + escapeHtml(t) + '">').join('') + '</datalist></div>';
    html += '<div class="form-group"><label>Aircraft <span class="hint">(auto from Tail #)</span></label><input type="text" id="inp-aircraft" value="' + val('aircraft') + '"></div>';
    html += '<div class="form-group"><label>From</label><input type="text" id="inp-route_from" value="' + val('route_from') + '"></div>';
    html += '<div class="form-group"><label>To</label><input type="text" id="inp-route_to" value="' + val('route_to') + '"></div>';
    this.formFieldList().forEach(f => {
      html += '<div class="form-group"><label>' + escapeHtml(f.label) + '</label><input type="text" id="inp-' + f.key + '" inputmode="decimal" value="' + numVal(f.key) + '"></div>';
    });
    html += '<div class="form-group span-all"><label>Notes</label><textarea id="inp-notes">' + val('notes') + '</textarea></div>';
    this.$('entry-form').innerHTML = html;
    this.$('btn-entry-allfields').textContent = this.showAllFields ? 'Show visible fields only' : 'Show all fields';
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

  openAdd() {
    this.editingId = null;
    this.$('modal-title').textContent = 'Add Entry';
    this.$('entry-meta').textContent = '';
    this.$('btn-entry-delete').hidden = true;
    this.$('btn-entry-history').hidden = true;
    this.buildForm({ date: ymd(new Date()) });
    App.openModal('modal');
    this.$('inp-date').focus();
  },

  openEdit(id) {
    const r = Data.get(id);
    if (!r) return;
    this.editingId = id;
    this.$('modal-title').textContent = 'Edit Entry';
    this.$('entry-meta').textContent = (r.source || '') + (r.updated_at ? ' · updated ' + new Date(r.updated_at).toLocaleString() : '');
    this.$('btn-entry-delete').hidden = false;
    this.$('btn-entry-history').hidden = false;
    this.buildForm(r);
    App.openModal('modal');
    this.$('inp-date').focus();
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
      r = Object.assign(normalizeFields({}), form);
    }
    const btn = this.$('btn-entry-save');
    btn.disabled = true;
    try {
      await this.rememberTail(r.tail_number, r.aircraft);
      if (this.editingId) { await Data.update(this.editingId, r); App.toast('Entry updated'); }
      else { await Data.add(r, 'manual'); App.toast('Entry added: ' + r.date + ' ' + r.tail_number + ' ' + fmtNum(r.total_time) + ' h'); }
      App.closeModal('modal');
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
      App.closeModal('modal');
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

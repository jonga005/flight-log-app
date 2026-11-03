'use strict';
// Import of Coulson per-leg logbook exports (XLSX/XLS/CSV): group legs by
// day, build one logbook entry per day, flag duplicates, preview, confirm.
// The pure functions (detectColumns, toDateStr, groupByDay, buildEntries,
// flagDupes) are exercised by tests/run_tests.html.
const ImportMod = {
  rows: null,
  sheetName: '',
  colMap: null,
  entries: [],

  $(id) { return document.getElementById(id); },

  init() {
    this.$('import-file').addEventListener('change', e => this.onFile(e.target));
    this.$('import-pilot-name').addEventListener('change', () => this.process());
    this.$('import-aircraft-override').addEventListener('change', () => this.process());
    this.$('btn-import-cancel').addEventListener('click', () => this.close());
    this.$('btn-import-confirm').addEventListener('click', () => this.confirm());
    this.$('import-modal').addEventListener('click', e => { if (e.target.id === 'import-modal') this.close(); });
  },

  open() {
    this.rows = null; this.entries = []; this.colMap = null;
    this.$('import-file').value = '';
    this.setStatus('');
    this.$('import-options').hidden = true;
    this.$('import-preview').hidden = true;
    this.$('btn-import-confirm').hidden = true;
    App.openModal('import-modal');
  },
  close() { App.closeModal('import-modal'); },

  setStatus(msg, isError) {
    const s = this.$('import-status');
    s.textContent = msg;
    s.style.color = isError ? 'var(--red)' : '';
  },

  onFile(input) {
    const file = input.files[0];
    if (!file) return;
    this.setStatus('Reading file…');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = this.readWorkbook(new Uint8Array(e.target.result));
        this.rows = parsed.rows; this.sheetName = parsed.sheetName;
        if (!this.rows.length) { this.setStatus('No data rows found.', true); return; }
        this.colMap = this.detectColumns(Object.keys(this.rows[0]));
        if (!this.colMap.date) { this.setStatus('Could not find date column.', true); return; }
        this.setStatus('Found ' + this.rows.length + ' legs in sheet "' + this.sheetName + '".');
        this.$('import-options').hidden = false;
        this.process();
      } catch (err) {
        this.setStatus('Error parsing file: ' + err.message, true);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // Pure: bytes -> { rows, sheetName }. Picks the sheet whose A1 is 'date'.
  readWorkbook(bytes) {
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    let sheet = null, sheetName = '';
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      const a1 = ws['A1'];
      if (a1 && String(a1.v).toLowerCase() === 'date') { sheet = ws; sheetName = name; break; }
    }
    if (!sheet) { sheetName = workbook.SheetNames[0]; sheet = workbook.Sheets[sheetName]; }
    return { rows: XLSX.utils.sheet_to_json(sheet, { defval: '' }), sheetName };
  },

  detectColumns(headers) {
    const map = {};
    const lh = headers.map(h => ({ orig: h, low: String(h).toLowerCase().trim() }));
    const find = keys => {
      for (const k of keys) { const m = lh.find(h => h.low === k || h.low.includes(k)); if (m) return m.orig; }
      return null;
    };
    map.date = find(['date']);
    map.reg = find(['reg', 'n#', 'registration']);
    map.model = find(['model', 'type']);
    map.make = find(['make', 'manufacturer']);
    map.callsign = find(['callsign', 'call_sign', 'tail']);
    map.depart = find(['depart', 'from', 'departure', 'origin']);
    map.arrive = find(['arrive', 'to', 'arrival', 'dest', 'destination']);
    map.flight_time = find(['flight_time', 'flight time', 'flt_time']);
    map.block_time = find(['block_time', 'block time', 'blk_time']);
    map.drops = find(['drops', 'drop']);
    map.pic_name = find(['pic', 'captain', 'pilot in command']);
    map.sic_name = find(['sic', 'first officer', 'copilot', 'co-pilot']);
    map.task = find(['task', 'mission', 'fire', 'remarks']);
    return map;
  },

  // Local-date string for a cell value (Date from Excel, or text). Never uses
  // toISOString, which would shift Excel dates by the UTC offset.
  toDateStr(val) {
    if (!val && val !== 0) return null;
    let d;
    if (val instanceof Date) d = val;
    else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim();
    else d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return ymd(d);
  },

  groupByDay(rows, colMap) {
    const dayGroups = {};
    rows.forEach(row => {
      const ds = this.toDateStr(row[colMap.date]);
      if (!ds) return;
      if (!dayGroups[ds]) dayGroups[ds] = [];
      dayGroups[ds].push(row);
    });
    return dayGroups;
  },

  inferAircraft(model, tailNum, acOverride) {
    if (acOverride) return acOverride;
    const m = model.toLowerCase();
    if (model.includes('737')) return 'B733';
    if (m.includes('lc-130') || m.includes('c-130') || m.includes('hercules')) return 'LC-130';
    if (m.includes('l-382') || m.includes('l382')) return 'L382G';
    if (m.includes('rj85') || m.includes('146')) return 'B462';
    if (m.includes('ce-550') || m.includes('c550') || m.includes('citation')) return 'CE-550';
    if (m.includes('ce-560') || m.includes('c560')) return 'CE-560';
    if (m.includes('p2v')) return 'L-P2V-7';
    if (TAIL_MAP[tailNum]) return TAIL_MAP[tailNum];
    return model;
  },

  // Pure: dayGroups -> array of logbook entries (original processImport).
  buildEntries(dayGroups, colMap, pilotName, acOverride) {
    const out = [];
    pilotName = (pilotName || '').trim().toLowerCase();
    acOverride = (acOverride || '').trim();
    Object.keys(dayGroups).sort().forEach(dateStr => {
      const legs = dayGroups[dateStr];
      if (!legs.length) return;

      // Route chain: first departure, then each arrival
      const routeParts = [];
      legs.forEach((leg, i) => {
        const dep = String(leg[colMap.depart] || '').trim().toUpperCase();
        const arr = String(leg[colMap.arrive] || '').trim().toUpperCase();
        if (i === 0 && dep) routeParts.push(dep);
        if (arr) routeParts.push(arr);
      });
      // Collapse runs of 3+ identical airports to 2
      const collapsed = [];
      routeParts.forEach(p => {
        const len = collapsed.length;
        if (len >= 2 && collapsed[len - 1] === p && collapsed[len - 2] === p) return;
        collapsed.push(p);
      });
      let routeFrom = '', routeTo = '';
      if (collapsed.length <= 2) { routeFrom = collapsed[0] || ''; routeTo = collapsed[1] || routeFrom; }
      else routeFrom = collapsed.join('-');

      let totalBlockTime = 0, totalDrops = 0, xcBlockTime = 0;
      legs.forEach(leg => {
        const bt = parseFloat(leg[colMap.block_time]) || 0;
        totalBlockTime += bt;
        totalDrops += parseInt(leg[colMap.drops], 10) || 0;
        if (bt > 0.6) xcBlockTime += bt;
      });
      const t = Math.round(totalBlockTime * 10) / 10;
      const xcTime = Math.round(xcBlockTime * 10) / 10;

      const firstLeg = legs[0];
      const tailNum = String(firstLeg[colMap.callsign] || '').trim();
      const model = String(firstLeg[colMap.model] || '').trim();
      const aircraft = this.inferAircraft(model, tailNum, acOverride);

      let isPIC = false, isSIC = false;
      if (pilotName && colMap.pic_name) {
        isPIC = String(firstLeg[colMap.pic_name] || '').toLowerCase().includes(pilotName);
        isSIC = String(firstLeg[colMap.sic_name] || '').toLowerCase().includes(pilotName);
      }

      const tasks = [...new Set(legs.map(l => String(l[colMap.task] || '').trim()).filter(Boolean))];
      const notes = tasks.join('; ');

      out.push(Object.assign({
        date: dateStr, tail_number: tailNum, aircraft, route_from: routeFrom, route_to: routeTo, total_time: t,
        actual_inst: 0, sim_inst: 0, approaches: 0,
        night: 0, night_landings: 0, day_landings: legs.length,
        cross_country: xcTime
      }, deriveFromType(aircraft, t, isPIC, isSIC), { drops: totalDrops, notes }));
    });
    return out;
  },

  // Pure: mark entries that already exist. Duplicate = same date AND
  // (same tail number OR total time within 0.5 h). Returns dupe count.
  flagDupes(entries, existing) {
    let n = 0;
    entries.forEach(entry => {
      entry._isDupe = existing.some(r => {
        if (r.date !== entry.date) return false;
        if (r.tail_number && entry.tail_number && r.tail_number === entry.tail_number) return true;
        if (Math.abs((r.total_time || 0) - (entry.total_time || 0)) < 0.5) return true;
        return false;
      });
      if (entry._isDupe) n++;
    });
    return n;
  },

  process() {
    if (!this.rows || !this.colMap) return;
    const pilotName = this.$('import-pilot-name').value;
    const acOverride = this.$('import-aircraft-override').value;
    this.entries = this.buildEntries(this.groupByDay(this.rows, this.colMap), this.colMap, pilotName, acOverride);
    this.renderPreview();
  },

  renderPreview() {
    const entries = this.entries;
    if (!entries.length) { this.setStatus('No entries to import.', true); this.$('import-preview').hidden = true; return; }
    this.$('import-preview').hidden = false;
    this.$('btn-import-confirm').hidden = false;
    const dupeCount = this.flagDupes(entries, App.state.all);

    const cols = ['date', 'tail_number', 'aircraft', 'route_from', 'route_to', 'total_time', 'pic', 'sic', 'drops', 'day_landings', 'notes'];
    const labels = { date: 'Date', tail_number: 'Tail #', aircraft: 'Aircraft', route_from: 'From', route_to: 'To', total_time: 'Total', pic: 'PIC', sic: 'SIC', drops: 'Drops', day_landings: 'Ldgs', notes: 'Notes' };
    let html = '<thead><tr><th>Status</th>' + cols.map(c => '<th>' + labels[c] + '</th>').join('') + '</tr></thead><tbody>';
    entries.forEach(e => {
      html += '<tr class="' + (e._isDupe ? 'dupe' : '') + '"><td class="' + (e._isDupe ? 'status-skip' : 'status-new') + '">' + (e._isDupe ? 'SKIP' : 'NEW') + '</td>';
      cols.forEach(c => {
        const v = e[c];
        if (typeof v === 'number') html += '<td class="num">' + fmtNum(v) + '</td>';
        else html += '<td>' + escapeHtml(c === 'notes' ? (v || '').substring(0, 25) : v) + '</td>';
      });
      html += '</tr>';
    });
    this.$('import-table').innerHTML = html + '</tbody>';

    const fresh = entries.filter(e => !e._isDupe);
    const hrs = fresh.reduce((s, e) => s + e.total_time, 0);
    const drops = fresh.reduce((s, e) => s + e.drops, 0);
    this.$('import-count').textContent = fresh.length;
    let summary = '<strong>' + fresh.length + '</strong> new entries to import | <strong>' + hrs.toFixed(1) + '</strong> hours | <strong>' + drops + '</strong> drops';
    if (dupeCount > 0) summary += '<br>' + dupeCount + ' duplicate(s) will be skipped (matching date + tail # or similar time)';
    if (!fresh.length) {
      this.$('btn-import-confirm').hidden = true;
      summary += '<br><strong style="color:var(--orange)">All entries already exist in your log. Nothing to import.</strong>';
    }
    this.$('import-summary').innerHTML = summary;
  },

  async confirm() {
    const fresh = this.entries.filter(e => !e._isDupe).map(e => { const c = Object.assign({}, e); delete c._isDupe; return c; });
    if (!fresh.length) return;
    const btn = this.$('btn-import-confirm');
    btn.disabled = true;
    try {
      await Data.addMany(fresh, 'import');
      // remember tail -> aircraft mappings
      for (const e of this.entries) { if (e.tail_number && e.aircraft) await Logbook.rememberTail(e.tail_number, e.aircraft); }
      const hrs = fresh.reduce((s, e) => s + e.total_time, 0);
      this.close();
      App.refresh();
      App.toast('Imported ' + fresh.length + ' entries (' + hrs.toFixed(1) + ' hours).');
    } catch (e) {
      App.toast('Import failed: ' + e.message, 'error');
    } finally { btn.disabled = false; }
  }
};

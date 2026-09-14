'use strict';
// Export: CSV of the visible/filtered table, JSON and XLSX of the full logbook.
const ExportMod = {
  download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  stamp() { return ymd(new Date()); },

  csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },

  // rows: entries; fields: FIELDS subset (visible columns)
  csvText(rows, fields) {
    const lines = [fields.map(f => this.csvCell(f.label)).join(',')];
    rows.forEach(r => lines.push(fields.map(f => this.csvCell(r[f.key])).join(',')));
    return lines.join('\n');
  },

  csv(rows, fields) {
    const blob = new Blob([this.csvText(rows, fields)], { type: 'text/csv;charset=utf-8' });
    this.download(blob, 'flight_log_export_' + this.stamp() + '.csv');
  },

  json() {
    const payload = Data.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    this.download(blob, 'flight_log_full_' + this.stamp() + '.json');
  },

  xlsx() {
    if (typeof XLSX === 'undefined') { App.toast('XLSX library not loaded', 'error'); return; }
    const payload = Data.exportAll();
    const header = FIELD_KEYS.concat(['id', 'source', 'created_at', 'updated_at']);
    const aoa = [header];
    payload.rows.forEach(r => aoa.push(header.map(k => r[k] === undefined ? '' : r[k])));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Logbook');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    this.download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'flight_log_full_' + this.stamp() + '.xlsx');
  }
};

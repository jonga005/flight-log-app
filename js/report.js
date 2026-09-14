'use strict';
// Report tab: date range + selectable numeric columns, printable HTML with
// period totals, grand totals and the signature block.
const Report = {
  hidden: [],
  PILOT: 'John H Gallaher',

  $(id) { return document.getElementById(id); },

  init() {
    this.hidden = Data.getSetting('reportHiddenCols', []).slice();
    if (window.APP_CONFIG && APP_CONFIG.pilotName) this.PILOT = APP_CONFIG.pilotName;
    this.renderColPanel();
    this.$('btn-report').addEventListener('click', () => this.generate());
    this.$('btn-print').addEventListener('click', () => this.print());
    this.$('rpt-col-toggle').addEventListener('click', () => {
      const b = this.$('rpt-col-body');
      b.hidden = !b.hidden;
      this.$('rpt-col-toggle').innerHTML = (b.hidden ? '&#9654;' : '&#9660;') + ' Select report columns';
    });
    this.$('rpt-col-grid').addEventListener('click', e => {
      const t = e.target.closest('.col-toggle');
      if (t) this.toggleCol(t.dataset.key);
    });
    this.$('btn-rpt-all').addEventListener('click', () => { this.hidden = []; this.persist(); });
    this.$('btn-rpt-none').addEventListener('click', () => { this.hidden = FIELDS.filter(f => f.hideable).map(f => f.key); this.persist(); });
  },

  render() { Signature.showPreview(); },

  isVisible(key) { return this.hidden.indexOf(key) < 0; },
  toggleCol(key) {
    if (this.hidden.indexOf(key) >= 0) this.hidden = this.hidden.filter(k => k !== key);
    else this.hidden.push(key);
    this.persist();
  },
  persist() {
    Data.setSetting('reportHiddenCols', this.hidden.slice());
    this.renderColPanel();
  },
  renderColPanel() {
    this.$('rpt-col-grid').innerHTML = FIELDS.filter(f => f.hideable || f.key === 'total_time' || f.key === 'notes').map(f => {
      const vis = this.isVisible(f.key);
      return '<div class="col-toggle ' + (vis ? '' : 'hidden-col') + '" data-key="' + f.key + '">' + (vis ? '&#10003; ' : '') + escapeHtml(f.label) + '</div>';
    }).join('');
  },
  visibleNumCols() { return FIELDS.filter(f => f.type === 'num' && this.isVisible(f.key)); },

  generate() {
    const df = this.$('r-date-from').value, dt = this.$('r-date-to').value;
    if (!df || !dt) { App.toast('Please select both From and To dates.', 'error'); return; }
    const numCols = this.visibleNumCols();
    if (!numCols.length) { App.toast('Please select at least one column for the report.', 'error'); return; }
    const all = App.state.all;
    const data = all.filter(r => r.date >= df && r.date <= dt);
    const html = this.buildReportHTML(data, numCols, df, dt, all, Signature.get(), this.isVisible('notes'));
    this.$('report-preview').innerHTML = '<div class="report-paper">' + html + '</div>';
    this.$('report-output').innerHTML = html;
  },

  // Pure: same layout as the original buildReportHTML.
  buildReportHTML(data, numCols, dateFrom, dateTo, allData, sigImg, showNotes) {
    const textCols = [{ key: 'date', label: 'Date' }, { key: 'tail_number', label: 'Tail #' }, { key: 'aircraft', label: 'Aircraft' }, { key: 'route_from', label: 'From' }, { key: 'route_to', label: 'To' }];
    const allCols = textCols.concat(numCols);
    const totals = {}, grand = {};
    numCols.forEach(f => { totals[f.key] = sumKey(data, f.key); grand[f.key] = sumKey(allData, f.key); });
    const th = (label, align) => '<th style="border:1px solid #999;padding:3px 4px;background:#e0e0e0;text-align:' + align + ';white-space:nowrap;font-size:7px;">' + escapeHtml(label) + '</th>';

    let html = '<div style="font-family:Arial,sans-serif;font-size:10px;color:#000;max-width:100%;">' +
      '<div style="text-align:center;margin-bottom:12px;">' +
      '<div style="font-size:14px;font-weight:bold;">Pilot Flight Log Report</div>' +
      '<div style="font-size:11px;">' + escapeHtml(this.PILOT) + '</div>' +
      '<div>Period: ' + escapeHtml(dateFrom) + ' to ' + escapeHtml(dateTo) + ' | Entries: ' + data.length + '</div></div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:8px;"><thead><tr>';
    allCols.forEach(c => { html += th(c.label, numCols.indexOf(c) >= 0 ? 'right' : 'left'); });
    if (showNotes) html += th('Notes', 'left');
    html += '</tr></thead><tbody>';

    data.forEach(r => {
      html += '<tr>';
      textCols.forEach(c => { html += '<td style="border:1px solid #ccc;padding:2px 4px;white-space:nowrap;">' + escapeHtml(r[c.key]) + '</td>'; });
      numCols.forEach(c => { html += '<td style="border:1px solid #ccc;padding:2px 4px;text-align:right;">' + fmtNum(r[c.key]) + '</td>'; });
      if (showNotes) html += '<td style="border:1px solid #ccc;padding:2px 4px;font-size:7px;">' + escapeHtml(r.notes ? r.notes.substring(0, 40) : '') + '</td>';
      html += '</tr>';
    });

    const totalsRow = (label, vals, bg) => {
      let h = '<tr style="font-weight:bold;background:' + bg + ';"><td colspan="' + textCols.length + '" style="border:1px solid #999;padding:3px 4px;text-align:right;">' + label + '</td>';
      numCols.forEach(c => { const v = vals[c.key]; h += '<td style="border:1px solid #999;padding:3px 4px;text-align:right;">' + (v ? v.toFixed(1) : '') + '</td>'; });
      if (showNotes) h += '<td style="border:1px solid #999;"></td>';
      return h + '</tr>';
    };
    html += totalsRow('PERIOD TOTALS', totals, '#f0f0f0');
    html += totalsRow('GRAND TOTALS', grand, '#d0d0d0');

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const sigHtml = sigImg ? '<img src="' + sigImg + '" style="height:40px;display:block;margin-bottom:2px;">' : '<div style="height:40px;"></div>';
    html += '</tbody></table>' +
      '<div style="margin-top:40px;font-size:10px;">' +
      '<div style="margin-bottom:30px;">I certify these are true and accurate copies of the original document:</div>' +
      '<div style="display:flex;gap:60px;align-items:flex-end;">' +
      '<div>' + sigHtml + '<div style="border-top:1px solid #000;width:250px;padding-top:4px;text-align:left;">' + escapeHtml(this.PILOT) + '</div></div>' +
      '<div><div style="margin-bottom:2px;">' + today + '</div><div style="border-top:1px solid #000;width:150px;padding-top:4px;">Date</div></div>' +
      '</div></div></div>';
    return html;
  },

  print() {
    const output = this.$('report-output').innerHTML;
    if (!output) { App.toast('Please generate a report first.', 'error'); return; }
    const win = window.open('', '_blank');
    if (!win) { App.toast('Pop-up blocked; allow pop-ups to print.', 'error'); return; }
    win.document.write('<!DOCTYPE html><html><head><title>Flight Log Report</title>' +
      '<style>@page{size:landscape;margin:0.5in;}body{font-family:Arial,sans-serif;margin:0;padding:0;}' +
      'table{page-break-inside:auto;}tr{page-break-inside:avoid;}</style></head>' +
      '<body>' + output + '<script>window.onload=function(){window.print();}<\/script></body></html>');
    win.document.close();
  }
};

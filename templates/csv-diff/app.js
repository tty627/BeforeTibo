/* BeforeTibo CSV Diff: standalone offline tool. No dependencies or network calls. */
(function () {
  'use strict';
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_ROWS = 20000;
  function parseCsv(input) {
    if (typeof input !== 'string') throw new Error('CSV input must be UTF-8 text.');
    if (new TextEncoder().encode(input).byteLength > MAX_BYTES) throw new Error('File exceeds the 5 MiB limit.');
    const text = input.startsWith('\uFEFF') ? input.slice(1) : input;
    if (!text) throw new Error('CSV is empty; a header row is required.');
    const records = [];
    let record = [], field = '', state = 'start', recordStarted = false;
    function finishField() { record.push(field); field = ''; state = 'start'; }
    function finishRecord() {
      finishField(); records.push(record); record = []; recordStarted = false;
      if (records.length > MAX_ROWS + 1) throw new Error('File exceeds the 20,000 data row limit.');
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (state === 'quoted') {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else state = 'closed'; }
        else field += ch;
        continue;
      }
      if (ch === ',') { finishField(); recordStarted = true; continue; }
      if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; finishRecord(); continue; }
      if (state === 'closed') throw new Error('Unexpected text after a quoted field.');
      if (ch === '"') { if (state !== 'start') throw new Error('Quote inside an unquoted field.'); state = 'quoted'; recordStarted = true; continue; }
      field += ch; state = 'unquoted'; recordStarted = true;
    }
    if (state === 'quoted') throw new Error('Unclosed quoted field.');
    if (recordStarted || record.length || field || state === 'closed') finishRecord();
    const columns = records.shift();
    if (!columns || columns.some(c => c === '')) throw new Error('Column names cannot be empty.');
    if (new Set(columns).size !== columns.length) throw new Error('Column names must be unique.');
    const rows = records.map((values, index) => {
      if (values.length !== columns.length) throw new Error('Data row ' + (index + 1) + ' has a different number of columns.');
      const row = Object.create(null);
      columns.forEach((name, i) => { row[name] = values[i]; });
      return row;
    });
    return { columns, rows };
  }
  function diffParsed(before, after, key) {
    if (!key || !before.columns.includes(key)) throw new Error('Select an explicit primary key column.');
    const afterColumns = new Set(after.columns);
    if (before.columns.length !== after.columns.length || before.columns.some(c => !afterColumns.has(c))) throw new Error('The files must contain the same column names (column order may differ).');
    function indexRows(rows, label) {
      const map = new Map();
      for (const row of rows) {
        const value = row[key];
        if (value === '') throw new Error(label + ' contains an empty primary key.');
        if (map.has(value)) throw new Error(label + ' contains a duplicate primary key.');
        map.set(value, row);
      }
      return map;
    }
    const previous = indexRows(before.rows, 'Before file'), current = indexRows(after.rows, 'After file');
    const added = [], removed = [], changed = [];
    let unchanged = 0;
    function ordered(row) { const result = Object.create(null); before.columns.forEach(c => { result[c] = row[c]; }); return result; }
    const keys = [...new Set([...previous.keys(), ...current.keys()])].sort();
    for (const value of keys) {
      const a = previous.get(value), b = current.get(value);
      if (!a) added.push(ordered(b));
      else if (!b) removed.push(ordered(a));
      else {
        const changed_columns = before.columns.filter(c => a[c] !== b[c]);
        if (changed_columns.length) changed.push({ key: value, before: ordered(a), after: ordered(b), changed_columns });
        else unchanged++;
      }
    }
    return { schema_version: '1.0', key_column: key, columns: [...before.columns], summary: { before_rows: before.rows.length, after_rows: after.rows.length, added: added.length, removed: removed.length, changed: changed.length, unchanged }, added, removed, changed };
  }
  function diffCsv(before, after, key) { return diffParsed(parseCsv(before), parseCsv(after), key); }
  globalThis.BeforeTiboCsv = Object.freeze({ parseCsv, diffCsv, limits: Object.freeze({ maxBytes: MAX_BYTES, maxRows: MAX_ROWS }) });
  if (typeof document === 'undefined') return;
  const byId = id => document.getElementById(id);
  const fields = { before: null, after: null }, generations = { before: 0, after: 0 };
  let result = null;
  const error = byId('error'), status = byId('status'), key = byId('key-column');
  function invalidate() { result = null; byId('export').disabled = true; byId('results').replaceChildren(); error.textContent = ''; }
  function feedback(message) { error.textContent = message; error.focus(); }
  function refreshKeys() {
    key.replaceChildren(new Option('Choose a primary key…', ''));
    if (fields.before && fields.after) fields.before.columns.forEach(column => key.add(new Option(column, column)));
    key.disabled = !(fields.before && fields.after);
    byId('compare').disabled = key.disabled;
  }
  for (const side of ['before', 'after']) byId(side + '-file').addEventListener('change', async event => {
    const generation = ++generations[side];
    invalidate(); fields[side] = null; refreshKeys();
    const file = event.target.files[0];
    if (!file) return;
    status.textContent = 'Reading ' + side + ' file…';
    try {
      if (file.size > MAX_BYTES) throw new Error('File exceeds the 5 MiB limit.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const parsed = parseCsv(text);
      if (generation !== generations[side]) return;
      fields[side] = parsed;
      byId(side + '-info').textContent = parsed.rows.length + ' rows · ' + parsed.columns.length + ' columns';
      status.textContent = fields.before && fields.after ? 'Files loaded. Choose the key used to match rows.' : 'Load the other file to continue.';
      refreshKeys();
    } catch (e) { if (generation === generations[side]) { feedback(e.message || 'Cannot read UTF-8 CSV.'); status.textContent = 'Input needs attention.'; } }
  });
  key.addEventListener('change', invalidate);
  function element(tag, text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
  function table(title, rows, columns) {
    const section = element('section'); section.append(element('h3', title));
    if (!rows.length) { section.append(element('p', 'No rows.')); return section; }
    const container = element('div'); container.className = 'table-scroll';
    const tableNode = element('table'), head = element('thead'), header = element('tr');
    columns.forEach(c => header.append(element('th', c))); head.append(header); tableNode.append(head);
    const body = element('tbody');
    for (const row of rows.slice(0, 500)) { const tr = element('tr'); columns.forEach(c => tr.append(element('td', row[c]))); body.append(tr); }
    tableNode.append(body); container.append(tableNode); section.append(container);
    if (rows.length > 500) section.append(element('p', 'Showing the first 500 rows. JSON export includes every difference.'));
    return section;
  }
  byId('compare').addEventListener('click', () => {
    invalidate();
    try {
      if (!fields.before || !fields.after) throw new Error('Load both files first.');
      result = diffParsed(fields.before, fields.after, key.value);
      const s = result.summary;
      status.textContent = s.added + ' added · ' + s.removed + ' removed · ' + s.changed + ' changed · ' + s.unchanged + ' unchanged';
      byId('results').append(table('Added', result.added, result.columns), table('Removed', result.removed, result.columns));
      const changes = element('section'); changes.append(element('h3', 'Changed'));
      if (!result.changed.length) changes.append(element('p', 'No rows.'));
      for (const change of result.changed.slice(0, 500)) {
        const group = element('div'); group.className = 'change'; group.append(element('h4', 'Key: ' + change.key));
        for (const c of change.changed_columns) { const p = element('p'); p.append(element('strong', c + ': '), element('span', change.before[c] + ' → ' + change.after[c])); group.append(p); }
        changes.append(group);
      }
      if (result.changed.length > 500) changes.append(element('p', 'Showing the first 500 changes. JSON export includes every difference.'));
      byId('results').append(changes); byId('export').disabled = false;
    } catch (e) { feedback(e.message); status.textContent = 'Comparison blocked. Fix the input and compare again.'; }
  });
  byId('export').addEventListener('click', () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = element('a'); anchor.href = url; anchor.download = 'csv-diff.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();

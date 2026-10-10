'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const converter = require('../converter.js');

test('parses JSON and reports line and column for malformed input', () => {
    assert.deepEqual(converter.parseJSON('{"ok":true}'), { ok: true });
    assert.throws(() => converter.parseJSON('{\n  "ok": }\n'), /line 2, column 9/);
});

test('detects root and common nested record sources', () => {
    const data = { status: 'ok', results: [{ id: 1 }], metadata: { page: 1 } };
    const sources = converter.discoverSources(data);
    assert.equal(sources[0].path, 'results');
    assert.deepEqual(converter.getSourceRecords(data, 'results'), [{ id: 1 }]);
    assert.deepEqual(converter.getSourceRecords([{ id: 2 }], ''), [{ id: 2 }]);
});

test('discovers nested fields and projects selected fields in source order', () => {
    const records = [{ id: 1, product: { title: 'A', price: 4 }, variants: [{ sku: 'X' }] }, { id: 2, product: { title: 'B' }, variants: [] }];
    const fields = converter.discoverFields(records);
    assert.deepEqual(fields.map(field => field.path), ['id', 'product.title', 'product.price', 'variants.0.sku']);
    const included = converter.effectiveFields(fields, ['product.title', 'id'], 'include', ['product.title', 'id']);
    assert.deepEqual(included.map(field => field.path), ['product.title', 'id']);
    assert.deepEqual(converter.effectiveFields(fields, ['id'], 'exclude').map(field => field.path), ['product.title', 'product.price', 'variants.0.sku']);
});

test('flattens nested fields and reconstructs nested JSON without mutating source', () => {
    const source = [{ id: 1, product: { title: 'A', price: 8 }, private: true }];
    const fields = converter.discoverFields(source).filter(field => field.path !== 'private');
    const flat = converter.buildRows(source, fields, { flatten: true });
    assert.deepEqual(flat.rows, [{ id: 1, 'product.title': 'A', 'product.price': 8 }]);
    const nested = converter.buildRows(source, fields, { flatten: false });
    assert.deepEqual(nested.rows, [{ id: 1, product: { title: 'A', price: 8 } }]);
    assert.deepEqual(source, [{ id: 1, product: { title: 'A', price: 8 }, private: true }]);
});

test('retains mixed null and nested array values without exposing array siblings', () => {
    const records = [
        { variants: [null, { sku: 'A', cost: 8 }] },
        { variants: [{ sku: 'B', cost: 9 }] }
    ];
    const fields = converter.discoverFields(records);
    assert.deepEqual(fields.map(field => field.path), ['variants.0', 'variants.1.sku', 'variants.1.cost', 'variants.0.sku', 'variants.0.cost']);
    const safeFields = fields.filter(field => field.path.endsWith('.sku'));
    const result = converter.buildRows(records, safeFields, { flatten: false });
    assert.deepEqual(result.rows, [{ variants: [null, { sku: 'A' }] }, { variants: [{ sku: 'B' }] }]);
});

test('filters nested records with AND, OR, numeric, date, null, and missing checks', () => {
    const records = [
        { item: { name: 'Alpine boot' }, price: 90, created: '2024-02-01', deleted: null },
        { item: { name: 'Trail shoe' }, price: 120, created: '2024-04-01' },
        { item: { name: 'Road boot' }, price: 160, created: 'invalid', deleted: false }
    ];
    const allConditions = [
        { field: 'item.name', operator: 'contains', value: 'boot' },
        { field: 'price', operator: 'range', min: '80', max: '150' }
    ];
    assert.deepEqual(converter.filterRecords(records, allConditions, 'and').map(row => row.price), [90]);
    assert.deepEqual(converter.filterRecords(records, allConditions, 'or').map(row => row.price), [90, 120, 160]);
    assert.deepEqual(converter.filterRecords(records, [{ field: 'deleted', operator: 'null' }]).map(row => row.price), [90, 120]);
    assert.deepEqual(converter.filterRecords(records, [{ field: 'deleted', operator: 'empty' }]).map(row => row.price), [90, 120]);
    assert.deepEqual(converter.filterRecords(records, [{ field: 'created', operator: 'after', value: '2024-03-01' }]).map(row => row.price), [120]);
    assert.deepEqual(converter.filterRecords(records, [{ field: 'price', operator: 'greater', value: 100 }], 'and', true).map(row => row.price), [90]);
    assert.equal(converter.filterRecords(records, [{ field: 'price', operator: 'greater', value: '' }]).length, records.length);
});

test('exports escaped CSV with delimiters, BOM, formula protection, and nested values', () => {
    const result = converter.toCSV([
        { name: 'A, "B"', note: 'line 1\nline 2', formula: '=1+1', nested: { x: 1 }, empty: null }
    ], ['name', 'note', 'formula', 'nested', 'empty'], {
        delimiter: ';', bom: true, protectFormulas: true, emptyValue: 'N/A'
    });
    assert.ok(result.startsWith('\uFEFFname;note;formula;nested;empty\r\n'));
    assert.ok(result.includes('"A, ""B"""'));
    assert.ok(result.includes('"line 1\nline 2"'));
    assert.ok(result.includes(";'=1+1;"));
    assert.ok(result.endsWith('"{""x"":1}";N/A'));
    assert.equal(converter.toCSV([{ amount: -4 }], ['amount'], { delimiter: ',' }), 'amount\r\n-4');
});

test('creates valid XML text with escaped values, arrays, nulls, and safe names', () => {
    const result = converter.toXML([{ 'bad key': 'A&B <C>', active: true, count: 4, values: ['x', 'y'], absent: null }], {
        root: 'export', item: 'row', declaration: true, pretty: false
    });
    assert.ok(result.startsWith('<?xml version="1.0" encoding="UTF-8"?><export>'));
    assert.ok(result.includes('<bad_key>A&amp;B &lt;C&gt;</bad_key>'));
    assert.ok(result.includes('<values><item>x</item><item>y</item></values>'));
    assert.ok(result.includes('<absent></absent>'));
    assert.ok(result.endsWith('</export>'));
    assert.equal(converter.validXmlName('records_2'), true);
    assert.equal(converter.validXmlName('2records'), false);
    assert.throws(() => converter.toXML([], { root: '2records' }), /Root element/);
});

test('handles inconsistent and empty records and de-duplicates output headers', () => {
    const records = [{ id: 1, name: 'A' }, { id: 2 }, {}];
    const fields = converter.discoverFields(records);
    assert.deepEqual(converter.buildRows(records, fields).rows, [{ id: 1, name: 'A' }, { id: 2, name: undefined }, { id: undefined, name: undefined }]);
    assert.deepEqual(converter.uniqueHeaders([{ path: 'a' }, { path: 'b' }, { path: 'c' }], { a: 'Value', b: 'Value', c: '' }), ['Value', 'Value_2', 'c']);
    assert.deepEqual(converter.filterRecords([], [{ field: 'x', operator: 'equals', value: 1 }]), []);
});

test('builds format-specific downloadable file metadata', () => {
    assert.deepEqual(converter.downloadDetails('x', 'excel-csv', 'report.csv'), {
        text: 'x', mimeType: 'text/csv;charset=utf-8', fileName: 'report.csv', encoding: 'utf-8'
    });
    assert.equal(converter.downloadDetails('x', 'xml', 'data.json').fileName, 'data.xml');
    assert.equal(converter.downloadDetails('x', 'tsv', 'safe/name').fileName, 'safe-name.tsv');
    assert.equal(converter.downloadDetails('x', 'csv', 'data', 'utf-16le').mimeType, 'text/csv;charset=utf-16le');
    assert.throws(() => converter.downloadDetails('', 'pdf', 'data'), /Unsupported output format/);
});

test('encodes UTF-16LE exports with a byte-order mark', () => {
    assert.deepEqual(Array.from(converter.encodeText('AΩ', 'utf-16le')), [255, 254, 65, 0, 169, 3]);
});

test('processes a large set of records with stable field discovery', () => {
    const records = Array.from({ length: 10000 }, (_, id) => ({ id, group: { index: id % 10 } }));
    const fields = converter.discoverFields(records);
    assert.deepEqual(fields.map(field => field.path), ['id', 'group.index']);
    assert.equal(converter.filterRecords(records, [{ field: 'id', operator: 'greater', value: 9990 }]).length, 9);
});

test('builds typed spreadsheet rows for XLSX export', () => {
    const records = [{ id: 1, ok: true, tags: ['a'], note: null }, { id: 2, ok: false, note: 'x' }];
    const fields = converter.discoverFields(records);
    const rows = converter.toSheetRows(records, { fields, csv: { emptyValue: '' } });
    assert.deepEqual(rows[0], fields.map(field => field.path));
    assert.equal(rows[1][0], 1);
    assert.equal(rows[1][1], true);
    assert.equal(rows[1][rows[0].indexOf('note')], null);
    assert.equal(converter.downloadDetails('', 'xlsx', 'report.xlsx').fileName, 'report.xlsx');
});

test('reads keys that contain literal dots', () => {
    const key = 'Metafield: custom.prd_slider_video [list.url]';
    const records = [{ ID: '1', [key]: '["https://a.mp4"]', meta: { 'a.b': 5 } }];
    const fields = converter.discoverFields(records);
    const field = fields.find(item => item.label === key);
    assert.ok(field, 'field discovered with its original name');
    assert.equal(converter.getPath(records[0], field.path), '["https://a.mp4"]');
    const csv = converter.serialize(records, 'csv', { fields });
    assert.match(csv.split('\r\n')[0], /"?Metafield: custom\.prd_slider_video \[list\.url\]"?/);
    assert.match(csv, /https:\/\/a\.mp4/);
    assert.match(csv.split('\r\n')[0], /meta\.a\.b/);
    assert.match(csv.split('\r\n')[1], /,5$/);
    const nested = JSON.parse(converter.serialize(records, 'json', { fields, flatten: false }));
    assert.deepEqual(nested[0], records[0]);
});

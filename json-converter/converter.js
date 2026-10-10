(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.JsonConverter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DEFAULT_SAMPLE = [
        {
            id: 101,
            name: 'Trail Runner',
            category: 'Footwear',
            price: 129.95,
            cost: 62,
            inventory: 24,
            internal_notes: 'Seasonal launch',
            details: { color: 'Slate', size: '42' },
            variants: [{ sku: 'TR-SLT-42', stock: 12 }, { sku: 'TR-SLT-43', stock: 12 }]
        },
        {
            id: 102,
            name: 'Field Jacket',
            category: 'Outerwear',
            price: 189,
            cost: 91,
            inventory: 8,
            internal_notes: 'Wholesale only',
            details: { color: 'Olive', size: 'M' },
            variants: [{ sku: 'FJ-OLV-M', stock: 8 }]
        }
    ];

    function getPath(value, path) {
        if (path === '$value') return value;
        if (!path) return value;
        const parts = String(path).split('.');
        let current = value;
        for (const part of parts) {
            if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(Object(current), part)) return undefined;
            current = current[part];
        }
        return current;
    }

    function setPath(target, path, value) {
        const parts = String(path).split('.');
        let current = target;
        for (let i = 0; i < parts.length; i++) {
            const key = parts[i];
            const isLast = i === parts.length - 1;
            const nextIsIndex = /^\d+$/.test(parts[i + 1] || '');
            if (Array.isArray(current) && /^\d+$/.test(key)) {
                while (current.length < Number(key)) current.push(null);
            }
            if (isLast) {
                current[key] = value;
            } else {
                if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
                    current[key] = nextIsIndex ? [] : {};
                }
                current = current[key];
            }
        }
    }

    function collectSources(value, path, label, sources, depth) {
        if (depth > 8 || value === null || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            if (path && value.some(item => item !== null && typeof item === 'object' && !Array.isArray(item))) {
                sources.push({ path, label, kind: 'array', priority: /^(data|results|items|products)$/i.test(path.split('.').pop()) ? 0 : 1 });
            }
            const sample = value.find(item => item && typeof item === 'object');
            if (sample && !Array.isArray(sample)) collectSources(sample, path ? path + '.0' : '0', label + ' item', sources, depth + 1);
            return;
        }
        Object.keys(value).forEach(key => {
            const child = value[key];
            const childPath = path ? path + '.' + key : key;
            if (Array.isArray(child)) {
                if (child.some(item => item !== null && typeof item === 'object' && !Array.isArray(item))) {
                    sources.push({ path: childPath, label: childPath, kind: 'array', priority: /^(data|results|items|products)$/i.test(key) ? 0 : 1 });
                }
                const sample = child.find(item => item && typeof item === 'object');
                if (sample && !Array.isArray(sample)) collectSources(sample, childPath + '.0', childPath + ' item', sources, depth + 1);
            } else if (child && typeof child === 'object') {
                collectSources(child, childPath, childPath, sources, depth + 1);
            }
        });
    }

    function discoverSources(value) {
        if (Array.isArray(value)) return [{ path: '', label: 'Root array', kind: 'array', priority: -1 }];
        const sources = [{ path: '', label: 'Root object', kind: 'object', priority: 2 }];
        collectSources(value, '', '', sources, 0);
        return sources.sort((a, b) => a.priority - b.priority);
    }

    function getSourceRecords(value, sourcePath) {
        const source = sourcePath ? getPath(value, sourcePath) : value;
        if (Array.isArray(source)) return source.slice();
        return source === undefined ? [] : [source];
    }

    function addField(fields, seen, path, value) {
        if (!seen.has(path)) {
            seen.add(path);
            fields.push({ path, type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value });
        }
    }

    function visitFields(value, path, fields, seen, depth) {
        if (depth > 12) {
            addField(fields, seen, path, value);
            return;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) addField(fields, seen, path, value);
            else value.forEach((item, index) => visitFields(item, path ? path + '.' + index : String(index), fields, seen, depth + 1));
            return;
        }
        if (value && typeof value === 'object') {
            const keys = Object.keys(value);
            if (!keys.length && path) addField(fields, seen, path, value);
            else keys.forEach(key => visitFields(value[key], path ? path + '.' + key : key, fields, seen, depth + 1));
            return;
        }
        addField(fields, seen, path || '$value', value);
    }

    function discoverFields(records) {
        const fields = [];
        const seen = new Set();
        records.forEach(record => visitFields(record, '', fields, seen, 0));
        return fields.filter(field => !['object', 'array'].includes(field.type) ||
            !fields.some(candidate => candidate.path !== field.path && candidate.path.startsWith(field.path + '.')));
    }

    function effectiveFields(fields, selectedPaths, mode, order) {
        const selected = new Set(selectedPaths || []);
        const permitted = fields.filter(field => mode === 'exclude' ? !selected.has(field.path) : selected.has(field.path));
        if (!Array.isArray(order) || !order.length) return permitted;
        const rank = new Map(order.map((path, index) => [path, index]));
        return permitted.sort((a, b) => (rank.has(a.path) ? rank.get(a.path) : Number.MAX_SAFE_INTEGER) -
            (rank.has(b.path) ? rank.get(b.path) : Number.MAX_SAFE_INTEGER));
    }

    function uniqueHeaders(fields, aliases) {
        const counts = new Map();
        return fields.map(field => {
            const initial = (aliases && aliases[field.path] || field.path).trim() || field.path;
            const count = (counts.get(initial) || 0) + 1;
            counts.set(initial, count);
            return count === 1 ? initial : initial + '_' + count;
        });
    }

    function projectRecord(record, fields, headers, flatten) {
        if (flatten) {
            const row = {};
            fields.forEach((field, index) => { row[headers[index]] = getPath(record, field.path); });
            return row;
        }
        const output = {};
        fields.forEach((field, index) => {
            if (field.path === '$value') return;
            const value = getPath(record, field.path);
            if (value === undefined) return;
            setPath(output, field.path, value);
            if (headers[index] !== field.path) {
                deletePath(output, field.path);
                setPath(output, headers[index], value);
            }
        });
        return fields.some(field => field.path === '$value') ? getPath(record, '$value') : output;
    }

    function deletePath(target, path) {
        const parts = String(path).split('.');
        let current = target;
        for (let index = 0; index < parts.length - 1; index++) {
            if (!current || typeof current !== 'object') return;
            current = current[parts[index]];
        }
        if (current && typeof current === 'object') delete current[parts[parts.length - 1]];
    }

    function buildRows(records, fields, options) {
        const settings = options || {};
        const columns = uniqueHeaders(fields, settings.aliases);
        const rows = records.map(record => projectRecord(record, fields, columns, settings.flatten !== false));
        return { columns, rows };
    }

    function isEmpty(value) {
        return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    }

    function compareCondition(record, condition) {
        const value = getPath(record, condition.field);
        const expected = condition.value == null ? '' : String(condition.value);
        switch (condition.operator) {
            case 'contains': return value !== undefined && value !== null && String(value).toLowerCase().includes(expected.toLowerCase());
            case 'equals': return value !== undefined && value !== null && String(value).toLowerCase() === expected.toLowerCase();
            case 'starts': return value !== undefined && value !== null && String(value).toLowerCase().startsWith(expected.toLowerCase());
            case 'ends': return value !== undefined && value !== null && String(value).toLowerCase().endsWith(expected.toLowerCase());
            case 'number-equals': return value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) === Number(condition.value);
            case 'greater': return value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) > Number(condition.value);
            case 'less': return value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) < Number(condition.value);
            case 'range': return value !== undefined && value !== null && Number.isFinite(Number(value)) &&
                Number(value) >= Number(condition.min) && Number(value) <= Number(condition.max);
            case 'before': {
                const actual = Date.parse(value);
                const expectedDate = Date.parse(condition.value);
                return Number.isFinite(actual) && Number.isFinite(expectedDate) && actual < expectedDate;
            }
            case 'after': {
                const actual = Date.parse(value);
                const expectedDate = Date.parse(condition.value);
                return Number.isFinite(actual) && Number.isFinite(expectedDate) && actual > expectedDate;
            }
            case 'empty': return isEmpty(value);
            case 'not-empty': return !isEmpty(value);
            case 'null': return value === null || value === undefined;
            case 'not-null': return value !== null && value !== undefined;
            default: return true;
        }
    }

    function conditionReady(condition) {
        if (!condition.field || !condition.operator) return false;
        if (['empty', 'not-empty', 'null', 'not-null'].includes(condition.operator)) return true;
        if (condition.operator === 'range') return condition.min !== '' && condition.min !== undefined && condition.max !== '' && condition.max !== undefined;
        return condition.value !== '' && condition.value !== undefined && condition.value !== null;
    }

    function filterRecords(records, conditions, join, excludeMatches) {
        const active = (conditions || []).filter(conditionReady);
        if (!active.length) return records.slice();
        return records.filter(record => {
            const results = active.map(condition => compareCondition(record, condition));
            const matches = join === 'or' ? results.some(Boolean) : results.every(Boolean);
            return excludeMatches ? !matches : matches;
        });
    }

    function cellValue(value, emptyValue) {
        if (value === null || value === undefined || value === '') return emptyValue == null ? '' : String(emptyValue);
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    function csvEscape(value, delimiter, options) {
        let text = cellValue(value, options.emptyValue);
        if (options.protectFormulas && typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)) text = "'" + text;
        if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
        return text;
    }

    function toCSV(rows, columns, options) {
        const settings = Object.assign({ delimiter: ',', bom: false, emptyValue: '', protectFormulas: false }, options || {});
        const output = [columns.map(column => csvEscape(column, settings.delimiter, settings)).join(settings.delimiter)];
        rows.forEach(row => output.push(columns.map(column => csvEscape(row && row[column], settings.delimiter, settings)).join(settings.delimiter)));
        return (settings.bom ? '\uFEFF' : '') + output.join('\r\n');
    }

    function xmlEscape(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    function validXmlName(name) {
        return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name);
    }

    function safeXmlName(name) {
        let safe = String(name || 'field').replace(/[^A-Za-z0-9_.-]/g, '_');
        if (!/^[A-Za-z_]/.test(safe)) safe = '_' + safe;
        return safe || 'field';
    }

    function xmlNode(name, value, depth, pretty) {
        const tag = safeXmlName(name);
        const indent = pretty ? '  '.repeat(depth) : '';
        const newline = pretty ? '\n' : '';
        if (value === null || value === undefined) return indent + '<' + tag + '></' + tag + '>';
        if (Array.isArray(value)) {
            const children = value.map(item => xmlNode('item', item, depth + 1, pretty)).join(newline);
            return indent + '<' + tag + '>' + (children ? newline + children + newline + indent : '') + '</' + tag + '>';
        }
        if (typeof value === 'object') {
            const children = Object.keys(value).map(key => xmlNode(key, value[key], depth + 1, pretty)).join(newline);
            return indent + '<' + tag + '>' + (children ? newline + children + newline + indent : '') + '</' + tag + '>';
        }
        return indent + '<' + tag + '>' + xmlEscape(value) + '</' + tag + '>';
    }

    function toXML(records, options) {
        const settings = Object.assign({ root: 'records', item: 'record', declaration: true, pretty: true }, options || {});
        if (!validXmlName(settings.root)) throw new Error('Root element must be a valid XML name (letters, digits, _, . or -; it cannot start with a digit).');
        if (!validXmlName(settings.item)) throw new Error('Item element must be a valid XML name (letters, digits, _, . or -; it cannot start with a digit).');
        const newline = settings.pretty ? '\n' : '';
        const indent = settings.pretty ? '  ' : '';
        const items = records.map(record => xmlNode(settings.item, record, 1, settings.pretty)).join(newline);
        const body = '<' + settings.root + '>' + (items ? newline + items + newline : '') + '</' + settings.root + '>';
        return (settings.declaration ? '<?xml version="1.0" encoding="UTF-8"?>' + newline : '') + body;
    }

    function serialize(records, format, options) {
        const settings = options || {};
        const built = buildRows(records, settings.fields || [], { aliases: settings.aliases, flatten: settings.flatten });
        if (format === 'json') {
            const output = settings.flatten === false
                ? records.map(record => projectRecord(record, settings.fields || [], built.columns, false))
                : built.rows;
            return JSON.stringify(output, null, settings.minified ? 0 : 2);
        }
        if (format === 'xml') return toXML(built.rows, settings.xml);
        if (format === 'tsv') return toCSV(built.rows, built.columns, Object.assign({}, settings.csv, { delimiter: '\t' }));
        if (format === 'excel-csv') return toCSV(built.rows, built.columns, Object.assign({}, settings.csv, { bom: true }));
        if (format === 'csv') return toCSV(built.rows, built.columns, settings.csv);
        throw new Error('Unsupported output format: ' + format);
    }

    function parseErrorDetails(text, error) {
        const message = String(error && error.message || 'Invalid JSON');
        if (/\bline\s+\d+,?\s*column\s+\d+/i.test(message)) return message;
        const match = message.match(/(?:position|at position)\s+(\d+)/i);
        let position = match ? Number(match[1]) : -1;
        if (position < 0 && /unexpected end/i.test(message)) position = text.length;
        if (position < 0) {
            const token = message.match(/Unexpected token ['"](.+?)['"]/i);
            if (token && token[1]) position = text.lastIndexOf(token[1]);
        }
        if (position < 0) return message;
        const prefix = text.slice(0, position);
        return message + ' (line ' + ((prefix.match(/\n/g) || []).length + 1) + ', column ' + (position - prefix.lastIndexOf('\n')) + ')';
    }

    function parseJSON(text) {
        try {
            return JSON.parse(text);
        } catch (error) {
            error.message = parseErrorDetails(text, error);
            throw error;
        }
    }

    function downloadDetails(text, format, fileName, encoding) {
        const extensions = { csv: 'csv', 'excel-csv': 'csv', tsv: 'tsv', xml: 'xml', json: 'json' };
        const selectedEncoding = ['utf-8', 'utf-16le'].includes(encoding) ? encoding : 'utf-8';
        const mimeTypes = { csv: 'text/csv;charset=' + selectedEncoding, 'excel-csv': 'text/csv;charset=' + selectedEncoding, tsv: 'text/tab-separated-values;charset=' + selectedEncoding, xml: 'application/xml;charset=utf-8', json: 'application/json;charset=utf-8' };
        const extension = extensions[format];
        if (!extension) throw new Error('Unsupported output format: ' + format);
        const baseName = String(fileName || 'converted-data').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\.+$/g, '') || 'converted-data';
        return { text, mimeType: mimeTypes[format], fileName: baseName.replace(/\.(csv|tsv|xml|json)$/i, '') + '.' + extension, encoding: format === 'csv' || format === 'excel-csv' || format === 'tsv' ? selectedEncoding : 'utf-8' };
    }

    function encodeText(text, encoding) {
        if (encoding !== 'utf-16le') return new TextEncoder().encode(text);
        const bytes = new Uint8Array(2 + text.length * 2);
        bytes[0] = 0xFF;
        bytes[1] = 0xFE;
        for (let index = 0; index < text.length; index++) {
            const codeUnit = text.charCodeAt(index);
            bytes[2 + index * 2] = codeUnit & 0xFF;
            bytes[3 + index * 2] = codeUnit >> 8;
        }
        return bytes;
    }

    return {
        DEFAULT_SAMPLE,
        getPath,
        setPath,
        discoverSources,
        getSourceRecords,
        discoverFields,
        effectiveFields,
        uniqueHeaders,
        buildRows,
        compareCondition,
        conditionReady,
        filterRecords,
        toCSV,
        toXML,
        validXmlName,
        serialize,
        parseJSON,
        parseErrorDetails,
        downloadDetails,
        encodeText
    };
});

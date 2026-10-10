(function () {
    'use strict';

    const api = window.JsonConverter;
    const $ = id => document.getElementById(id);
    const els = {
        input: $('jsonInput'), drop: $('dropZone'), file: $('fileInput'), fileInfo: $('fileInfo'), inputSize: $('inputSize'),
        error: $('parseError'), source: $('recordSource'), inputCount: $('inputCount'), matchingCount: $('matchingCount'),
        processing: $('processingState'), fields: $('fieldList'), fieldSearch: $('fieldSearch'), fieldMode: $('fieldMode'),
        columnCount: $('columnCount'), undo: $('undoFieldsBtn'), filterList: $('filterList'), filterJoin: $('filterJoin'),
        excludeMatches: $('excludeMatches'), format: $('formatSelect'), filename: $('fileName'), delimiter: $('delimiterSelect'),
        emptyValue: $('emptyValue'), previewLimit: $('previewLimit'), bom: $('bomOption'), formula: $('formulaOption'),
        flatten: $('flattenOption'), minify: $('minifyOption'), xmlOptions: $('xmlOptions'), xmlRoot: $('xmlRoot'),
        xmlItem: $('xmlItem'), xmlDeclaration: $('xmlDeclaration'), xmlPretty: $('xmlPretty'), output: $('outputPreview'),
        outputMessage: $('outputMessage'), summary: $('previewSummary'), copy: $('copyBtn'), download: $('downloadBtn'),
        toast: $('toast')
    };

    const state = {
        parsed: null, sources: [], records: [], fields: [], selected: new Set(), mode: 'include', order: [],
        aliases: Object.create(null), conditions: [], join: 'and', excludeMatches: false, currentText: '',
        worker: null, requestId: 0, processId: 0, debounce: 0, history: [], fileName: '', isLoading: false,
        keepSelectionOnNextParse: false, savedSourcePath: null
    };

    const operators = [
        ['contains', 'Contains'], ['equals', 'Equals'], ['starts', 'Starts with'], ['ends', 'Ends with'],
        ['number-equals', 'Number equals'], ['greater', 'Greater than'], ['less', 'Less than'],
        ['range', 'Number range'], ['before', 'Date before'], ['after', 'Date after'],
        ['empty', 'Is empty'], ['not-empty', 'Is not empty'], ['null', 'Is null or missing'], ['not-null', 'Is not null']
    ];

    function toast(message) {
        els.toast.textContent = message;
        els.toast.classList.add('show');
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2400);
    }

    function bytesLabel(bytes) {
        if (!bytes) return '0 bytes';
        const units = ['bytes', 'KB', 'MB', 'GB'];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + ' ' + units[index];
    }

    function setProcessing(message) {
        els.processing.textContent = message;
    }

    function setOutputMessage(message, error) {
        els.outputMessage.textContent = message;
        els.outputMessage.classList.toggle('hidden', !message);
        els.outputMessage.classList.toggle('text-error', Boolean(error));
        els.outputMessage.classList.toggle('text-on-surface-variant', !error);
    }

    function showInputError(message) {
        els.error.textContent = message;
        els.error.classList.toggle('hidden', !message);
    }

    function getRecordsForSource() {
        if (!state.parsed) return [];
        return api.getSourceRecords(state.parsed, els.source.value);
    }

    function rememberFields() {
        state.history.push({ selected: Array.from(state.selected), mode: state.mode, order: state.order.slice() });
        if (state.history.length > 20) state.history.shift();
        els.undo.disabled = false;
    }

    function setOptions(select, options, selectedValue) {
        while (select.firstChild) select.removeChild(select.firstChild);
        options.forEach(option => {
            const element = document.createElement('option');
            element.value = option.value;
            element.textContent = option.label;
            if (option.value === selectedValue) element.selected = true;
            select.appendChild(element);
        });
    }

    function renderSources(preferredPath) {
        setOptions(els.source, state.sources.map(source => ({
            value: source.path,
            label: source.label + (source.kind === 'array' ? ' (array)' : ' (single object)')
        })), preferredPath);
    }

    function renderFields() {
        const search = els.fieldSearch.value.trim().toLowerCase();
        const visibleFields = state.fields.filter(field => (field.label || field.path).toLowerCase().includes(search));
        const fragment = document.createDocumentFragment();
        if (!state.fields.length) {
            const empty = document.createElement('p');
            empty.className = 'p-4 text-sm text-on-surface-variant';
            empty.textContent = state.parsed ? 'No fields found in this record source.' : 'Load JSON to detect fields.';
            fragment.appendChild(empty);
        } else if (!visibleFields.length) {
            const empty = document.createElement('p');
            empty.className = 'p-4 text-sm text-on-surface-variant';
            empty.textContent = 'No fields match your search.';
            fragment.appendChild(empty);
        }

        visibleFields.forEach(field => {
            const row = document.createElement('div');
            row.className = 'field-row flex items-center gap-2 px-3 py-2 min-w-0';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'rounded';
            checkbox.checked = state.selected.has(field.path);
            checkbox.setAttribute('aria-label', 'Select field ' + field.path);
            checkbox.dataset.action = 'toggle-field';
            checkbox.dataset.path = field.path;

            const name = document.createElement('code');
            name.className = 'mono text-xs text-on-surface flex-1 truncate';
            name.textContent = field.label || field.path;
            name.title = field.label || field.path;
            const type = document.createElement('span');
            type.className = 'text-[10px] text-on-surface-variant';
            type.textContent = field.type;

            const alias = document.createElement('input');
            alias.type = 'text';
            alias.className = 'tool-input rounded px-2 py-1 text-[11px] w-28';
            alias.placeholder = 'Output header';
            alias.value = state.aliases[field.path] || '';
            alias.setAttribute('aria-label', 'Output header for ' + field.path);
            alias.dataset.action = 'rename-field';
            alias.dataset.path = field.path;

            const orderIndex = state.order.indexOf(field.path);
            const up = document.createElement('button');
            up.type = 'button';
            up.textContent = '↑';
            up.title = 'Move field up';
            up.setAttribute('aria-label', 'Move ' + field.path + ' up');
            up.className = 'text-on-surface-variant hover:text-primary disabled:opacity-30 px-1';
            up.disabled = orderIndex <= 0;
            up.dataset.action = 'move-up';
            up.dataset.path = field.path;
            const down = document.createElement('button');
            down.type = 'button';
            down.textContent = '↓';
            down.title = 'Move field down';
            down.setAttribute('aria-label', 'Move ' + field.path + ' down');
            down.className = 'text-on-surface-variant hover:text-primary disabled:opacity-30 px-1';
            down.disabled = orderIndex < 0 || orderIndex >= state.order.length - 1;
            down.dataset.action = 'move-down';
            down.dataset.path = field.path;

            row.append(checkbox, name, type, alias, up, down);
            fragment.appendChild(row);
        });
        els.fields.replaceChildren(fragment);
        const columns = api.effectiveFields(state.fields, Array.from(state.selected), state.mode, state.order);
        els.columnCount.textContent = columns.length + ' output column' + (columns.length === 1 ? '' : 's') +
            (state.mode === 'exclude' ? ' · checked fields excluded' : '');
        els.undo.disabled = state.history.length === 0;
    }

    function fieldSelect(value) {
        const select = document.createElement('select');
        select.className = 'tool-input rounded-md p-2 text-xs min-w-0';
        select.dataset.action = 'filter-field';
        select.setAttribute('aria-label', 'Field to filter');
        const options = state.fields.map(field => ({ value: field.path, label: field.label || field.path }));
        if (!options.length) options.push({ value: '', label: 'No fields available' });
        setOptions(select, options, value || options[0].value);
        return select;
    }

    function valueInput(condition, label, key, type) {
        const input = document.createElement('input');
        input.type = type || 'text';
        input.className = 'tool-input rounded-md p-2 text-xs min-w-0 flex-1';
        input.value = condition[key] || '';
        input.placeholder = label;
        input.setAttribute('aria-label', label);
        input.dataset.action = 'filter-value';
        input.dataset.key = key;
        return input;
    }

    function renderFilters() {
        if (!state.conditions.length) {
            const empty = document.createElement('p');
            empty.className = 'p-4 text-sm text-on-surface-variant';
            empty.textContent = 'No filters. All records are included.';
            els.filterList.replaceChildren(empty);
            return;
        }
        const fragment = document.createDocumentFragment();
        state.conditions.forEach((condition, index) => {
            const row = document.createElement('div');
            row.className = 'filter-row flex flex-col md:flex-row md:items-center gap-2 p-3';
            row.dataset.id = condition.id;
            const field = fieldSelect(condition.field);
            field.dataset.id = condition.id;
            const operator = document.createElement('select');
            operator.className = 'tool-input rounded-md p-2 text-xs';
            operator.dataset.action = 'filter-operator';
            operator.dataset.id = condition.id;
            operator.setAttribute('aria-label', 'Filter operator');
            setOptions(operator, operators.map(item => ({ value: item[0], label: item[1] })), condition.operator);

            row.append(field, operator);
            if (!['empty', 'not-empty', 'null', 'not-null'].includes(condition.operator)) {
                if (condition.operator === 'range') {
                    row.append(valueInput(condition, 'Minimum', 'min', 'number'), valueInput(condition, 'Maximum', 'max', 'number'));
                } else if (condition.operator === 'before' || condition.operator === 'after') {
                    row.append(valueInput(condition, 'Choose a date', 'value', 'date'));
                } else {
                    const type = ['number-equals', 'greater', 'less'].includes(condition.operator) ? 'number' : 'text';
                    row.append(valueInput(condition, 'Value', 'value', type));
                }
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.className = 'text-xs text-error hover:underline px-2 py-2 self-end md:self-auto';
            remove.dataset.action = 'remove-filter';
            remove.dataset.id = condition.id;
            remove.setAttribute('aria-label', 'Remove filter condition ' + (index + 1));
            row.appendChild(remove);
            fragment.appendChild(row);
        });
        els.filterList.replaceChildren(fragment);
    }

    async function filterInChunks(records, conditions, join, exclude, requestId) {
        const active = conditions.filter(api.conditionReady);
        if (!active.length) return records.slice();
        const output = [];
        const chunkSize = 2500;
        for (let start = 0; start < records.length; start += chunkSize) {
            if (requestId !== state.processId) return null;
            const end = Math.min(start + chunkSize, records.length);
            for (let index = start; index < end; index++) {
                const results = active.map(condition => api.compareCondition(records[index], condition));
                const matches = join === 'or' ? results.some(Boolean) : results.every(Boolean);
                if (exclude ? !matches : matches) output.push(records[index]);
            }
            if (end < records.length) await new Promise(resolve => setTimeout(resolve, 0));
        }
        return output;
    }

    function currentSettings() {
        const format = els.format.value;
        const encoding = $('encodingSelect').value;
        const fields = api.effectiveFields(state.fields, Array.from(state.selected), state.mode, state.order);
        return {
            format,
            fields,
            aliases: state.aliases,
            flatten: els.flatten.checked,
            minified: els.minify.checked,
            csv: {
                delimiter: format === 'tsv' ? '\t' : els.delimiter.value,
                bom: encoding === 'utf-8' && (els.bom.checked || format === 'excel-csv'),
                protectFormulas: els.formula.checked,
                emptyValue: els.emptyValue.value
            },
            xml: {
                root: els.xmlRoot.value.trim(),
                item: els.xmlItem.value.trim(),
                declaration: els.xmlDeclaration.checked,
                pretty: els.xmlPretty.checked
            }
        };
    }

    async function updatePreview() {
        const requestId = ++state.processId;
        if (!state.parsed) {
            state.records = [];
            els.inputCount.textContent = '0';
            els.matchingCount.textContent = '0';
            els.output.textContent = '';
            els.copy.disabled = true;
            els.download.disabled = true;
            els.summary.textContent = 'Preview updates as you edit fields and filters.';
            setOutputMessage('Load a JSON file, paste JSON, or load the sample to begin.');
            setProcessing('');
            return;
        }
        state.records = getRecordsForSource();
        els.inputCount.textContent = state.records.length.toLocaleString();
        setProcessing(state.records.length > 2500 ? 'Filtering records…' : '');
        const matching = await filterInChunks(state.records, state.conditions, state.join, state.excludeMatches, requestId);
        if (!matching || requestId !== state.processId) return;
        els.matchingCount.textContent = matching.length.toLocaleString();
        setProcessing('');

        const settings = currentSettings();
        if (!settings.fields.length) {
            state.currentText = '';
            els.output.textContent = '';
            els.copy.disabled = true;
            els.download.disabled = true;
            setOutputMessage(state.fields.length ? 'Select at least one output field to preview or export.' : 'No fields are available for this record source.');
            els.summary.textContent = matching.length.toLocaleString() + ' matching record' + (matching.length === 1 ? '' : 's');
            return;
        }
        if (!matching.length) {
            state.currentText = '';
            els.output.textContent = '';
            els.copy.disabled = true;
            els.download.disabled = true;
            setOutputMessage('No records match the current filters. Adjust or clear the conditions to export data.');
            els.summary.textContent = '0 matching records';
            return;
        }
        const limit = Number(els.previewLimit.value) || 100;
        const previewRecords = matching.slice(0, limit);
        try {
            state.currentText = api.serialize(previewRecords, settings.format, settings);
            els.output.textContent = state.currentText;
            els.copy.disabled = false;
            els.download.disabled = false;
            setOutputMessage('');
            els.summary.textContent = 'Previewing ' + previewRecords.length.toLocaleString() + ' of ' + matching.length.toLocaleString() +
                ' matching record' + (matching.length === 1 ? '' : 's') + ' · downloads include all matching records';
        } catch (error) {
            state.currentText = '';
            els.output.textContent = '';
            els.copy.disabled = true;
            els.download.disabled = true;
            setOutputMessage(error.message, true);
            els.summary.textContent = 'Output validation failed';
        }
    }

    function schedulePreview() {
        clearTimeout(state.debounce);
        state.debounce = setTimeout(updatePreview, 60);
    }

    function resetFields(fields) {
        const selected = new Set(state.selected);
        // Keep the previous selection only when it still applies to the new data's fields.
        const preserve = (state.fields.length > 0 || state.keepSelectionOnNextParse) &&
            fields.some(field => selected.has(field.path));
        const previousOrder = state.order.slice();
        const aliases = state.aliases;
        state.fields = fields;
        state.selected = preserve
            ? new Set(fields.filter(field => selected.has(field.path)).map(field => field.path))
            : new Set(fields.map(field => field.path));
        if (!preserve) state.mode = 'include';
        const orderIndex = new Map(previousOrder.map((path, index) => [path, index]));
        state.order = fields.map(field => field.path).sort((a, b) =>
            (orderIndex.has(a) ? orderIndex.get(a) : Number.MAX_SAFE_INTEGER) -
            (orderIndex.has(b) ? orderIndex.get(b) : Number.MAX_SAFE_INTEGER));
        state.aliases = Object.assign(Object.create(null), aliases);
        state.keepSelectionOnNextParse = false;
        state.history = [];
        els.fieldMode.value = state.mode;
        renderFields();
    }

    function updateSourceFields(precomputedFields) {
        state.savedSourcePath = els.source.value;
        const records = getRecordsForSource();
        resetFields(precomputedFields || api.discoverFields(records));
        renderFilters();
        storeSessionSettings();
        updatePreview();
    }

    function installWorker() {
        try {
            state.worker = new Worker('worker.js');
            state.worker.onmessage = event => {
                if (event.data.id !== state.requestId) return;
                state.isLoading = false;
                setProcessing('');
                if (event.data.error) {
                    state.parsed = null;
                    state.sources = [];
                    state.keepSelectionOnNextParse = state.fields.length > 0 || state.keepSelectionOnNextParse;
                    state.fields = [];
                    renderFields();
                    renderSources('');
                    showInputError(event.data.error);
                    updatePreview();
                    return;
                }
                state.parsed = event.data.value;
                state.sources = event.data.sources;
                showInputError('');
                const sourcePath = state.savedSourcePath !== null && state.sources.some(source => source.path === state.savedSourcePath)
                    ? state.savedSourcePath : event.data.preferredPath;
                state.savedSourcePath = sourcePath;
                renderSources(sourcePath);
                updateSourceFields(sourcePath === event.data.preferredPath ? event.data.fields : undefined);
                storeSessionSettings();
            };
            state.worker.onerror = event => {
                state.isLoading = false;
                setProcessing('');
                showInputError('Could not process this JSON in the background: ' + event.message);
            };
        } catch (error) {
            state.worker = null;
        }
    }

    function parseInput() {
        const raw = els.input.value;
        const requestId = ++state.requestId;
        state.processId++;
        if (!raw.trim()) {
            state.parsed = null;
            state.sources = [];
            state.keepSelectionOnNextParse = state.fields.length > 0 || state.keepSelectionOnNextParse;
            state.fields = [];
            state.history = [];
            renderSources('');
            renderFields();
            renderFilters();
            showInputError('');
            updatePreview();
            return;
        }
        setProcessing('Parsing JSON…');
        state.currentText = '';
        els.output.textContent = '';
        els.copy.disabled = true;
        els.download.disabled = true;
        setOutputMessage('Parsing JSON…');
        state.isLoading = true;
        if (state.worker) {
            state.worker.postMessage({ id: requestId, raw });
            return;
        }
        setTimeout(() => {
            if (requestId !== state.requestId) return;
            try {
                state.parsed = api.parseJSON(raw);
                state.sources = api.discoverSources(state.parsed);
                const preferred = state.sources.find(source => source.priority === 0) || state.sources[0];
                const sourcePath = state.savedSourcePath !== null && state.sources.some(source => source.path === state.savedSourcePath)
                    ? state.savedSourcePath : preferred.path;
                state.savedSourcePath = sourcePath;
                renderSources(sourcePath);
                showInputError('');
                updateSourceFields();
            } catch (error) {
                state.parsed = null;
                state.sources = [];
                state.keepSelectionOnNextParse = state.fields.length > 0 || state.keepSelectionOnNextParse;
                state.fields = [];
                renderSources('');
                renderFields();
                renderFilters();
                showInputError(error.message);
                updatePreview();
            } finally {
                state.isLoading = false;
                setProcessing('');
            }
        }, 0);
    }

    function updateInputSize() {
        const bytes = new Blob([els.input.value]).size;
        els.inputSize.textContent = bytesLabel(bytes);
        if (bytes > 10 * 1024 * 1024) setProcessing('Large input · parsing in a background worker');
    }

    function useFile(file) {
        if (!file) return;
        if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
            toast('Choose a .json file');
            return;
        }
        setProcessing('Reading JSON file…');
        state.currentText = '';
        els.output.textContent = '';
        els.copy.disabled = true;
        els.download.disabled = true;
        setOutputMessage('Reading JSON file…');
        state.fileName = file.name.replace(/\.json$/i, '');
        els.fileInfo.textContent = file.name + ' · ' + bytesLabel(file.size);
        els.filename.value = state.fileName || 'converted-data';
        file.text().then(text => {
            els.input.value = text;
            updateInputSize();
            parseInput();
        }).catch(error => {
            toast('Could not read the selected file');
            showInputError('The selected file could not be read: ' + error.message);
            setProcessing('');
        });
    }

    function setFormatVisibility() {
        const format = els.format.value;
        const isCsv = format === 'csv' || format === 'excel-csv' || format === 'tsv';
        $('delimiterWrap').classList.toggle('hidden', !isCsv || format === 'tsv');
        $('encodingWrap').classList.toggle('hidden', !isCsv);
        $('emptyValueWrap').classList.toggle('hidden', !isCsv && format !== 'xlsx');
        $('bomWrap').classList.toggle('hidden', !isCsv || format === 'tsv' || $('encodingSelect').value !== 'utf-8');
        $('formulaWrap').classList.toggle('hidden', !isCsv);
        $('xmlOptions').classList.toggle('hidden', format !== 'xml');
        $('minifyWrap').classList.toggle('hidden', format !== 'json');
        $('flattenWrap').classList.toggle('hidden', format === 'xlsx');
        if (format === 'xlsx') loadSheetLibrary().catch(() => {});
        if (format === 'excel-csv') els.bom.checked = true;
    }

    function storeSessionSettings() {
        try {
            sessionStorage.setItem('tl-json-converter-settings', JSON.stringify({
                format: els.format.value, mode: state.mode, selected: Array.from(state.selected),
                order: state.order, aliases: state.aliases, join: state.join, conditions: state.conditions,
                source: els.source.value, fileName: els.filename.value, delimiter: els.delimiter.value,
                encoding: $('encodingSelect').value, emptyValue: els.emptyValue.value,
                previewLimit: els.previewLimit.value, bom: els.bom.checked, formula: els.formula.checked,
                flatten: els.flatten.checked, minify: els.minify.checked, xmlRoot: els.xmlRoot.value,
                xmlItem: els.xmlItem.value, xmlDeclaration: els.xmlDeclaration.checked, xmlPretty: els.xmlPretty.checked
            }));
        } catch (error) {
            toast('Could not remember settings for this session');
        }
    }

    function restoreSessionSettings() {
        try {
            const saved = JSON.parse(sessionStorage.getItem('tl-json-converter-settings') || 'null');
            if (!saved) return;
            if (['csv', 'excel-csv', 'xlsx', 'tsv', 'xml', 'json'].includes(saved.format)) els.format.value = saved.format;
            if (saved.mode === 'exclude' || saved.mode === 'include') state.mode = saved.mode;
            if (Array.isArray(saved.selected)) state.selected = new Set(saved.selected);
            if (Array.isArray(saved.selected)) state.keepSelectionOnNextParse = true;
            if (Array.isArray(saved.order)) state.order = saved.order;
            if (saved.aliases && typeof saved.aliases === 'object') state.aliases = saved.aliases;
            if (saved.join === 'or' || saved.join === 'and') state.join = saved.join;
            if (Array.isArray(saved.conditions)) state.conditions = saved.conditions;
            if (typeof saved.source === 'string') state.savedSourcePath = saved.source;
            if (typeof saved.fileName === 'string') els.filename.value = saved.fileName;
            if ([',', ';', '\t', '|'].includes(saved.delimiter)) els.delimiter.value = saved.delimiter;
            if (['utf-8', 'utf-16le'].includes(saved.encoding)) $('encodingSelect').value = saved.encoding;
            if (typeof saved.emptyValue === 'string') els.emptyValue.value = saved.emptyValue;
            if (['25', '100', '500', '1000'].includes(saved.previewLimit)) els.previewLimit.value = saved.previewLimit;
            if (typeof saved.bom === 'boolean') els.bom.checked = saved.bom;
            if (typeof saved.formula === 'boolean') els.formula.checked = saved.formula;
            if (typeof saved.flatten === 'boolean') els.flatten.checked = saved.flatten;
            if (typeof saved.minify === 'boolean') els.minify.checked = saved.minify;
            if (typeof saved.xmlRoot === 'string') els.xmlRoot.value = saved.xmlRoot;
            if (typeof saved.xmlItem === 'string') els.xmlItem.value = saved.xmlItem;
            if (typeof saved.xmlDeclaration === 'boolean') els.xmlDeclaration.checked = saved.xmlDeclaration;
            if (typeof saved.xmlPretty === 'boolean') els.xmlPretty.checked = saved.xmlPretty;
            els.fieldMode.value = state.mode;
            els.filterJoin.value = state.join;
        } catch (error) {
            toast('Saved session settings could not be restored');
        }
    }

    let sheetLibrary = null;
    function loadSheetLibrary() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (!sheetLibrary) {
            sheetLibrary = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                script.onload = () => resolve(window.XLSX);
                script.onerror = () => { sheetLibrary = null; reject(new Error('Could not load the Excel library. Check your connection.')); };
                document.head.appendChild(script);
            });
        }
        return sheetLibrary;
    }

    function buildWorkbookBlob(XLSX, matching, settings) {
        const rows = api.toSheetRows(matching, settings);
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet['!cols'] = rows[0].map((_, column) => {
            let width = 8;
            for (let row = 0; row < Math.min(rows.length, 500); row++) {
                const value = rows[row][column];
                if (value != null) width = Math.max(width, String(value).length);
            }
            return { wch: Math.min(width + 2, 60) };
        });
        sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
        const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
        return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    function downloadOutput() {
        if (!state.parsed || els.download.disabled) return;
        const settings = currentSettings();
        const records = getRecordsForSource();
        const requestId = ++state.processId;
        setProcessing('Preparing download…');
        els.download.disabled = true;
        setTimeout(async () => {
            try {
                const matching = await filterInChunks(records, state.conditions, state.join, state.excludeMatches, requestId);
                if (!matching || requestId !== state.processId) return;
                if (!matching.length) throw new Error('There are no matching records to export.');
                if (!settings.fields.length) throw new Error('Select at least one output field before exporting.');
                let details, blob;
                if (settings.format === 'xlsx') {
                    const XLSX = await loadSheetLibrary();
                    details = api.downloadDetails('', 'xlsx', els.filename.value);
                    blob = buildWorkbookBlob(XLSX, matching, settings);
                } else {
                    const text = api.serialize(matching, settings.format, settings);
                    details = api.downloadDetails(text, settings.format, els.filename.value, $('encodingSelect').value);
                    blob = new Blob([api.encodeText(details.text, details.encoding)], { type: details.mimeType });
                }
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = details.fileName;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                toast('Downloaded ' + details.fileName);
            } catch (error) {
                toast(error.message);
                setOutputMessage(error.message, true);
            } finally {
                setProcessing('');
                els.download.disabled = !state.currentText;
            }
        }, 10);
    }

    async function copyOutput() {
        if (!state.currentText) {
            toast('There is no output to copy');
            return;
        }
        try {
            await navigator.clipboard.writeText(state.currentText);
            toast('Preview copied to clipboard');
        } catch (error) {
            toast('Clipboard access failed. Check browser permissions.');
        }
    }

    function saveFilters() {
        try {
            localStorage.setItem('tl-json-converter-filters', JSON.stringify({
                conditions: state.conditions, join: state.join, excludeMatches: state.excludeMatches
            }));
            toast('Filter configuration saved on this device');
        } catch (error) {
            toast('Could not save filters in local storage');
        }
    }

    function restoreFilters() {
        try {
            const saved = JSON.parse(localStorage.getItem('tl-json-converter-filters') || 'null');
            if (!saved || !Array.isArray(saved.conditions)) {
                toast('No saved filter configuration was found');
                return;
            }
            state.conditions = saved.conditions;
            state.join = saved.join === 'or' ? 'or' : 'and';
            state.excludeMatches = Boolean(saved.excludeMatches);
            els.filterJoin.value = state.join;
            els.excludeMatches.checked = state.excludeMatches;
            renderFilters();
            storeSessionSettings();
            schedulePreview();
            toast('Saved filters restored');
        } catch (error) {
            toast('Saved filters are invalid and could not be restored');
        }
    }

    function filterById(id) {
        return state.conditions.find(condition => condition.id === id);
    }

    els.input.addEventListener('input', () => {
        els.fileInfo.textContent = 'Pasted or edited JSON';
        state.fileName = '';
        updateInputSize();
        clearTimeout(state.parseDebounce);
        state.parseDebounce = setTimeout(parseInput, 250);
    });
    $('uploadBtn').addEventListener('click', () => els.file.click());
    els.file.addEventListener('change', () => useFile(els.file.files[0]));
    els.drop.addEventListener('dragover', event => {
        event.preventDefault();
        els.drop.classList.add('drop-active');
    });
    els.drop.addEventListener('dragleave', event => {
        if (!els.drop.contains(event.relatedTarget)) els.drop.classList.remove('drop-active');
    });
    els.drop.addEventListener('drop', event => {
        event.preventDefault();
        els.drop.classList.remove('drop-active');
        useFile(event.dataTransfer.files[0]);
    });
    $('sampleBtn').addEventListener('click', () => {
        els.input.value = JSON.stringify(api.DEFAULT_SAMPLE, null, 2);
        els.fileInfo.textContent = 'Built-in sample data';
        state.fileName = 'sample-data';
        els.filename.value = state.fileName;
        updateInputSize();
        parseInput();
    });
    $('clearBtn').addEventListener('click', () => {
        els.input.value = '';
        els.file.value = '';
        els.fileInfo.textContent = 'No file loaded';
        state.fileName = '';
        els.filename.value = 'converted-data';
        els.fieldSearch.value = '';
        updateInputSize();
        parseInput();
        els.input.focus();
    });
    els.source.addEventListener('change', updateSourceFields);
    els.fieldSearch.addEventListener('input', renderFields);
    els.fieldMode.addEventListener('change', () => {
        rememberFields();
        state.mode = els.fieldMode.value;
        renderFields();
        storeSessionSettings();
        schedulePreview();
    });
    els.fields.addEventListener('change', event => {
        const target = event.target;
        if (target.dataset.action !== 'toggle-field') return;
        rememberFields();
        if (target.checked) state.selected.add(target.dataset.path);
        else state.selected.delete(target.dataset.path);
        renderFields();
        storeSessionSettings();
        schedulePreview();
    });
    els.fields.addEventListener('input', event => {
        const target = event.target;
        if (target.dataset.action !== 'rename-field') return;
        state.aliases[target.dataset.path] = target.value;
        storeSessionSettings();
        schedulePreview();
    });
    els.fields.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || !['move-up', 'move-down'].includes(button.dataset.action)) return;
        rememberFields();
        const index = state.order.indexOf(button.dataset.path);
        const delta = button.dataset.action === 'move-up' ? -1 : 1;
        const other = index + delta;
        if (index < 0 || other < 0 || other >= state.order.length) return;
        [state.order[index], state.order[other]] = [state.order[other], state.order[index]];
        renderFields();
        storeSessionSettings();
        schedulePreview();
    });
    $('selectAllBtn').addEventListener('click', () => {
        rememberFields();
        state.selected = new Set(state.fields.map(field => field.path));
        renderFields();
        storeSessionSettings();
        schedulePreview();
    });
    $('selectNoneBtn').addEventListener('click', () => {
        rememberFields();
        state.selected.clear();
        renderFields();
        storeSessionSettings();
        schedulePreview();
    });
    els.undo.addEventListener('click', () => {
        const previous = state.history.pop();
        if (!previous) return;
        state.selected = new Set(previous.selected);
        state.mode = previous.mode;
        state.order = previous.order;
        els.fieldMode.value = state.mode;
        renderFields();
        storeSessionSettings();
        schedulePreview();
    });

    $('addFilterBtn').addEventListener('click', () => {
        const firstField = state.fields[0] && state.fields[0].path || '';
        state.conditions.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), field: firstField, operator: 'contains', value: '' });
        renderFilters();
        storeSessionSettings();
        schedulePreview();
    });
    $('clearFiltersBtn').addEventListener('click', () => {
        state.conditions = [];
        renderFilters();
        storeSessionSettings();
        schedulePreview();
    });
    els.filterList.addEventListener('change', event => {
        const target = event.target;
        const condition = filterById(target.dataset.id);
        if (!condition) return;
        if (target.dataset.action === 'filter-field') condition.field = target.value;
        if (target.dataset.action === 'filter-operator') condition.operator = target.value;
        renderFilters();
        storeSessionSettings();
        schedulePreview();
    });
    els.filterList.addEventListener('input', event => {
        const target = event.target;
        if (target.dataset.action !== 'filter-value') return;
        const row = target.closest('.filter-row');
        const condition = filterById(row.dataset.id);
        if (condition) condition[target.dataset.key] = target.value;
        storeSessionSettings();
        schedulePreview();
    });
    els.filterList.addEventListener('click', event => {
        const button = event.target.closest('[data-action="remove-filter"]');
        if (!button) return;
        state.conditions = state.conditions.filter(condition => condition.id !== button.dataset.id);
        renderFilters();
        storeSessionSettings();
        schedulePreview();
    });
    els.filterJoin.addEventListener('change', () => {
        state.join = els.filterJoin.value;
        storeSessionSettings();
        schedulePreview();
    });
    els.excludeMatches.addEventListener('change', () => {
        state.excludeMatches = els.excludeMatches.checked;
        storeSessionSettings();
        schedulePreview();
    });
    $('saveFiltersBtn').addEventListener('click', saveFilters);
    $('restoreFiltersBtn').addEventListener('click', restoreFilters);

    [els.format, els.filename, els.delimiter, $('encodingSelect'), els.emptyValue, els.previewLimit, els.bom, els.formula,
        els.flatten, els.minify, els.xmlRoot, els.xmlItem, els.xmlDeclaration, els.xmlPretty].forEach(control => {
        control.addEventListener('input', () => {
            if (control === els.format || control === $('encodingSelect')) setFormatVisibility();
            storeSessionSettings();
            schedulePreview();
        });
        control.addEventListener('change', () => {
            if (control === els.format || control === $('encodingSelect')) setFormatVisibility();
            storeSessionSettings();
            schedulePreview();
        });
    });
    els.copy.addEventListener('click', copyOutput);
    els.download.addEventListener('click', downloadOutput);

    installWorker();
    restoreSessionSettings();
    setFormatVisibility();
    updateInputSize();
    renderFields();
    renderFilters();
    setOutputMessage('Load a JSON file, paste JSON, or load the sample to begin.');
})();

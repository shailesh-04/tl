importScripts('converter.js');

self.onmessage = function (event) {
    const message = event.data;
    try {
        const value = JsonConverter.parseJSON(message.raw);
        const sources = JsonConverter.discoverSources(value);
        const preferred = sources.find(source => source.priority === 0) || sources[0];
        const records = JsonConverter.getSourceRecords(value, preferred.path);
        self.postMessage({
            id: message.id,
            value,
            sources,
            preferredPath: preferred.path,
            fields: JsonConverter.discoverFields(records)
        });
    } catch (error) {
        self.postMessage({
            id: message.id,
            error: error.message
        });
    }
};

# TL

## JSON Converter & Data Filter

Open [`json-converter/`](./json-converter/) to convert JSON locally into CSV, Excel-compatible CSV, TSV, XML, or JSON. Paste JSON or load a `.json` file, choose a root or nested record collection, select and rename fields, and apply multiple AND/OR filters before previewing or downloading. Nested paths can be flattened or retained in JSON output. Filter configurations can be saved in local storage; the page does not upload input data.

The conversion and filtering helpers are dependency-free and covered by Node's built-in test runner:

```sh
node --test json-converter/tests/converter.test.js
```
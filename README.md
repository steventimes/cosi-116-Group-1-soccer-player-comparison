# Soccer player activity comparison

Serve this repository root with `python3 -m http.server 8000 --bind 127.0.0.1` and open http://127.0.0.1:8000.

Search player names or competition editions, inspect event-count bars and coverage labels, and open a profile on either side. Drag a rectangle on either field or use the preset and reset controls. Both profiles use the same area, density scale, and rate definitions. Hover shows the Sprint 1 local counts; with a field focused, the arrow keys move the same inspection cell and Escape clears it. Below the fields, the action table lists each event inside the shared area for either profile, filtered to passes, shots or other actions, and can be downloaded as CSV. Unknown pass outcomes and shot targets stay listed in italics. A dash means no classified attempts.

The default compares Messi and Ronaldo in the 2022 World Cup. Other indexed samples include the 2014 and 2018 World Cups, Copa América 2024 and UEFA EURO 2024. These are partial recorded-event samples, not full career or movement data. See [source records](app/data/README.md). Raw match bodies are fetched on demand and checked against fixed SHA-256 hashes. Retry preserves the previous comparison and requests the failed profile again. Private raw datasets are not committed.

Pass completion excludes unknown pass outcomes. Goal conversion counts all retained shots. Shots on target excludes unknown target classifications. Counts and denominators appear beside each rate. Coordinates and source-specific conversion rules are recorded in the data modules.

## Data validation checks

Requires Node.js 22.12+ (or Node.js 24) for JSON module imports. From the repository root:

```sh
node --test app/tests/validation.test.js
```

Ten offline checks run without downloads. Four real-profile checks run when `SOURCE_CACHE` points to verified match files. Download the public test sample into the ignored artifacts directory, then run all 14:

```sh
python3 app/scripts/fetch_validation_sources.py
SOURCE_CACHE="$PWD/app/artifacts/source-cache" node --test app/tests/validation.test.js
```

For the browser checks, serve the root on port 8000 as above and install Playwright locally (`npm install --no-save --package-lock=false --prefix app playwright`). Then:

```sh
SOURCE_CACHE="$PWD/app/artifacts/source-cache" node app/scripts/check-coverage.cjs
```

The script uses the installed macOS Chrome by default; set `CHROME_PATH` for another installation, or `PLAYWRIGHT_MODULE` for an existing Playwright module. It serves the original, hash-verified public responses from the temporary cache, so the UI check does not depend on cross-origin provider availability. It checks real profiles, a controlled load failure and retry, search and area controls, controlled duplicate/invalid/missing-location cases, and coverage text at 390px. Screenshots go to ignored `app/artifacts/` (or `ARTIFACT_DIR`). Controlled inputs never enter the shipped catalog.

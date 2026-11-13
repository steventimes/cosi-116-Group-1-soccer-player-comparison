# Soccer player comparison

Compare where a player's recorded ball actions occur across two seasons. Drag a region on either field to update both heatmaps and the passing and shooting statistics. Hover over a field for local counts.

The current prototype uses two fictional players and five sample seasons. It shows action locations rather than continuous movement or time spent in an area.

## Run

From the repository root.

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory app
```

Open http://127.0.0.1:8000 in a modern browser. JavaScript modules and JSON loading require the local server.

## Source

| File | Purpose |
| --- | --- |
| `app/src/model.js` | Data validation, region filtering, totals, and density calculations. |
| `app/src/pitch.js` | Canvas heatmaps and SVG field overlays. |
| `app/src/app.js` | Interaction state, controls, comparison bars, and local details. |
| `app/styles.css` | Layout and presentation. |
| `app/data/demo.json` | Illustrative data with a fixed generation seed. |
| `app/scripts/generate_demo.py` | Reproduce the sample data with Python. |

Coordinates are percentages of field length and width. Heatmaps share a common scale and show smoothed action density. Pass completion divides completed passes by attempted passes. Shot conversion and shots on target divide by attempted shots. A dash means no attempts in the selected area.

## Checks

The model tests use Node.js 18 or newer.

```bash
node --test app/test/model.test.js
```

Browser checks require Playwright, Python, and Chrome or Chromium.

```bash
node app/scripts/verify_browser.cjs
```

Set `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` if those tools are installed outside their standard locations. The script starts and stops its own local server. Screenshots and results go to `app/artifacts/`, which is excluded from Git.

## Remaining work

Real data, an overview of players and seasons, direct comparison between players, an action table, and revised colours are not implemented yet.

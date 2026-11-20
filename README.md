# Soccer player activity comparison

Serve this repository root with `python3 -m http.server 8000 --bind 127.0.0.1` and open http://127.0.0.1:8000.

Search player names or competition editions, inspect event-count bars and coverage labels, and open a profile on either side. Drag a rectangle on either field or use the preset and reset controls. Both profiles use the same area, density scale, and rate definitions. Hover shows the Sprint 1 local counts. A dash means no classified attempts.

The default compares Messi and Ronaldo in the 2022 World Cup. Other indexed samples include the 2014 and 2018 World Cups, Copa América 2024 and UEFA EURO 2024. These are partial recorded-event samples, not full career or movement data. See [source records](app/data/README.md). Raw match bodies are fetched on demand and checked against fixed SHA-256 hashes. Retry preserves the previous comparison and requests the failed profile again. Private raw datasets are not committed.

Pass completion excludes unknown pass outcomes. Goal conversion counts all retained shots. Shots on target excludes unknown target classifications. Counts and denominators appear beside each rate. Coordinates and source-specific conversion rules are recorded in the data modules.

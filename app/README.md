# Player comparison application

Serve the repository root and open its index.html. Search players or competition editions, then open a profile on either comparison side. Counts and coverage labels describe partial located-event samples.

Both profiles use the same rectangular area and heatmap scale. Passing and shooting rates show their numerators and denominators. Unknown pass outcomes and unknown shot-target classifications remain in the data but are excluded from their corresponding known-outcome rate denominators. No attempts display a dash.

The Sprint 1 green, yellow and red heatmap, pointer hover counts, presets and reset remain available. Source adapters fetch only the requested profiles, verify fixed SHA-256 hashes before parsing and convert provider coordinates into field percentages. Failed selections keep the accepted comparison visible and provide Retry. See data/README.md for the source index contract. Raw match files remain external.

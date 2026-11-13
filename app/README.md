# Player activity

This folder contains the browser application and its sample data. See the [repository README](../README.md) for setup, controls, metric definitions, and the source file map.

The application uses native JavaScript modules. Run it through the local server described in the repository README so that the browser can load the JSON file.

The loader checks coordinates, outcomes, and identifiers before rendering. Identical coordinates can represent different actions. Action identifiers, when supplied, must be unique within a player's season. The current sample has no action identifiers.

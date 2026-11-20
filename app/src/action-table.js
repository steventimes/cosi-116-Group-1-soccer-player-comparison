// Local action details: lists the individual events that start inside the
// shared selected area, one profile at a time, with an action-type filter.
// The selected area comes from app.js, so the table always follows the same
// region as the heatmaps and the passing and shooting rates.
import { inside } from "./model.js";

const element = (id) => document.getElementById(id);

// Filter values map to the event types produced by the source adapters.
const FILTERS = {
  all: { label: "All actions", test: () => true },
  pass: { label: "Passes", test: (event) => event.type === "pass" },
  shot: { label: "Shots", test: (event) => event.type === "shot" },
  other: { label: "Other actions", test: (event) => event.type === "other" },
};

// Table state that belongs only to this panel. The selected area is not stored
// here; it is passed in on every render from the shared page state.
const view = { side: "current", filter: "all", rows: [], profileName: "" };
let latest = null;

const TYPE_NAMES = { pass: "Pass", shot: "Shot", other: "Other" };

// Unknown classifications are valid records. They stay in the table and say
// "unknown" instead of being dropped or guessed.
export function outcomeLabel(event) {
  if (event.type === "pass") {
    if (event.complete === null) return "Outcome unknown";
    return event.complete ? "Completed" : "Incomplete";
  }
  if (event.type === "shot") {
    if (event.goal) return "Goal";
    if (event.onTarget === null) return "Target unknown";
    return event.onTarget ? "On target" : "Off target";
  }
  return "Not classified";
}

const isUnusual = (event) =>
  (event.type === "pass" && event.complete === null) ||
  (event.type === "shot" && event.onTarget === null);

const clock = (event) =>
  `${event.minute ?? "?"}:${String(event.second ?? 0).padStart(2, "0")}`;

const percent = (value) => `${value.toFixed(1)}%`;

// Pure helper so the filtering rule can be checked without the page.
export function actionsInArea(events, selection, filter = "all") {
  return (events ?? []).filter(
    (event) => inside(event, selection) && FILTERS[filter].test(event),
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// Optional export of exactly the rows currently shown in the table.
function downloadCsv() {
  const header = [
    "profile",
    "match_id",
    "match_date",
    "time",
    "type",
    "outcome",
    "length_pct",
    "width_pct",
  ];
  const lines = [header.join(",")].concat(
    view.rows.map((event) =>
      [
        view.profileName,
        event.matchId,
        event.matchDate,
        clock(event),
        TYPE_NAMES[event.type],
        outcomeLabel(event),
        event.x,
        event.y,
      ]
        .map(csvCell)
        .join(","),
    ),
  );
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${view.profileName.replace(/[^\w-]+/g, "_")}_${view.filter}_actions.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function draw() {
  if (!latest) return;
  const { profiles, names, selection, scope } = latest;
  const profile = profiles[view.side];
  view.profileName = names[view.side];
  view.rows = actionsInArea(profile?.events, selection, view.filter);
  const inArea = actionsInArea(profile?.events, selection).length;

  // Profile switch and filter buttons expose their state to screen readers.
  document.querySelectorAll("[data-action-side]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.actionSide === view.side),
    );
    button.textContent = names[button.dataset.actionSide];
  });
  document.querySelectorAll("[data-action-filter]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.actionFilter === view.filter),
    );
  });

  element("actions-count").textContent =
    `${view.profileName} · ${scope} · ${view.rows.length} of ${inArea} actions in this area shown (${FILTERS[view.filter].label.toLowerCase()})`;

  // D3 join: one table row per event, keyed by the event identifier.
  window.d3
    .select("#actions-body")
    .selectAll("tr")
    .data(view.rows, (event) => event.id)
    .join("tr")
    .order()
    .attr("class", (event) =>
      [`action-${event.type}`, isUnusual(event) ? "unusual" : ""].join(" "),
    )
    .each(function (event) {
      const row = window.d3.select(this);
      row.selectAll("*").remove();
      row.append("td").text(event.matchDate ?? "—");
      row.append("td").attr("class", "number").text(clock(event));
      row.append("td").text(TYPE_NAMES[event.type]);
      row.append("td").text(outcomeLabel(event));
      row.append("td").attr("class", "number").text(percent(event.x));
      row.append("td").attr("class", "number").text(percent(event.y));
    });

  const empty = view.rows.length === 0;
  element("actions-empty").hidden = !empty;
  element("actions-empty").textContent = profile?.events?.length
    ? `No ${FILTERS[view.filter].label.toLowerCase()} start inside this area for ${view.profileName}. Try another filter or reset the area.`
    : `${view.profileName} has no located actions in this sample.`;
  element("actions-scroll").hidden = empty;
  element("actions-csv").disabled = empty;
}

// Called by app.js whenever profiles or the shared selected area change.
export function renderActionTable(current, reference, names, selection, scope) {
  latest = {
    profiles: { current, reference },
    names,
    selection,
    scope,
  };
  draw();
}

// Wires the panel's own controls once. Buttons are native, so Tab, Enter and
// Space work without extra handlers.
export function initializeActionTable() {
  document.querySelectorAll("[data-action-side]").forEach((button) => {
    button.addEventListener("click", () => {
      view.side = button.dataset.actionSide;
      draw();
    });
  });
  document.querySelectorAll("[data-action-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      view.filter = button.dataset.actionFilter;
      draw();
    });
  });
  element("actions-csv").addEventListener("click", downloadCsv);
}

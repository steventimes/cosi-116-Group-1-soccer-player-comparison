import { coverageText, renderCoverage } from "./coverage.js";
import { AREAS, WHOLE_FIELD, densityIndex } from "./model.js";
import { createPitchRenderer, paintLegend } from "./pitch.js";
import { loadDataset } from "./data.js";
import { renderComparison, renderLocalDetails } from "./comparison.js";

const element = (id) => document.getElementById(id);

function createApplication(data) {
  const state = {
    player: data.metadata.featuredPlayerIds[0],
    other: data.metadata.featuredPlayerIds[1],
    season: data.metadata.defaultSeason,
    reference: data.metadata.defaultSeason,
    selection: { ...WHOLE_FIELD },
    hoverCell: null,
    drag: null,
  };
  const profile = (season, player = state.player) =>
    data.players
      .find((p) => p.id === player)
      ?.profiles.find((p) => p.season === season);
  let pitch;
  function rebuildPitch() {
    pitch = createPitchRenderer(densityIndex(data).grids);
  }
  rebuildPitch();
  paintLegend();
  const paintOverlay = (region = state.selection) =>
    pitch.paintOverlay(region, state.hoverCell);
  function updateCell() {
    renderLocalDetails(
      profile(state.season),
      profile(state.reference, state.other),
      state.selection,
      state.hoverCell,
    );
  }

  function render() {
    element("current-label").textContent =
      `${data.players.find((p) => p.id === state.player).name} · ${state.season}`;
    element("reference-label").textContent =
      `${data.players.find((p) => p.id === state.other).name} · ${state.reference}`;
    element("legend-current").textContent =
      element("current-label").textContent;
    element("legend-reference").textContent =
      element("reference-label").textContent;
    document.querySelectorAll("[data-season]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.season === state.season),
      );
    });
    pitch.drawHeat("current", state.player, state.season);
    pitch.drawHeat("reference", state.other, state.reference);
    paintOverlay();
    renderComparison(
      profile(state.season),
      profile(state.reference, state.other),
      state.selection,
    );
    updateCell();
    renderCoverage(element("coverage-current"), profile(state.season));
    renderCoverage(element("coverage-reference"), profile(state.reference, state.other));
  }

  function clearArea() {
    state.selection = { ...WHOLE_FIELD };
    state.hoverCell = null;
    element("region").value = "whole";
    render();
  }

  function point(event, field) {
    const bounds = field.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.max(
        0,
        Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100),
      ),
    };
  }

  for (const kind of ["current", "reference"]) {
    pitch.initializePitch(kind);
    const field = element(`field-${kind}`);
    field.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      state.drag = { ...point(event, field), field };
      state.hoverCell = null;
      field.setPointerCapture(event.pointerId);
    });
    field.addEventListener("pointermove", (event) => {
      const location = point(event, field);
      if (state.drag && state.drag.field === field) {
        paintOverlay({
          x0: Math.min(state.drag.x, location.x),
          x1: Math.max(state.drag.x, location.x),
          y0: Math.min(state.drag.y, location.y),
          y1: Math.max(state.drag.y, location.y),
        });
        return;
      }
      if (state.drag) return;
      const x = Math.min(90, Math.floor(location.x / 10) * 10);
      const y = Math.min(90, Math.floor(location.y / 10) * 10);
      state.hoverCell = { x0: x, y0: y, x1: x + 10, y1: y + 10 };
      paintOverlay();
      updateCell();
    });
    field.addEventListener("pointerup", (event) => {
      if (!state.drag || state.drag.field !== field) return;
      const location = point(event, field);
      const start = state.drag;
      state.drag = null;
      const region = {
        x0: Math.min(start.x, location.x),
        x1: Math.max(start.x, location.x),
        y0: Math.min(start.y, location.y),
        y1: Math.max(start.y, location.y),
      };
      if (region.x1 - region.x0 > 1 && region.y1 - region.y0 > 1) {
        state.selection = region;
        element("region").value = "custom";
      }
      state.hoverCell = null;
      render();
    });
    field.addEventListener("pointercancel", () => {
      state.drag = null;
      paintOverlay();
    });
  }

  const pending = { current: null, reference: null };
  function selectors() {
    for (const [side, playerKey, seasonKey] of [
      ["current", "player", "season"],
      ["reference", "other", "reference"],
    ]) {
      const playerSelect = element(`player-${side}`),
        seasonSelect = element(`season-${side}`);
      playerSelect.replaceChildren(
        ...data.players.map((p) => new Option(p.name, p.id)),
      );
      playerSelect.value = state[playerKey];
      seasonSelect.replaceChildren(
        ...data.players
          .find((p) => p.id === state[playerKey])
          .profiles.map((p) => new Option(p.season, p.season)),
      );
      seasonSelect.value = state[seasonKey];
    }
  }
  async function choose(side, playerId, season, retry = false) {
    pending[side]?.abort();
    const controller = new AbortController();
    pending[side] = controller;
    const error = element(`error-${side}`),
      again = element(`retry-${side}`);
    error.hidden = true;
    again.hidden = true;
    element(`progress-${side}`).textContent = "Loading selected profile…";
    try {
      let next = data.players
        .find((p) => p.id === playerId)
        .profiles.find((p) => p.season === season);
      if (!next.events || retry) {
        const loaded = await loadDataset({
          season,
          playerIds: [playerId],
          signal: controller.signal,
          retry,
        });
        next = loaded.players
          .find((p) => p.id === playerId)
          .profiles.find((p) => p.season === season);
        if (controller.signal.aborted) return;
        const profiles = data.players.find((p) => p.id === playerId).profiles;
        profiles[profiles.findIndex((p) => p.season === season)] = next;
      }
      if (controller.signal.aborted) return;
      state[side === "current" ? "player" : "other"] = playerId;
      state[side === "current" ? "season" : "reference"] = season;
      rebuildPitch();
      selectors();
      render();
    } catch (e) {
      if (controller.signal.aborted) return;
      const name = data.players.find((p) => p.id === playerId).name;
      error.dataset.coverageState = "load-failure";
      error.textContent = `Load failed for ${name}, ${season}. ${e.message} The previous comparison is still shown.`;
      error.hidden = false;
      again.hidden = false;
      again.onclick = () => choose(side, playerId, season, true);
      selectors();
    } finally {
      if (pending[side] === controller)
        element(`progress-${side}`).textContent = "";
    }
  }
  for (const side of ["current", "reference"]) {
    element(`player-${side}`).onchange = (event) => {
      const player = data.players.find((p) => p.id === event.target.value);
      choose(side, player.id, player.profiles.at(-1).season);
    };
    element(`season-${side}`).onchange = (event) =>
      choose(
        side,
        state[side === "current" ? "player" : "other"],
        event.target.value,
      );
  }
  selectors();
  function overview() {
    const query = element("player-search").value.toLowerCase().trim();
    const rows = data.players
      .flatMap((player) =>
        player.profiles.map((profile) => ({ player, profile })),
      )
      .filter(({ player, profile }) =>
        `${player.name} ${profile.season}`.toLowerCase().includes(query),
      );
    const max =
      window.d3.max(rows, (row) => row.profile.summary.retainedEvents) || 1;
    const scale = window.d3.scaleLinear().domain([0, max]).range([0, 100]);
    window.d3
      .select("#overview-body")
      .selectAll("tr")
      .data(rows)
      .join("tr")
      .each(function ({ player, profile }) {
        const row = window.d3.select(this);
        row.selectAll("*").remove();
        row.append("td").text(player.name);
        row.append("td").text(profile.season);
        const count = row.append("td");
        count.append("span").text(profile.summary.retainedEvents);
        count
          .append("div")
          .attr("class", "count-bar")
          .style("width", `${scale(profile.summary.retainedEvents)}%`);
        row
          .append("td")
          .text(
            coverageText(profile),
          );
        for (const [side, label] of [
          ["current", "Compare A"],
          ["reference", "Compare B"],
        ])
          row
            .append("td")
            .append("button")
            .attr("type", "button")
            .text(label)
            .on("click", () => choose(side, player.id, profile.season));
      });
    element("overview-empty").hidden = rows.length > 0;
  }
  element("player-search").oninput = overview;
  overview();
  element("region").addEventListener("change", (event) => {
    if (event.target.value === "custom") return;
    state.selection = { ...AREAS[event.target.value] };
    state.hoverCell = null;
    render();
  });
  element("clear").addEventListener("click", clearArea);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    state.drag = null;
    state.hoverCell = null;
    paintOverlay();
    updateCell();
  });
  render();
}

async function start(retry = false) {
  const controls = document.querySelectorAll("button, select");
  controls.forEach((control) => {
    control.disabled = true;
  });
  element("data-error").hidden = true;
  element("retry-start").hidden = true;
  try {
    const dataset = await loadDataset({ featuredOnly: true, retry });
    createApplication(dataset);
    document.querySelectorAll("button, select").forEach((control) => {
      control.disabled = false;
    });
  } catch (error) {
    element("data-error").textContent =
      `Data could not be loaded. ${error.message}`;
    element("data-error").hidden = false;
    element("retry-start").hidden = false;
    element("retry-start").disabled = false;
    element("retry-start").onclick = () => start(true);
  }
}
await start();

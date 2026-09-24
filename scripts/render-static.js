#!/usr/bin/env node
/**
 * Bake deferred-revenue and backlog-burn metrics and the monthly table
 * into index.html. First paint does not require JavaScript.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Backlog = require("../js/backlog.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "deferred.json");
const OUT_PATH = path.join(ROOT, "index.html");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(value) {
  return value == null || !Number.isFinite(Number(value)) ? "" : String(value);
}

/** Lower backlog-burn MoM is favorable. */
function toneClass(value) {
  if (!Backlog.isFiniteNumber(value) || value === 0) return "";
  return value < 0 ? "good" : "warn";
}

function burnCopy(comparison) {
  if (!comparison) return "No target comparison (missing actual or target).";
  if (comparison.delta === 0) return '<span class="good">on target</span>';
  const verb = comparison.overTarget ? "over" : "under";
  const cls = comparison.overTarget ? "warn" : "good";
  const pts = (Math.abs(comparison.delta) * 100).toFixed(1);
  const relative = Backlog.formatPercent(Math.abs(comparison.deltaPct), false, 1);
  return (
    '<span class="' +
    cls +
    '">' +
    verb +
    " target by " +
    pts +
    " pts (" +
    relative +
    ")</span>"
  );
}

function coverageCopy(comparison) {
  if (!comparison) return "No target comparison (missing actual or target).";
  if (comparison.delta === 0) return '<span class="good">on target</span>';
  const verb = comparison.overTarget ? "over" : "under";
  const cls = comparison.overTarget ? "good" : "warn";
  const relative = Backlog.formatPercent(Math.abs(comparison.deltaPct), false, 1);
  return (
    '<span class="' +
    cls +
    '">' +
    verb +
    " target by " +
    Backlog.formatMonths(Math.abs(comparison.delta)) +
    " (" +
    relative +
    ")</span>"
  );
}

function burnPill(comparison) {
  if (!comparison) return '<span class="pill">—</span>';
  if (comparison.delta === 0) return '<span class="pill on">On target</span>';
  const cls = comparison.overTarget ? "under" : "over";
  const label = comparison.overTarget ? "Over" : "Under";
  return (
    '<span class="pill ' +
    cls +
    '">' +
    label +
    " " +
    Backlog.formatPercent(Math.abs(comparison.deltaPct), false, 1) +
    "</span>"
  );
}

function mixRows(latest) {
  return Backlog.STREAMS.map(function (key) {
    const label = escapeHtml(Backlog.streamLabel(key));
    if (!latest) {
      return (
        '<div class="mix-row"><div>' +
        label +
        '</div><div class="mix-bar"><span style="width:0%"></span></div><div>—</div><div class="sub">—</div></div>'
      );
    }
    const share = latest.backlogMix[key];
    const width = Backlog.isFiniteNumber(share) ? Math.max(0, Math.min(100, share * 100)).toFixed(1) : "0";
    const ending = latest.endingByStream ? Backlog.asNumber(latest.endingByStream[key]) : null;
    const recognized = latest.recognitionByStream ? Backlog.asNumber(latest.recognitionByStream[key]) : null;
    const vs = latest.vsBacklogMixTarget ? latest.vsBacklogMixTarget[key] : null;
    let vsText = "no mix target";
    if (vs) {
      if (vs.delta === 0) vsText = "on mix target";
      else {
        const pts = (Math.abs(vs.delta) * 100).toFixed(1);
        vsText = (vs.overTarget ? "over" : "under") + " mix target " + pts + " pts";
      }
    }
    const detail = Backlog.formatMoney(ending) + " ending · " + Backlog.formatMoney(recognized) + " recognized · " + vsText;
    return (
      '<div class="mix-row"><div>' +
      label +
      '</div><div class="mix-bar" title="' +
      escapeHtml(Backlog.formatPercent(share, false, 1)) +
      '"><span style="width:' +
      width +
      '%"></span></div><div>' +
      Backlog.formatPercent(share, false, 1) +
      '</div><div class="sub">' +
      escapeHtml(detail) +
      "</div></div>"
    );
  }).join("");
}

function sparkBars(months) {
  const values = months.map(function (row) {
    return Backlog.isFiniteNumber(row.backlogBurn) ? row.backlogBurn : 0;
  });
  const max = values.reduce(function (acc, n) {
    return n > acc ? n : acc;
  }, 0);
  return months
    .map(function (row, index) {
      const height = max > 0 && Backlog.isFiniteNumber(row.backlogBurn) ? (row.backlogBurn / max) * 100 : 0;
      const latest = index === months.length - 1 ? " is-latest" : "";
      return (
        '<div class="bar' +
        latest +
        '" style="height:' +
        height.toFixed(1) +
        '%" title="' +
        escapeHtml(Backlog.monthLabel(row.month) + " " + Backlog.formatPercent(row.backlogBurn, false, 1)) +
        '"></div>'
      );
    })
    .join("");
}

function streamCells(prefix, parts) {
  const source = parts || {};
  return Backlog.STREAMS.map(function (key) {
    const n = Backlog.asNumber(source[key]);
    return (
      '<td data-key="' +
      prefix +
      key +
      '" data-value="' +
      attr(n) +
      '">' +
      Backlog.formatMoney(n) +
      "</td>"
    );
  }).join("");
}

function monthRows(months) {
  return months
    .map(function (row) {
      const total =
        Backlog.formatPercent(row.backlogBurn, false, 1) +
        " backlog burn · " +
        Backlog.formatMoney(row.deferredRevenueBalance) +
        " deferred revenue";
      return (
        '<tr data-month="' +
        escapeHtml(row.month || "") +
        '" data-label="' +
        escapeHtml(Backlog.monthLabel(row.month)) +
        '" data-total="' +
        escapeHtml(total) +
        '">' +
        '<td data-key="month" data-value="' +
        escapeHtml(row.month || "") +
        '">' +
        escapeHtml(Backlog.monthLabel(row.month)) +
        "</td>" +
        '<td data-key="beginning" data-value="' +
        attr(row.beginningBacklog) +
        '">' +
        Backlog.formatMoney(row.beginningBacklog) +
        "</td>" +
        streamCells("add-", row.additionsByStream) +
        '<td data-key="additions" data-value="' +
        attr(row.additions) +
        '">' +
        Backlog.formatMoney(row.additions) +
        "</td>" +
        streamCells("rec-", row.recognitionByStream) +
        '<td data-key="recognition" data-value="' +
        attr(row.recognition) +
        '">' +
        Backlog.formatMoney(row.recognition) +
        "</td>" +
        streamCells("end-", row.endingByStream) +
        '<td data-key="ending" data-value="' +
        attr(row.endingBacklog) +
        '">' +
        Backlog.formatMoney(row.endingBacklog) +
        "</td>" +
        '<td data-key="burn" data-value="' +
        attr(row.backlogBurn) +
        '">' +
        Backlog.formatPercent(row.backlogBurn, false, 1) +
        "</td>" +
        '<td data-key="coverage" data-value="' +
        attr(row.monthsOfCoverage) +
        '">' +
        Backlog.formatMonths(row.monthsOfCoverage) +
        "</td>" +
        '<td data-key="mom" data-value="' +
        attr(row.mom) +
        '">' +
        Backlog.formatPercent(row.mom, true, 1) +
        "</td>" +
        '<td data-key="target" data-value="' +
        attr(row.vsBacklogBurnTarget && row.vsBacklogBurnTarget.deltaPct) +
        '">' +
        burnPill(row.vsBacklogBurnTarget) +
        "</td>" +
        "</tr>"
      );
    })
    .join("\n");
}

function headerCells(prefix, suffix) {
  return Backlog.STREAMS.map(function (key) {
    return (
      '<th data-sort="' +
      prefix +
      key +
      '" data-type="number">' +
      escapeHtml(Backlog.streamLabel(key) + suffix) +
      "</th>"
    );
  }).join("");
}

function render(data) {
  const series = Backlog.analyzeSeries(data);
  const latest = series.latest;
  const coverage = data.meta && data.meta.coverage ? data.meta.coverage : "";
  const monthCount = series.months.length;
  const latestLabel = latest ? Backlog.monthLabel(latest.month) : "—";
  const balanceText = latest ? Backlog.formatMoney(latest.deferredRevenueBalance) : "—";
  const burnText = latest ? Backlog.formatPercent(latest.backlogBurn, false, 1) : "—";
  const coverageText = latest ? Backlog.formatMonths(latest.monthsOfCoverage) : "—";
  const momText = latest ? Backlog.formatPercent(latest.mom, true, 1) : "—";
  const momHint =
    latest && series.previous && Backlog.isFiniteNumber(latest.mom)
      ? "vs " +
        Backlog.monthLabel(series.previous.month) +
        " (" +
        Backlog.formatPercent(series.previous.backlogBurn, false, 1) +
        " backlog burn)"
      : "MoM change needs a prior month with a defined backlog burn";
  const targetBurn =
    series.targets && Backlog.isFiniteNumber(series.targets.backlogBurn)
      ? Backlog.formatPercent(series.targets.backlogBurn, false, 1)
      : "—";
  const targetCoverage =
    series.targets && Backlog.isFiniteNumber(series.targets.monthsOfCoverage)
      ? Backlog.formatMonths(series.targets.monthsOfCoverage)
      : "—";
  const sparkCols = Math.max(monthCount, 1);
  const bestText = series.best
    ? Backlog.monthLabel(series.best.month) + " · " + Backlog.formatPercent(series.best.backlogBurn, false, 1)
    : "—";
  const worstText = series.worst
    ? Backlog.monthLabel(series.worst.month) + " · " + Backlog.formatPercent(series.worst.backlogBurn, false, 1)
    : "—";
  const balanceMom =
    latest && Backlog.isFiniteNumber(latest.balanceMom)
      ? "Balance MoM " + Backlog.formatPercent(latest.balanceMom, true, 1)
      : "Balance MoM —";
  const additionsText = latest ? Backlog.formatMoney(latest.additions) : "—";
  const recognitionText = latest ? Backlog.formatMoney(latest.recognition) : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Deferred Revenue and Backlog Burn Tracker</title>
  <meta name="description" content="Deferred revenue and backlog burn tracker with deferred revenue balance, monthly backlog burn %, months-of-backlog coverage, MoM change, and target comparison. First paint is fully baked HTML.">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="kicker">Revenue · deferred backlog</div>
      <h1>Deferred Revenue and Backlog Burn Tracker</h1>
      <p>
        ${monthCount} months of sample, non-confidential deferred revenue data — additions, recognition, and ending backlog (${escapeHtml(coverage)}).
        Summary metrics and the monthly table below are baked into this HTML so a static
        <code>curl -sL</code> first paint shows deferred revenue balance, monthly backlog burn %, months-of-backlog coverage, MoM change, and target comparison, plus every month row, with no JavaScript placeholder.
      </p>
    </header>

    <section class="metrics" aria-label="Summary metrics">
      <article class="card" id="metric-balance">
        <h2>Deferred revenue balance</h2>
        <p class="value">${escapeHtml(balanceText)}</p>
        <p class="hint">${escapeHtml(latestLabel)} · ending backlog · ${escapeHtml(balanceMom)}</p>
      </article>
      <article class="card" id="metric-burn">
        <h2>Monthly backlog burn</h2>
        <p class="value">${escapeHtml(burnText)}</p>
        <p class="hint">${escapeHtml(latestLabel)} · backlog burn % · recognition ${escapeHtml(recognitionText)} · target ${escapeHtml(targetBurn)}</p>
      </article>
      <article class="card" id="metric-coverage">
        <h2>Months-of-backlog coverage</h2>
        <p class="value">${escapeHtml(coverageText)}</p>
        <p class="hint">${escapeHtml(latestLabel)} · ending backlog / recognition · target ${escapeHtml(targetCoverage)}</p>
      </article>
      <article class="card" id="metric-additions">
        <h2>Additions</h2>
        <p class="value">${escapeHtml(additionsText)}</p>
        <p class="hint">${escapeHtml(latestLabel)} · new deferred revenue added to backlog</p>
      </article>
      <article class="card" id="metric-mom">
        <h2>MoM change</h2>
        <p class="value ${toneClass(latest && latest.mom)}">${escapeHtml(momText)}</p>
        <p class="hint">${escapeHtml(momHint)}</p>
      </article>
      <article class="card" id="metric-targets">
        <h2>Target comparison</h2>
        <p class="sub">Monthly backlog burn target ${escapeHtml(targetBurn)}: ${latest ? burnCopy(latest.vsBacklogBurnTarget) : "—"}</p>
        <p class="sub">Months-of-backlog coverage target ${escapeHtml(targetCoverage)}: ${latest ? coverageCopy(latest.vsMonthsOfCoverageTarget) : "—"}</p>
        <p class="sub">Lower backlog burn is favorable. Higher months-of-backlog coverage is favorable.</p>
      </article>
    </section>

    <section class="mix" id="backlog-mix" aria-label="Ending backlog by stream">
      <h2>Ending backlog by stream</h2>
      <p class="hint">Share of ending backlog for ${escapeHtml(latestLabel)}, with recognition beside each contract stream.</p>
      <div class="mix-grid">
        ${mixRows(latest)}
      </div>
    </section>

    <section class="trend" aria-label="Monthly backlog burn sparkline">
      <h2>Monthly backlog burn</h2>
      <div class="spark" style="grid-template-columns: repeat(${sparkCols}, 1fr)">${sparkBars(series.months)}</div>
      <p class="hint">Best (lowest): ${escapeHtml(bestText)} · Worst (highest): ${escapeHtml(worstText)}</p>
    </section>

    <section aria-label="Monthly table">
      <h2>Monthly table</h2>
      <p class="hint">Click a column header to sort after JavaScript loads. Rows and values are already in the markup. MoM change is the change in monthly backlog burn versus the prior month. Ending backlog is the deferred revenue balance.</p>
      <p id="selected-month"></p>
      <div class="table-wrap">
        <table id="monthly-table">
          <thead>
            <tr>
              <th data-sort="month" data-type="string">Month</th>
              <th data-sort="beginning" data-type="number">Beginning backlog</th>
              ${headerCells("add-", " additions")}
              <th data-sort="additions" data-type="number">Additions</th>
              ${headerCells("rec-", " recognition")}
              <th data-sort="recognition" data-type="number">Recognition</th>
              ${headerCells("end-", " ending backlog")}
              <th data-sort="ending" data-type="number">Ending backlog</th>
              <th data-sort="burn" data-type="number">Backlog burn</th>
              <th data-sort="coverage" data-type="number">Months of coverage</th>
              <th data-sort="mom" data-type="number">MoM</th>
              <th data-sort="target" data-type="number">vs target</th>
            </tr>
          </thead>
          <tbody>
${monthRows(series.months)}
          </tbody>
        </table>
      </div>
    </section>

    <footer>
      <p>Formula: ending backlog = beginning + additions − recognition (deferred revenue balance). Monthly backlog burn % = recognition / beginning backlog. Months-of-backlog coverage = ending backlog / recognition. MoM change = (this month − prior month) / prior month, on backlog burn. Sample source data: <a href="data/deferred.json"><code>data/deferred.json</code></a>. Re-render with <code>node scripts/render-static.js</code>.</p>
    </footer>
  </div>
  <script src="js/backlog.js" defer></script>
  <script src="js/app.js" defer></script>
</body>
</html>
`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const html = render(data);
  fs.writeFileSync(OUT_PATH, html);
  const series = Backlog.analyzeSeries(data);
  process.stdout.write(
    "Wrote " +
      path.relative(ROOT, OUT_PATH) +
      " with " +
      series.months.length +
      " month rows; latest backlog burn " +
      (series.latest ? Backlog.formatPercent(series.latest.backlogBurn, false, 1) : "—") +
      "\n"
  );
}

main();

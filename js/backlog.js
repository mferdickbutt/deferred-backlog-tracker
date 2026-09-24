/**
 * Pure deferred-revenue and backlog-burn analytics.
 * Safe on zero recognition, zero beginning backlog, empty series, null inputs,
 * and a single-month series: never returns NaN or Infinity (null instead).
 *
 * Ending backlog (deferred revenue balance) = beginning + additions − recognition
 * Monthly backlog burn %                     = recognition / beginning backlog
 * Months-of-backlog coverage                 = ending backlog / recognition
 *
 * Lower backlog burn is favorable. Higher months-of-backlog coverage is favorable.
 * MoM change is (current − previous) / previous on monthly backlog burn.
 *
 * Works in Node (CommonJS) and the browser (global `Backlog`).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.Backlog = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ENDING_FORMULA = "beginning + additions - recognition";
  var BURN_FORMULA = "recognition / beginning";
  var COVERAGE_FORMULA = "ending / recognition";
  var STREAMS = ["subscription", "services", "support", "license"];
  var STREAM_LABELS = {
    subscription: "Subscription",
    services: "Services",
    support: "Support",
    license: "License",
  };
  var MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function asNumber(value) {
    if (value == null || value === "") return null;
    if (typeof value === "boolean") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      var trimmed = value.trim();
      if (!trimmed) return null;
      var parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function finiteOrNull(value) {
    return isFiniteNumber(value) ? value : null;
  }

  /**
   * Sum of known stream components.
   * Missing/null/"" components are skipped. All-missing → null.
   * Explicit zeros sum to 0. A non-finite component makes the total null.
   */
  function totalComponents(components) {
    if (components == null || typeof components !== "object" || Array.isArray(components)) {
      return null;
    }
    var sum = 0;
    var seen = false;
    for (var i = 0; i < STREAMS.length; i++) {
      var key = STREAMS[i];
      if (!Object.prototype.hasOwnProperty.call(components, key)) continue;
      if (components[key] == null || components[key] === "") continue;
      var n = asNumber(components[key]);
      if (n == null) return null;
      sum += n;
      seen = true;
    }
    return seen ? finiteOrNull(sum) : null;
  }

  function totalBeginning(value) {
    if (typeof value === "number" || typeof value === "string") return asNumber(value);
    return totalComponents(value);
  }

  function totalAdditions(value) {
    if (typeof value === "number" || typeof value === "string") return asNumber(value);
    return totalComponents(value);
  }

  function totalRecognition(value) {
    if (typeof value === "number" || typeof value === "string") return asNumber(value);
    return totalComponents(value);
  }

  function totalEnding(value) {
    if (typeof value === "number" || typeof value === "string") return asNumber(value);
    return totalComponents(value);
  }

  /**
   * Ending backlog / deferred revenue balance.
   * Null when any input is missing or non-finite.
   */
  function computeEndingBacklog(beginning, additions, recognition) {
    var begin = asNumber(beginning);
    var add = asNumber(additions);
    var rec = asNumber(recognition);
    if (begin == null || add == null || rec == null) return null;
    return finiteOrNull(begin + add - rec);
  }

  /**
   * Monthly backlog burn (recognition / beginning backlog).
   * Null when recognition or beginning is missing, non-finite, or beginning is 0.
   * Zero recognition on a non-zero beginning is 0.
   */
  function computeBacklogBurn(recognition, beginning) {
    var rec = asNumber(recognition);
    var begin = asNumber(beginning);
    if (rec == null || begin == null || begin === 0) return null;
    return finiteOrNull(rec / begin);
  }

  /**
   * Months-of-backlog coverage (ending backlog / recognition).
   * Null when ending or recognition is missing, non-finite, or recognition is 0
   * (a zero-recognition month). Zero ending on positive recognition is 0.
   */
  function computeMonthsOfCoverage(ending, recognition) {
    var end = asNumber(ending);
    var rec = asNumber(recognition);
    if (end == null || rec == null || rec === 0) return null;
    return finiteOrNull(end / rec);
  }

  /**
   * Month-over-month change as a ratio: (current − previous) / previous.
   * Null when either side is null, previous is 0, or there is no prior month.
   */
  function monthOverMonth(current, previous) {
    var cur = asNumber(current);
    var prev = asNumber(previous);
    if (cur == null || prev == null || prev === 0) return null;
    return finiteOrNull((cur - prev) / prev);
  }

  /**
   * Share of a component map (0–1).
   * When the record is missing or the total is null or 0, every share is null.
   * Missing streams are 0 when the total is positive.
   */
  function componentMix(components, total) {
    var mix = {};
    var t = arguments.length > 1 ? asNumber(total) : totalComponents(components);
    var invalid =
      components == null ||
      typeof components !== "object" ||
      Array.isArray(components) ||
      t == null ||
      t === 0;
    if (invalid) {
      for (var i = 0; i < STREAMS.length; i++) mix[STREAMS[i]] = null;
      return mix;
    }
    for (var j = 0; j < STREAMS.length; j++) {
      var key = STREAMS[j];
      if (!Object.prototype.hasOwnProperty.call(components, key) || components[key] == null || components[key] === "") {
        mix[key] = 0;
        continue;
      }
      var n = asNumber(components[key]);
      mix[key] = n == null ? null : finiteOrNull(n / t);
    }
    return mix;
  }

  function backlogMix(backlog, total) {
    if (arguments.length > 1) return componentMix(backlog, total);
    return componentMix(backlog, totalEnding(backlog));
  }

  /**
   * Actual vs target. Null when actual or target is null or target is 0.
   * overTarget means actual > target.
   */
  function compareToTarget(actual, target) {
    var a = asNumber(actual);
    var g = asNumber(target);
    if (a == null || g == null || g === 0) return null;
    var delta = a - g;
    var deltaPct = delta / g;
    if (!Number.isFinite(delta) || !Number.isFinite(deltaPct)) return null;
    return {
      actual: a,
      target: g,
      delta: delta,
      deltaPct: deltaPct,
      overTarget: a > g,
    };
  }

  function sanitizeParts(parts) {
    if (parts == null || typeof parts !== "object" || Array.isArray(parts)) return null;
    var out = {};
    var any = false;
    for (var i = 0; i < STREAMS.length; i++) {
      var key = STREAMS[i];
      if (!Object.prototype.hasOwnProperty.call(parts, key)) continue;
      any = true;
      out[key] = asNumber(parts[key]);
    }
    return any ? out : null;
  }

  function resolveParts(value) {
    if (typeof value === "number" || typeof value === "string") {
      return { total: asNumber(value), parts: null };
    }
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      return { total: totalComponents(value), parts: sanitizeParts(value) };
    }
    return { total: null, parts: null };
  }

  function combineParts(beginParts, addParts, recParts, signRec) {
    if (!beginParts || !addParts || !recParts) return null;
    var out = {};
    var any = false;
    for (var i = 0; i < STREAMS.length; i++) {
      var key = STREAMS[i];
      var b = Object.prototype.hasOwnProperty.call(beginParts, key) ? beginParts[key] : null;
      var a = Object.prototype.hasOwnProperty.call(addParts, key) ? addParts[key] : null;
      var r = Object.prototype.hasOwnProperty.call(recParts, key) ? recParts[key] : null;
      if (b == null && a == null && r == null) continue;
      any = true;
      if (b == null || a == null || r == null) {
        out[key] = null;
        continue;
      }
      out[key] = finiteOrNull(b + a + signRec * r);
    }
    return any ? out : null;
  }

  function analyzeMonth(row, previous, targets, opening) {
    if (row == null || typeof row !== "object") return null;
    var key = typeof row.month === "string" ? row.month : null;
    var additions = resolveParts(row.additions);
    var recognition = resolveParts(row.recognition);
    var explicitEnding = resolveParts(row.endingBacklog != null ? row.endingBacklog : row.ending);

    var beginning;
    if (row.beginning != null) {
      beginning = resolveParts(row.beginning);
    } else if (previous && previous.endingByStream) {
      beginning = { total: previous.endingBacklog, parts: previous.endingByStream };
    } else if (previous && previous.endingBacklog != null) {
      beginning = { total: previous.endingBacklog, parts: null };
    } else if (opening != null) {
      beginning = resolveParts(opening);
    } else {
      beginning = { total: null, parts: null };
    }

    var rolled = computeEndingBacklog(beginning.total, additions.total, recognition.total);
    var rolledParts = combineParts(beginning.parts, additions.parts, recognition.parts, -1);
    var endingTotal = rolled != null ? rolled : explicitEnding.total;
    var endingParts = rolledParts || explicitEnding.parts;

    if (beginning.total == null && endingTotal != null && additions.total != null && recognition.total != null) {
      beginning = {
        total: finiteOrNull(endingTotal - additions.total + recognition.total),
        parts: beginning.parts,
      };
    }

    var burn = computeBacklogBurn(recognition.total, beginning.total);
    var coverage = computeMonthsOfCoverage(endingTotal, recognition.total);
    var mix = componentMix(endingParts, endingTotal);

    var prevBurn = previous ? previous.backlogBurn : null;
    var prevEnding = previous ? previous.endingBacklog : null;
    var prevCoverage = previous ? previous.monthsOfCoverage : null;

    var burnTarget = null;
    var coverageTarget = null;
    var mixTargets = null;
    if (targets && typeof targets === "object") {
      if (targets.backlogBurn != null) burnTarget = compareToTarget(burn, targets.backlogBurn);
      if (targets.monthsOfCoverage != null) {
        coverageTarget = compareToTarget(coverage, targets.monthsOfCoverage);
      }
      if (targets.backlogMix && typeof targets.backlogMix === "object") {
        mixTargets = {};
        for (var i = 0; i < STREAMS.length; i++) {
          var stream = STREAMS[i];
          mixTargets[stream] = compareToTarget(mix[stream], targets.backlogMix[stream]);
        }
      }
    }

    var vs = null;
    if (burn != null && targets && asNumber(targets.backlogBurn) != null) {
      if (burn > targets.backlogBurn) vs = "over";
      else if (burn < targets.backlogBurn) vs = "under";
      else vs = "on";
    }

    return {
      month: key,
      additionsByStream: additions.parts,
      recognitionByStream: recognition.parts,
      endingByStream: endingParts,
      beginningBacklog: beginning.total,
      additions: additions.total,
      recognition: recognition.total,
      endingBacklog: endingTotal,
      deferredRevenueBalance: endingTotal,
      backlogMix: mix,
      backlogBurn: burn,
      monthsOfCoverage: coverage,
      mom: monthOverMonth(burn, prevBurn),
      balanceMom: monthOverMonth(endingTotal, prevEnding),
      coverageMom: monthOverMonth(coverage, prevCoverage),
      vsBacklogBurnTarget: burnTarget,
      vsMonthsOfCoverageTarget: coverageTarget,
      vsBacklogMixTarget: mixTargets,
      vsTarget: vs,
      aboveTarget: vs === "over",
      belowTarget: vs === "under",
      onTarget: vs === "on",
    };
  }

  /**
   * Analyze `{ meta, openingBacklog, targets, months }`.
   * Empty/null series → months [], latest/mom/best/worst null.
   * Single-month series → mom is null.
   * Best = lowest finite backlog burn. Worst = highest.
   * The first month uses `openingBacklog` when it has no `beginning`.
   */
  function analyzeSeries(data) {
    var empty = {
      months: [],
      latest: null,
      previous: null,
      mom: null,
      best: null,
      worst: null,
      targets: null,
      currency: "USD",
      streams: STREAMS.slice(),
      formula: BURN_FORMULA,
      meta: null,
    };
    if (data == null || typeof data !== "object") return empty;
    var targets = data.targets && typeof data.targets === "object" ? data.targets : null;
    var opening = data.openingBacklog != null ? data.openingBacklog : null;
    var rows = Array.isArray(data.months) ? data.months.filter(Boolean) : [];
    var sorted = rows.slice().sort(function (a, b) {
      return String((a && a.month) || "").localeCompare(String((b && b.month) || ""));
    });
    var months = [];
    var prev = null;
    for (var i = 0; i < sorted.length; i++) {
      var analyzed = analyzeMonth(sorted[i], prev, targets, i === 0 ? opening : null);
      if (analyzed) {
        months.push(analyzed);
        prev = analyzed;
      }
    }
    var latest = months.length ? months[months.length - 1] : null;
    var previous = months.length > 1 ? months[months.length - 2] : null;
    var best = null;
    var worst = null;
    for (var j = 0; j < months.length; j++) {
      if (months[j].backlogBurn == null) continue;
      if (best == null || months[j].backlogBurn < best.backlogBurn) best = months[j];
      if (worst == null || months[j].backlogBurn > worst.backlogBurn) worst = months[j];
    }
    return {
      months: months,
      latest: latest,
      previous: previous,
      mom: latest ? latest.mom : null,
      best: best,
      worst: worst,
      targets: targets,
      currency: (data.meta && data.meta.currency) || "USD",
      streams: STREAMS.slice(),
      formula: BURN_FORMULA,
      meta: data.meta || null,
    };
  }

  function monthLabel(iso) {
    if (iso == null || typeof iso !== "string") return "—";
    var parts = iso.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!year || month < 1 || month > 12) return iso;
    return MONTH_NAMES[month - 1] + " " + year;
  }

  function formatMoney(value) {
    if (!isFiniteNumber(value)) return "—";
    var abs = Math.abs(value);
    var formatted = abs.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    return value < 0 ? "-" + formatted : formatted;
  }

  function formatPercent(ratio, signed, digits) {
    if (!isFiniteNumber(ratio)) return "—";
    var places = isFiniteNumber(digits) ? digits : 1;
    var pct = ratio * 100;
    var body = pct.toFixed(places) + "%";
    if (signed && pct > 0) return "+" + body;
    return body;
  }

  function formatMonths(value) {
    if (!isFiniteNumber(value)) return "—";
    return value.toFixed(1) + " mo";
  }

  function streamLabel(key) {
    if (STREAM_LABELS[key]) return STREAM_LABELS[key];
    if (!key) return "—";
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  return {
    ENDING_FORMULA: ENDING_FORMULA,
    BURN_FORMULA: BURN_FORMULA,
    COVERAGE_FORMULA: COVERAGE_FORMULA,
    FORMULA: BURN_FORMULA,
    STREAMS: STREAMS,
    STREAM_LABELS: STREAM_LABELS,
    isFiniteNumber: isFiniteNumber,
    asNumber: asNumber,
    totalBeginning: totalBeginning,
    totalAdditions: totalAdditions,
    totalRecognition: totalRecognition,
    totalEnding: totalEnding,
    computeEndingBacklog: computeEndingBacklog,
    computeBacklogBurn: computeBacklogBurn,
    computeMonthsOfCoverage: computeMonthsOfCoverage,
    monthOverMonth: monthOverMonth,
    componentMix: componentMix,
    backlogMix: backlogMix,
    compareToTarget: compareToTarget,
    analyzeMonth: analyzeMonth,
    analyzeSeries: analyzeSeries,
    monthLabel: monthLabel,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    formatMonths: formatMonths,
    streamLabel: streamLabel,
  };
});

# Deferred Revenue and Backlog Burn Tracker

Public **deferred revenue and backlog burn** ledger: deferred revenue balance, additions, recognition, ending backlog, monthly backlog burn %, months-of-backlog coverage, month-over-month change, and target comparison. **First paint is fully baked HTML** — a static `curl -sL` of `index.html` already contains every required metric and all 18 month rows. No JavaScript, and no `Loading…` shell.

Live page: [https://mferdickbutt.github.io/deferred-backlog-tracker/](https://mferdickbutt.github.io/deferred-backlog-tracker/)

## Data

[`data/deferred.json`](data/deferred.json) is **sample, non-confidential data** (see `meta.sample` / `meta.note`): 18 months (April 2025–September 2026) of deferred revenue additions, recognition, and ending backlog by contract stream (`subscription`, `services`, `support`, `license`), plus an opening backlog and comparison targets. It is not live finance data.

## Formulas

All math lives in [`js/backlog.js`](js/backlog.js). Invalid, missing, or undefined results are **`null`**, never `NaN` or `Infinity`.

**Ending backlog** (deferred revenue balance) for month \(t\):

\[
E_t = B_t + A_t - R_t
\]

\(B_t\) is the beginning backlog (\(E_{t-1}\), or `openingBacklog` on the first month). `null` when beginning, additions, or recognition is null.

**Monthly backlog burn %:**

\[
\mathrm{Burn}_t = R_t / B_t
\]

`null` when recognition is null, beginning is null, or beginning is `0`. Zero recognition on a non-zero beginning is `0`.

**Months-of-backlog coverage:**

\[
\mathrm{Coverage}_t = E_t / R_t
\]

`null` when ending is null, recognition is null, or recognition is `0` (a zero-recognition month). Zero ending on positive recognition is `0`.

**MoM change** (on monthly backlog burn):

\[
\Delta_t = \frac{b_t - b_{t-1}}{b_{t-1}}
\]

`null` when either burn is null, the prior burn is `0`, the series is empty, or the series has a single month.

**Stream mix** (share of ending backlog):

\[
m_{t,s} = \frac{E_{t,s}}{E_t}
\]

Every share is `null` when the total is null or `0`. A single-stream month with a positive total is `1` for that stream and `0` for the others.

**Target comparison** for an actual \(A\) and goal \(G\):

\[
d = A - G, \qquad d\% = \frac{A - G}{G}
\]

`null` when \(A\) or \(G\) is null, or \(G = 0\). Lower backlog burn is favorable. Higher months-of-backlog coverage is favorable. Best / worst months are the lowest and highest finite backlog burn values.

## How to re-render

```bash
node scripts/render-static.js
```

That reads `data/deferred.json`, runs `js/backlog.js`, and overwrites `index.html` with baked summary cards, ending backlog by stream, spark bars, and the monthly table. Progressive enhancement in `js/app.js` (sortable columns, row select) is optional and must not replace first paint.

```bash
bash scripts/test.sh
```

Expect `Summary: N passed, 0 failed` and exit code 0. Checks cover zero/null/empty inputs, zero-recognition months, single-month series, no `NaN`/`Infinity`, and static HTML first paint (including `curl -sL`).

## Layout

| Path | Role |
| --- | --- |
| `data/deferred.json` | Sample additions, recognition, ending backlog, opening balance, and targets |
| `js/backlog.js` | Browser + Node module (`Backlog` / `module.exports`) |
| `scripts/render-static.js` | Static HTML generator |
| `index.html` | First-paint table (no JS required) |
| `css/styles.css` | Minimal layout |
| `js/app.js` | Optional sort / row select |
| `.nojekyll` | GitHub Pages: serve files as-is |
| `scripts/test.sh` | Fixtures, edge cases, static-HTML check |

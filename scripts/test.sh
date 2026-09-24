#!/usr/bin/env bash
# Deferred revenue and backlog burn checks: pure math edge cases + static first-paint HTML.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required"
  echo "Summary: 0 passed, 1 failed"
  exit 1
fi

if ! MATH_OUT="$(node << 'NODE'
const fs = require("fs");
const Backlog = require("./js/backlog.js");

function isPoison(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.some(isPoison);
    return Object.keys(value).some((k) => isPoison(value[k]));
  }
  return false;
}

function check(name, cond) {
  process.stdout.write((cond ? "PASS: " : "FAIL: ") + name + "\n");
}

const zeros = {
  subscription: 0,
  services: 0,
  support: 0,
  license: 0,
};

check(
  "ending backlog formula 1000+200-100 = 1100",
  Backlog.computeEndingBacklog(1000, 200, 100) === 1100
);
check(
  "ENDING_FORMULA mentions beginning, additions, and recognition",
  Backlog.ENDING_FORMULA.indexOf("beginning") !== -1 &&
    Backlog.ENDING_FORMULA.indexOf("additions") !== -1 &&
    Backlog.ENDING_FORMULA.indexOf("recognition") !== -1
);
check(
  "backlog burn formula 100/1000 = 0.1",
  Backlog.computeBacklogBurn(100, 1000) === 0.1
);
check(
  "BURN_FORMULA mentions recognition and beginning",
  Backlog.BURN_FORMULA.indexOf("recognition") !== -1 && Backlog.BURN_FORMULA.indexOf("beginning") !== -1
);
check(
  "months-of-backlog coverage formula 900/100 = 9",
  Backlog.computeMonthsOfCoverage(900, 100) === 9
);
check(
  "COVERAGE_FORMULA mentions ending and recognition",
  Backlog.COVERAGE_FORMULA.indexOf("ending") !== -1 && Backlog.COVERAGE_FORMULA.indexOf("recognition") !== -1
);

check(
  "zero beginning returns null backlog burn not NaN/Infinity",
  Backlog.computeBacklogBurn(100, 0) === null
);
check("null recognition returns null backlog burn", Backlog.computeBacklogBurn(null, 1000) === null);
check("null beginning returns null backlog burn", Backlog.computeBacklogBurn(100, null) === null);
check("empty-string recognition returns null backlog burn", Backlog.computeBacklogBurn("", 1000) === null);
check("whitespace beginning returns null backlog burn", Backlog.computeBacklogBurn(100, "   ") === null);
check("zero recognition and zero beginning returns null burn not NaN", Backlog.computeBacklogBurn(0, 0) === null);
check("zero recognition vs positive beginning burn is 0", Backlog.computeBacklogBurn(0, 500) === 0);

check(
  "zero recognition returns null months-of-backlog coverage not NaN/Infinity",
  Backlog.computeMonthsOfCoverage(1000, 0) === null
);
check("null ending returns null coverage", Backlog.computeMonthsOfCoverage(null, 100) === null);
check("null recognition returns null coverage", Backlog.computeMonthsOfCoverage(100, null) === null);
check("empty-string recognition returns null coverage", Backlog.computeMonthsOfCoverage(100, "") === null);
check("zero ending vs positive recognition coverage is 0", Backlog.computeMonthsOfCoverage(0, 250) === 0);
check("zero ending and zero recognition coverage is null", Backlog.computeMonthsOfCoverage(0, 0) === null);

check(
  "NaN/Infinity guards return null",
  Backlog.computeBacklogBurn(NaN, 1) === null &&
    Backlog.computeBacklogBurn(1, NaN) === null &&
    Backlog.computeBacklogBurn(Infinity, 1) === null &&
    Backlog.computeBacklogBurn(1, Infinity) === null &&
    Backlog.computeBacklogBurn(-Infinity, 1) === null &&
    Backlog.computeMonthsOfCoverage(NaN, 1) === null &&
    Backlog.computeMonthsOfCoverage(1, NaN) === null &&
    Backlog.computeMonthsOfCoverage(1, Infinity) === null &&
    Backlog.computeMonthsOfCoverage(Infinity, 1) === null &&
    Backlog.computeMonthsOfCoverage(-Infinity, 1) === null &&
    Backlog.computeEndingBacklog(NaN, 1, 1) === null &&
    Backlog.computeEndingBacklog(1, Infinity, 1) === null &&
    Backlog.computeEndingBacklog(1, 1, -Infinity) === null &&
    Backlog.totalAdditions({ subscription: NaN }) === null &&
    Backlog.totalRecognition({ subscription: Infinity }) === null &&
    Backlog.totalEnding({ subscription: "NaN" }) === null
);

check("null additions total is null", Backlog.totalAdditions(null) === null);
check("empty object additions total is null", Backlog.totalAdditions({}) === null);
check("boolean additions total is null", Backlog.totalAdditions(true) === null);
check("empty array additions total is null", Backlog.totalAdditions([]) === null);
check("zero additions mix total is 0 not null", Backlog.totalAdditions(zeros) === 0);
check("null recognition total is null", Backlog.totalRecognition(null) === null);
check("empty object recognition total is null", Backlog.totalRecognition({}) === null);
check("zero recognition mix total is 0 not null", Backlog.totalRecognition(zeros) === 0);
check("null ending total is null", Backlog.totalEnding(null) === null);
check("empty string beginning total is null", Backlog.totalBeginning("") === null);
check("numeric string additions total parses", Backlog.totalAdditions("1250") === 1250);

const zeroMix = Backlog.backlogMix(zeros);
check("zero ending backlog mix is null shares", Backlog.STREAMS.every((k) => zeroMix[k] === null));
check(
  "empty object backlog mix is null shares",
  Backlog.STREAMS.every((k) => Backlog.backlogMix({})[k] === null)
);
check(
  "null backlog mix is null shares",
  Backlog.STREAMS.every((k) => Backlog.backlogMix(null)[k] === null)
);

const single = Backlog.backlogMix({ subscription: 12 });
check("single-stream month mix is 100% subscription", single.subscription === 1);
check(
  "single-stream remaining streams are 0",
  single.services === 0 && single.support === 0 && single.license === 0
);
check("single-stream totalEnding equals the one stream", Backlog.totalEnding({ subscription: 12 }) === 12);

check("MoM with previous zero returns null", Backlog.monthOverMonth(100, 0) === null);
check("MoM with null inputs returns null", Backlog.monthOverMonth(null, null) === null);
check("MoM with null current returns null", Backlog.monthOverMonth(null, 10) === null);
check("MoM 110 vs 100 is 0.1", Backlog.monthOverMonth(110, 100) === 0.1);
check("MoM Infinity current returns null", Backlog.monthOverMonth(Infinity, 100) === null);
check("MoM NaN previous returns null", Backlog.monthOverMonth(100, NaN) === null);

const empty = Backlog.analyzeSeries({ months: [] });
check(
  "empty series latest/best/worst/mom are null",
  empty.latest === null &&
    empty.mom === null &&
    empty.best === null &&
    empty.worst === null &&
    Array.isArray(empty.months) &&
    empty.months.length === 0
);
check("null series analyzeSeries returns empty months", Backlog.analyzeSeries(null).months.length === 0);
check("missing months array treated as empty", Backlog.analyzeSeries({}).months.length === 0);
check("null month entries are dropped", Backlog.analyzeSeries({ months: [null, null] }).months.length === 0);
check("empty input analyzeMonth returns null", Backlog.analyzeMonth(null, null, null, null) === null);

const oneMonth = Backlog.analyzeSeries({
  targets: { backlogBurn: 0.1, monthsOfCoverage: 8 },
  months: [
    {
      month: "2026-03",
      beginning: { subscription: 1000, services: 0, support: 0, license: 0 },
      additions: { subscription: 200, services: 0, support: 0, license: 0 },
      recognition: { subscription: 100, services: 0, support: 0, license: 0 },
    },
  ],
});
check(
  "single-month series MoM is null",
  oneMonth.months.length === 1 && oneMonth.mom === null && oneMonth.months[0].mom === null && oneMonth.previous === null
);
check("single-month series never yields NaN or Infinity", !isPoison(oneMonth));
check(
  "single-month series backlog burn is finite",
  Backlog.isFiniteNumber(oneMonth.latest && oneMonth.latest.backlogBurn) &&
    Math.abs(oneMonth.latest.backlogBurn - 0.1) < 1e-12
);
check(
  "single-month series months-of-backlog coverage is 11",
  oneMonth.latest && oneMonth.latest.monthsOfCoverage === 11
);
check(
  "single-month series deferred revenue balance is 1100",
  oneMonth.latest && oneMonth.latest.deferredRevenueBalance === 1100 && oneMonth.latest.endingBacklog === 1100
);
check(
  "single-month series balance MoM and coverage MoM are null",
  oneMonth.latest && oneMonth.latest.balanceMom === null && oneMonth.latest.coverageMom === null
);

check("compareToTarget with zero target returns null", Backlog.compareToTarget(10, 0) === null);
check("compareToTarget with null actual returns null", Backlog.compareToTarget(null, 0.09) === null);
check("compareToTarget with Infinity actual returns null", Backlog.compareToTarget(Infinity, 0.09) === null);
const under = Backlog.compareToTarget(0.08, 0.1);
check(
  "compareToTarget 0.08 vs 0.1 is under by 20%",
  under && under.overTarget === false && Math.abs(under.deltaPct - (0.08 - 0.1) / 0.1) < 1e-12
);
check("compareToTarget 0.12 vs 0.1 is over", Backlog.compareToTarget(0.12, 0.1).overTarget === true);

const zeroRec = Backlog.analyzeSeries({
  targets: { backlogBurn: 0.09, monthsOfCoverage: 10 },
  months: [
    {
      month: "2026-01",
      beginning: { subscription: 5000, services: 0, support: 0, license: 0 },
      additions: { subscription: 400, services: 0, support: 0, license: 0 },
      recognition: zeros,
    },
    {
      month: "2026-02",
      additions: { subscription: 100, services: 0, support: 0, license: 0 },
      recognition: { subscription: 50, services: 0, support: 0, license: 0 },
    },
  ],
});
check("zero-recognition month burn is 0", zeroRec.months[0] && zeroRec.months[0].backlogBurn === 0);
check(
  "zero-recognition month months-of-backlog coverage is null",
  zeroRec.months[0] && zeroRec.months[0].monthsOfCoverage === null
);
check(
  "zero-recognition month ending backlog keeps additions",
  zeroRec.months[0] && zeroRec.months[0].endingBacklog === 5400
);
check(
  "zero-recognition month does not poison next burn",
  zeroRec.months[1] && Math.abs(zeroRec.months[1].backlogBurn - 50 / 5400) < 1e-12
);
check(
  "MoM after a zero-recognition month stays null",
  zeroRec.months[1] && zeroRec.months[1].mom === null
);
check("zero-recognition series never yields NaN or Infinity", !isPoison(zeroRec));
check(
  "zero-recognition month mix shares are defined on positive ending",
  zeroRec.months[0] && zeroRec.months[0].backlogMix.subscription === 1 && zeroRec.months[0].backlogMix.services === 0
);

const infGuard = Backlog.analyzeSeries({
  targets: { backlogBurn: 0, monthsOfCoverage: 0, backlogMix: { subscription: 0 } },
  months: [
    {
      month: "2026-01",
      beginning: zeros,
      additions: { subscription: 1000, services: 0, support: 0, license: 0 },
      recognition: { subscription: 200, services: 0, support: 0, license: 0 },
    },
    { month: "2026-02", beginning: null, additions: null, recognition: null },
    {
      month: "2026-03",
      beginning: { subscription: 800, services: 0, support: 0, license: 0 },
      additions: zeros,
      recognition: zeros,
    },
    {
      month: "2026-04",
      beginning: 0,
      additions: 0,
      recognition: 0,
    },
    {
      month: "2026-05",
      beginning: Infinity,
      additions: NaN,
      recognition: Infinity,
      endingBacklog: NaN,
    },
  ],
});
check("zero/empty/null series never yields NaN or Infinity", !isPoison(infGuard));
check("zero-beginning month backlog burn is null", infGuard.months[0] && infGuard.months[0].backlogBurn === null);
check(
  "zero-beginning month still rolls ending from additions and recognition",
  infGuard.months[0] && infGuard.months[0].endingBacklog === 800
);
check("null-input month burn is null", infGuard.months[1] && infGuard.months[1].backlogBurn === null);
check("null-input month coverage is null", infGuard.months[1] && infGuard.months[1].monthsOfCoverage === null);
check("null-input month deferred revenue balance is null", infGuard.months[1] && infGuard.months[1].deferredRevenueBalance === null);
check(
  "zero-recognition month with positive beginning burn is 0",
  infGuard.months[2] && infGuard.months[2].backlogBurn === 0
);
check(
  "zero-recognition month with positive beginning coverage is null",
  infGuard.months[2] && infGuard.months[2].monthsOfCoverage === null
);
check(
  "all-zero scalar month burn and coverage are null",
  infGuard.months[3] && infGuard.months[3].backlogBurn === null && infGuard.months[3].monthsOfCoverage === null
);
check(
  "all-zero scalar month ending backlog is 0",
  infGuard.months[3] && infGuard.months[3].endingBacklog === 0
);
check(
  "zero ending mix shares are null",
  infGuard.months[3] && Backlog.STREAMS.every((k) => infGuard.months[3].backlogMix[k] === null)
);
check(
  "Infinity/NaN month ratios are null",
  infGuard.months[4] &&
    infGuard.months[4].backlogBurn === null &&
    infGuard.months[4].monthsOfCoverage === null &&
    infGuard.months[4].endingBacklog === null
);
check("zero target yields null target comparison", infGuard.months[2] && infGuard.months[2].vsBacklogBurnTarget === null);
check("zero coverage target yields null coverage comparison", infGuard.months[0] && infGuard.months[0].vsMonthsOfCoverageTarget === null);

const chained = Backlog.analyzeSeries({
  openingBacklog: { subscription: 1000, services: 0, support: 0, license: 0 },
  months: [
    {
      month: "2026-06",
      additions: { subscription: 100, services: 0, support: 0, license: 0 },
      recognition: { subscription: 80, services: 0, support: 0, license: 0 },
    },
    {
      month: "2026-07",
      additions: { subscription: 50, services: 0, support: 0, license: 0 },
      recognition: { subscription: 40, services: 0, support: 0, license: 0 },
    },
  ],
});
check(
  "opening backlog is the first beginning",
  chained.months[0] && chained.months[0].beginningBacklog === 1000 && chained.months[0].endingBacklog === 1020
);
check(
  "next month beginning equals prior ending backlog",
  chained.months[1] && chained.months[1].beginningBacklog === 1020 && chained.months[1].endingBacklog === 1030
);
check("chained series never yields NaN or Infinity", !isPoison(chained));

const sample = JSON.parse(fs.readFileSync("./data/deferred.json", "utf8"));
const series = Backlog.analyzeSeries(sample);
check("sample series has exactly 18 months", series.months.length === 18);
check(
  "sample data is labeled as sample",
  sample.meta && (sample.meta.sample === true || /sample/i.test(sample.meta.note || ""))
);
check(
  "sample note is non-confidential",
  sample.meta && /non-confidential/i.test(sample.meta.note || "")
);
check(
  "sample includes backlog burn and months-of-coverage targets",
  sample.targets &&
    Backlog.isFiniteNumber(sample.targets.backlogBurn) &&
    Backlog.isFiniteNumber(sample.targets.monthsOfCoverage)
);
check("sample latest deferred revenue balance is finite", Backlog.isFiniteNumber(series.latest && series.latest.deferredRevenueBalance));
check("sample latest additions are finite", Backlog.isFiniteNumber(series.latest && series.latest.additions));
check("sample latest recognition is finite", Backlog.isFiniteNumber(series.latest && series.latest.recognition));
check("sample latest backlog burn is finite", Backlog.isFiniteNumber(series.latest && series.latest.backlogBurn));
check("sample latest months-of-backlog coverage is finite", Backlog.isFiniteNumber(series.latest && series.latest.monthsOfCoverage));
check("sample latest MoM is finite", Backlog.isFiniteNumber(series.latest && series.latest.mom));
check(
  "sample latest backlog mix sums to 1",
  Math.abs(Backlog.STREAMS.reduce((s, k) => s + series.latest.backlogMix[k], 0) - 1) < 1e-9
);
check(
  "sample best is lowest backlog burn and worst is highest",
  series.best && series.worst && series.best.backlogBurn <= series.worst.backlogBurn
);
check(
  "sample months include additions, recognition, and ending backlog",
  series.months.every(
    (row) =>
      Backlog.isFiniteNumber(row.additions) &&
      row.additions > 0 &&
      Backlog.isFiniteNumber(row.recognition) &&
      row.recognition > 0 &&
      Backlog.isFiniteNumber(row.endingBacklog) &&
      row.endingBacklog > 0 &&
      Backlog.isFiniteNumber(row.backlogBurn) &&
      Backlog.isFiniteNumber(row.monthsOfCoverage)
  )
);
check(
  "sample stream additions sum to additions",
  series.months.every((row) => {
    const sum = Backlog.STREAMS.reduce((s, k) => s + row.additionsByStream[k], 0);
    return sum === row.additions;
  })
);
check(
  "sample stream recognition sums to recognition",
  series.months.every((row) => {
    const sum = Backlog.STREAMS.reduce((s, k) => s + row.recognitionByStream[k], 0);
    return sum === row.recognition;
  })
);
check(
  "sample stream ending backlog sums to deferred revenue balance",
  series.months.every((row) => {
    const sum = Backlog.STREAMS.reduce((s, k) => s + row.endingByStream[k], 0);
    return sum === row.deferredRevenueBalance;
  })
);
check(
  "sample rollforward holds: ending = beginning + additions - recognition",
  series.months.every(
    (row) => row.endingBacklog === row.beginningBacklog + row.additions - row.recognition
  )
);
check(
  "sample stored ending backlog matches the rollforward",
  sample.months.every((row, index) => {
    const stored = Backlog.totalEnding(row.endingBacklog);
    return stored === series.months[index].endingBacklog;
  })
);
check(
  "sample first month MoM is null and later MoM values are finite",
  series.months[0].mom === null && series.months.slice(1).every((row) => Backlog.isFiniteNumber(row.mom))
);
check(
  "sample first month is 2025-04 and last is 2026-09",
  series.months[0].month === "2025-04" && series.months[series.months.length - 1].month === "2026-09"
);
check("sample series never yields NaN or Infinity", !isPoison(series));
check(
  "sample opening backlog is the April 2025 beginning",
  series.months[0].beginningBacklog === Backlog.totalBeginning(sample.openingBacklog)
);
NODE
)"; then
  echo "FAIL: node backlog checks crashed"
  printf '%s\n' "$MATH_OUT"
  echo "Summary: 0 passed, 1 failed"
  exit 1
fi

printf '%s\n' "$MATH_OUT"
while IFS= read -r line; do
  case "$line" in
    PASS:*) PASS=$((PASS + 1)) ;;
    FAIL:*) FAIL=$((FAIL + 1)) ;;
  esac
done <<< "$MATH_OUT"

# --- Static first-paint HTML ---
if [[ ! -f "$ROOT/index.html" ]]; then
  fail "index.html exists for first paint"
else
  pass "index.html exists for first paint"
fi

if [[ ! -f "$ROOT/data/deferred.json" ]]; then
  fail "data/deferred.json exists"
else
  pass "data/deferred.json exists"
fi

HTML="$(cat "$ROOT/index.html")"

if grep -q -E 'Loading…|Loading\.\.\.|Loading\.\.|id="loading"' "$ROOT/index.html"; then
  fail "static HTML has no Loading shell"
else
  pass "static HTML has no Loading shell"
fi

echo "$HTML" | grep -q "Deferred revenue balance" && pass "static HTML includes Deferred revenue balance" || fail "static HTML includes Deferred revenue balance"
echo "$HTML" | grep -q "Monthly backlog burn" && pass "static HTML includes Monthly backlog burn" || fail "static HTML includes Monthly backlog burn"
echo "$HTML" | grep -q "backlog burn %" && pass "static HTML includes backlog burn %" || fail "static HTML includes backlog burn %"
echo "$HTML" | grep -q "Months-of-backlog coverage" && pass "static HTML includes Months-of-backlog coverage" || fail "static HTML includes Months-of-backlog coverage"
echo "$HTML" | grep -q "months-of-backlog coverage" && pass "static HTML includes months-of-backlog coverage" || fail "static HTML includes months-of-backlog coverage"
echo "$HTML" | grep -q "MoM change" && pass "static HTML includes MoM change" || fail "static HTML includes MoM change"
echo "$HTML" | grep -q "Target comparison" && pass "static HTML includes Target comparison" || fail "static HTML includes Target comparison"
echo "$HTML" | grep -q "Ending backlog" && pass "static HTML includes Ending backlog" || fail "static HTML includes Ending backlog"
echo "$HTML" | grep -q "Additions" && pass "static HTML includes Additions" || fail "static HTML includes Additions"
echo "$HTML" | grep -q "Recognition" && pass "static HTML includes Recognition" || fail "static HTML includes Recognition"

ROW_COUNT="$(grep -c 'data-month="' "$ROOT/index.html" || true)"
if [[ "$ROW_COUNT" -eq 18 ]]; then
  pass "static HTML has 18 month rows (${ROW_COUNT})"
else
  fail "static HTML has 18 month rows (found ${ROW_COUNT})"
fi

echo "$HTML" | grep -q 'data-month="2025-04"' && pass "static HTML includes first month 2025-04" || fail "static HTML includes first month 2025-04"
echo "$HTML" | grep -q 'data-month="2026-09"' && pass "static HTML includes last month 2026-09" || fail "static HTML includes last month 2026-09"

LATEST_BALANCE="$(node -e 'const B=require("./js/backlog.js");const d=require("./data/deferred.json");const s=B.analyzeSeries(d);process.stdout.write(B.formatMoney(s.latest.deferredRevenueBalance));')"
LATEST_BURN="$(node -e 'const B=require("./js/backlog.js");const d=require("./data/deferred.json");const s=B.analyzeSeries(d);process.stdout.write(B.formatPercent(s.latest.backlogBurn,false,1));')"
LATEST_COVERAGE="$(node -e 'const B=require("./js/backlog.js");const d=require("./data/deferred.json");const s=B.analyzeSeries(d);process.stdout.write(B.formatMonths(s.latest.monthsOfCoverage));')"
LATEST_MOM="$(node -e 'const B=require("./js/backlog.js");const d=require("./data/deferred.json");const s=B.analyzeSeries(d);process.stdout.write(B.formatPercent(s.latest.mom,true,1));')"
LATEST_ADDITIONS="$(node -e 'const B=require("./js/backlog.js");const d=require("./data/deferred.json");const s=B.analyzeSeries(d);process.stdout.write(B.formatMoney(s.latest.additions));')"

echo "$HTML" | grep -F -q -e "$LATEST_BALANCE" && pass "baked deferred revenue balance ${LATEST_BALANCE} is in HTML" || fail "baked deferred revenue balance ${LATEST_BALANCE} is in HTML"
echo "$HTML" | grep -F -q -e "$LATEST_BURN" && pass "baked backlog burn ${LATEST_BURN} is in HTML" || fail "baked backlog burn ${LATEST_BURN} is in HTML"
echo "$HTML" | grep -F -q -e "$LATEST_COVERAGE" && pass "baked months-of-backlog coverage ${LATEST_COVERAGE} is in HTML" || fail "baked months-of-backlog coverage ${LATEST_COVERAGE} is in HTML"
echo "$HTML" | grep -F -q -e "$LATEST_MOM" && pass "baked MoM value ${LATEST_MOM} is in HTML" || fail "baked MoM value ${LATEST_MOM} is in HTML"
echo "$HTML" | grep -F -q -e "$LATEST_ADDITIONS" && pass "baked additions value ${LATEST_ADDITIONS} is in HTML" || fail "baked additions value ${LATEST_ADDITIONS} is in HTML"

ROW_GAPS=0
while IFS= read -r line; do
  if ! printf '%s\n' "$line" | grep -q '\$'; then
    ROW_GAPS=$((ROW_GAPS + 1))
  fi
  if ! printf '%s\n' "$line" | grep -q '%'; then
    ROW_GAPS=$((ROW_GAPS + 1))
  fi
done < <(grep 'data-month="' "$ROOT/index.html")
if [[ "$ROW_GAPS" -eq 0 ]]; then
  pass "every month row contains backlog dollars and percents"
else
  fail "every month row contains backlog dollars and percents (gaps ${ROW_GAPS})"
fi

# curl -sL against a static server (no JS execution)
PORT=8907
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/backlog-http.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sleep 0.4

CURL_HTML="$(curl -sL "http://127.0.0.1:${PORT}/")"
if [[ -z "$CURL_HTML" ]]; then
  fail "curl -sL returns HTML"
else
  pass "curl -sL returns HTML"
fi

echo "$CURL_HTML" | grep -q "Deferred revenue balance" && echo "$CURL_HTML" | grep -q "backlog" && echo "$CURL_HTML" | grep -q "burn" && echo "$CURL_HTML" | grep -q "coverage" && echo "$CURL_HTML" | grep -q "MoM change" && echo "$CURL_HTML" | grep -q "Target comparison" \
  && pass "curl -sL first paint includes deferred revenue / backlog / burn / coverage / MoM / target" \
  || fail "curl -sL first paint includes deferred revenue / backlog / burn / coverage / MoM / target"

CURL_ROWS="$(printf '%s\n' "$CURL_HTML" | grep -c 'data-month="' || true)"
if [[ "$CURL_ROWS" -eq 18 ]]; then
  pass "curl -sL first paint includes ${CURL_ROWS} month rows"
else
  fail "curl -sL first paint includes 18 month rows (found ${CURL_ROWS})"
fi

echo "$CURL_HTML" | grep -F -q -e "$LATEST_BALANCE" && echo "$CURL_HTML" | grep -F -q -e "$LATEST_BURN" && echo "$CURL_HTML" | grep -F -q -e "$LATEST_COVERAGE" && echo "$CURL_HTML" | grep -F -q -e "$LATEST_MOM" \
  && pass "curl -sL first paint includes baked deferred revenue, backlog burn, coverage, and MoM values" \
  || fail "curl -sL first paint includes baked deferred revenue, backlog burn, coverage, and MoM values"

if echo "$CURL_HTML" | grep -q -E 'Loading…|Loading\.\.\.|Loading\.\.|id="loading"'; then
  fail "curl -sL HTML has no Loading shell"
else
  pass "curl -sL HTML has no Loading shell"
fi

if [[ -f "$ROOT/.nojekyll" ]]; then
  pass ".nojekyll present for GitHub Pages"
else
  fail ".nojekyll present for GitHub Pages"
fi

if [[ -f "$ROOT/css/styles.css" ]]; then
  pass "minimal CSS stylesheet present"
else
  fail "minimal CSS stylesheet present"
fi

if [[ -f "$ROOT/js/backlog.js" ]]; then
  pass "js/backlog.js module present"
else
  fail "js/backlog.js module present"
fi

if [[ -f "$ROOT/js/app.js" ]]; then
  pass "js/app.js progressive enhancement present"
else
  fail "js/app.js progressive enhancement present"
fi

echo "Summary: ${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
exit 0

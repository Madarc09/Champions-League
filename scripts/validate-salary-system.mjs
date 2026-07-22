import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REQUIRED_SALARY_GUARDS, VERIFIED_SALARY_CORRECTIONS_BY_NAME } from "../data/verified-salary-corrections.js";

const tempFiles = [];
async function tempModuleFor(source, label) {
  const filepath = join(tmpdir(), `champions-${label}-${process.pid}-${tempFiles.length}.mjs`);
  tempFiles.push(filepath);
  await writeFile(filepath, source, "utf8");
  return import(`${pathToFileURL(filepath).href}?v=${Date.now()}`);
}

try {
  let parserSource = await readFile(new URL("../lib/capspace-snapshot.js", import.meta.url), "utf8");
  parserSource = parserSource.replace('import { getRedis } from "@/lib/redis";', 'const getRedis = () => null;');
  const { canonicalPlayerName, parseCapSpaceRosterCount, parseCapSpaceTeamHtml } = await tempModuleFor(parserSource, "capspace-test");

  assert.equal(canonicalPlayerName("Fox, Adam"), "adamfox");
  assert.equal(canonicalPlayerName("J.T. Miller"), "jtmiller");

  const fixture = `
    <div>Roster: 2</div>
    <h2>NHL Roster</h2><table>
      <tr><td><a href="/person/adam-fox-2939">Fox, Adam</a></td><td>$9,500,000</td></tr>
      <tr><td><a href="/person/braden-schneider-1234">Schneider, Braden</a></td><td>$5,500,000</td></tr>
    </table><h2>Reserve Rights</h2>`;
  const parsed = parseCapSpaceTeamHtml(fixture, "nyr", "NYR");
  assert.equal(parseCapSpaceRosterCount(fixture), 2);
  assert.equal(parsed.length, 2);
  assert.equal(parsed.find((row) => row.key === "adamfox")?.capHit, 9_500_000);
  assert.equal(parsed.find((row) => row.key === "adamfox")?.teamAbbreviation, "NYR");

  const csv = await readFile(new URL("../data/salaries-2026-27.csv", import.meta.url), "utf8");
  const csvLines = csv.trim().split(/\r?\n/);
  assert.ok(csvLines.length >= 17, "verified salary CSV must contain real rows");
  assert.ok(csv.includes("8479323,Adam Fox,NYR,D,9500000"));
  assert.ok(csv.includes("8480027,Jason Robertson,DAL,LW,12000000"));

  const teams = ["NYR", ...Array.from({ length: 31 }, (_, index) => `T${String(index + 1).padStart(2, "0")}`)];
  const byTeamAndName = {};
  const byName = {};
  for (const team of teams) {
    for (let index = 0; index < 15; index += 1) {
      const name = team === "NYR" && index === 0 ? "Adam Fox" : `Player ${team} ${index}`;
      const key = canonicalPlayerName(name);
      const record = {
        key,
        name,
        capHit: team === "NYR" && index === 0 ? 9_500_000 : 850_000 + index * 10_000,
        teamAbbreviation: team,
        source: "mock complete audit"
      };
      byTeamAndName[`${team}:${key}`] = record;
      byName[key] = record;
    }
  }

  globalThis.__salaryTestStore = new Map();
  globalThis.__salaryTestSnapshot = {
    teamCount: 32,
    failedTeams: [],
    teamRecordCounts: Object.fromEntries(teams.map((team) => [team, 15])),
    teamPublishedRosterCounts: Object.fromEntries(teams.map((team) => [team, 15])),
    updatedAt: "2026-07-22T00:00:00.000Z",
    sourceUrl: "https://cap-space.com",
    byName,
    byTeamAndName
  };
  globalThis.__salaryTestRequired = REQUIRED_SALARY_GUARDS;
  globalThis.__salaryTestCorrections = VERIFIED_SALARY_CORRECTIONS_BY_NAME;

  let masterSource = await readFile(new URL("../lib/static-salary-master.js", import.meta.url), "utf8");
  masterSource = masterSource
    .replace('import { getRedis } from "@/lib/redis";', `const getRedis = () => ({\n      get: async (key) => globalThis.__salaryTestStore.get(key) || null,\n      set: async (key, value) => { globalThis.__salaryTestStore.set(key, value); }\n    });`)
    .replace(/import \{\s*canonicalPlayerName,\s*getCapSpaceSalarySnapshot\s*\} from "@\/lib\/capspace-snapshot";/, `const canonicalPlayerName = (value) => String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/\\b(jr|sr|ii|iii|iv)\\b/gi, "").replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();\n    const getCapSpaceSalarySnapshot = async () => globalThis.__salaryTestSnapshot;`)
    .replace(/import \{\s*REQUIRED_SALARY_GUARDS,\s*VERIFIED_SALARY_CORRECTIONS_BY_NAME\s*\} from "@\/data\/verified-salary-corrections";/, `const REQUIRED_SALARY_GUARDS = globalThis.__salaryTestRequired;\n    const VERIFIED_SALARY_CORRECTIONS_BY_NAME = globalThis.__salaryTestCorrections;`);

  const { buildStaticSalaryMaster, salaryTeamNameKey } = await tempModuleFor(masterSource, "master-test");
  const master = await buildStaticSalaryMaster({ force: true });
  assert.equal(master.sourceTeamCount, 32);
  assert.ok(master.recordCount >= 480);
  assert.equal(master.byPlayerId["8479323"].capHit, 9_500_000);
  assert.equal(master.byPlayerId["8480027"].capHit, 12_000_000);
  assert.equal(master.byTeamAndName[salaryTeamNameKey("NYR", "Adam Fox")].capHit, 9_500_000);

  const playerRoute = await readFile(new URL("../app/api/players/route.js", import.meta.url), "utf8");
  assert.match(playerRoute, /byPlayerId/);
  assert.match(playerRoute, /byTeamAndName/);
  assert.match(playerRoute, /salaryState: Number\.isFinite\(capHit\) \? "signed" : "unresolved"/);

  console.log("Salary system validation passed:");
  console.log(`- parser fixture: ${parsed.length} salary rows`);
  console.log(`- simulated strict master: ${master.recordCount} team-aware contracts across ${master.sourceTeamCount} teams`);
  console.log(`- bundled verified rows: ${csvLines.length - 1}`);
  console.log("- Adam Fox and Jason Robertson regression rows present");
} finally {
  await Promise.all(tempFiles.map((filepath) => unlink(filepath).catch(() => {})));
  delete globalThis.__salaryTestStore;
  delete globalThis.__salaryTestSnapshot;
  delete globalThis.__salaryTestRequired;
  delete globalThis.__salaryTestCorrections;
}

import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempPath = join(tmpdir(), `champions-salary-fallback-${process.pid}.mjs`);
const byName = {};
for (let index = 0; index < 460; index += 1) {
  const key = `player${index}`;
  byName[key] = {
    key,
    name: `Player ${index}`,
    capHit: 800000 + index,
    teamAbbreviation: index === 0 ? "NYR" : "TOR",
    source: "legacy working cache"
  };
}

globalThis.__fallbackFetchCalls = 0;
globalThis.__legacySnapshot = {
  season: "2026-27",
  source: "legacy working cache",
  sourceUrl: "https://cap-space.com",
  updatedAt: "2026-07-01T00:00:00.000Z",
  teamCount: 30,
  failedTeams: [{ teamAbbreviation: "AAA" }, { teamAbbreviation: "BBB" }],
  recordCount: 460,
  byName
};

try {
  let source = await readFile(new URL("../lib/capspace-snapshot.js", import.meta.url), "utf8");
  source = source.replace(
    'import { getRedis } from "@/lib/redis";',
    `const getRedis = () => ({
      get: async (key) => key.endsWith(":v3-rookies") ? globalThis.__legacySnapshot : null,
      set: async () => { throw new Error("normal fallback should not write before returning cache"); }
    });`
  );
  source = source.replaceAll("await fetch(url, {", "(globalThis.__fallbackFetchCalls += 1, await fetch(url, {");
  source = source.replace(/\n\s*\}\);\n\s*\} finally \{/m, "\n      }));\n  } finally {");

  await writeFile(tempPath, source, "utf8");
  const module = await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
  const snapshot = await module.getCapSpaceSalarySnapshot();

  assert.equal(snapshot.recordCount, 460);
  assert.equal(snapshot.cacheKey.endsWith(":v3-rookies"), true);
  assert.equal(globalThis.__fallbackFetchCalls, 0);
  console.log("Resilient salary fallback validation passed:");
  console.log("- legacy working cache returned 460 salaries");
  console.log("- zero live team-page requests were required");
} finally {
  await unlink(tempPath).catch(() => {});
  delete globalThis.__fallbackFetchCalls;
  delete globalThis.__legacySnapshot;
}

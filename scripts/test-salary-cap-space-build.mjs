import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "salary-cap-space-"));

const players = [
  { playerId: 8479323, name: "Adam Fox", team: "NYR", position: "D", capHit: 0 },
  { playerId: 8481582, name: "Nicholas Robertson", team: "PIT", position: "F", capHit: 0 },
  { playerId: 8480027, name: "Jason Robertson", team: "DAL", position: "F", capHit: 0 },
  { playerId: 9999991, name: "Existing Salary", team: "TOR", position: "F", capHit: 2250000 },
  { playerId: -123, name: "Unsigned Prospect", team: "TOR", position: "F", capHit: 0 }
];

function row(name, salary) {
  const slug = name.toLowerCase().replaceAll(" ", "-");
  return `<tr><td><a href="/person/${slug}">${name}</a></td><td>${salary ? `$${salary.toLocaleString("en-US")}` : ""}</td></tr>`;
}

const htmlByTeam = {
  nyr: `<h2>NHL Roster</h2><table>${row("Adam Fox", 9500000)}</table><h2>Reserve Rights</h2>`,
  pit: `<h2>NHL Roster</h2><table>${row("Nicholas Robertson", 3250000)}</table><h2>Reserve Rights</h2>`,
  dal: `<h2>NHL Roster</h2><table></table><h2>Reserve Rights</h2>`,
  tor: `<h2>NHL Roster</h2><table></table><h2>Reserve Rights</h2>`
};

const server = http.createServer((request, response) => {
  if (request.url === "/players") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ players }));
    return;
  }
  if (request.url === "/empty") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ players: [] }));
    return;
  }
  if (request.url === "/duplicates") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ players: [players[0], { ...players[0], name: "Duplicate Fox" }] }));
    return;
  }
  const team = request.url?.match(/^\/team\/([^/?]+)/)?.[1];
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(htmlByTeam[team] || "<h2>NHL Roster</h2><table></table><h2>Reserve Rights</h2>");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;

async function runBuilder(sourcePath, expectedCode = 0) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", "build-salary-cap-space.mjs")], {
      cwd: ROOT,
      env: {
        ...process.env,
        SALARY_CAP_SPACE_SOURCE_URL: `${base}${sourcePath}`,
        CAPSPACE_BASE_URL: base,
        SALARY_CAP_SPACE_OUTPUT_DIR: outputDir
      },
      stdio: expectedCode === 0 ? "inherit" : "ignore"
    });
    child.on("error", reject);
    child.on("exit", resolve);
  });
  assert.equal(code, expectedCode, `builder exit code for ${sourcePath}`);
}

try {
  await runBuilder("/players");

  const snapshotPath = path.join(outputDir, "SALARY_CAP_SPACE.json");
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  const byName = Object.fromEntries(snapshot.records.map((record) => [record.name, record]));

  assert.equal(snapshot.recordCount, 5);
  assert.equal(snapshot.signedCount, 4);
  assert.equal(snapshot.zeroSalaryCount, 1);
  assert.equal(byName["Adam Fox"].capHit, 9500000);
  assert.equal(byName["Nicholas Robertson"].capHit, 3250000);
  assert.equal(byName["Jason Robertson"].capHit, 12000000);
  assert.equal(byName["Existing Salary"].capHit, 2250000);
  assert.equal(byName["Unsigned Prospect"].capHit, 0);

  const zeroCsv = await fs.readFile(path.join(outputDir, "SALARY_CAP_SPACE_ZERO_LIST.csv"), "utf8");
  assert.match(zeroCsv, /Unsigned Prospect/);
  assert.doesNotMatch(zeroCsv, /Adam Fox/);

  const successfulFile = await fs.readFile(snapshotPath, "utf8");
  await runBuilder("/empty", 1);
  assert.equal(await fs.readFile(snapshotPath, "utf8"), successfulFile, "empty feed must not replace the static file");
  await runBuilder("/duplicates", 1);
  assert.equal(await fs.readFile(snapshotPath, "utf8"), successfulFile, "duplicate feed must not replace the static file");

  console.log("SALARY CAP SPACE fixture and failure-safety tests passed.");
} finally {
  server.close();
  await fs.rm(outputDir, { recursive: true, force: true });
}

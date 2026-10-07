// Triage helper: summarize vitest JSON output by failure category.
// Usage: bunx vitest run tests/unit --reporter=json --outputFile=coverage/vitest-triage.json
//        bun scripts/triage-failures.ts coverage/vitest-triage.json
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: bun scripts/triage-failures.ts <vitest-json-output.json>");
  process.exit(1);
}

const j = JSON.parse(readFileSync(path, "utf8"));

const buckets = new Map<string, Set<string>>();

for (const tr of j.testResults ?? []) {
  for (const a of tr.assertionResults ?? []) {
    if (a.status !== "failed") continue;
    const file = tr.name.replace(/\\/g, "/");
    const msg = (a.failureMessages?.[0] ?? "").replace(/\\r?\\n/g, " ");

    let bucket: string;
    if (/Unable to find (an )?element|getByText|getByRole|findByText|TestingLibraryElementError/i.test(msg)) {
      bucket = "element-not-found (stale labels)";
    } else if (/expected.*to equal|toMatchObject|toEqual|deep equal|payload|shape/i.test(msg)) {
      bucket = "payload-mismatch";
    } else if (/expected status|status code|HTTP|403|404|500/i.test(msg)) {
      bucket = "http-status";
    } else if (/Windows|C:\\|\/home\//i.test(msg)) {
      bucket = "windows-path";
    } else {
      bucket = "other";
    }

    if (!buckets.has(bucket)) buckets.set(bucket, new Set());
    buckets.get(bucket)!.add(file);
  }
}

console.log("Failing test files by category:");
for (const [bucket, files] of [...buckets.entries()].sort()) {
  console.log(`\\n== ${bucket}: ${files.size} files ==`);
  for (const f of [...files].sort()) console.log("  " + f);
}

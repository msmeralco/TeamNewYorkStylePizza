// Meter-reading accuracy run. Usage:
//   npx tsx scripts/accuracy.ts data-private/labels.csv data-private/photos [--split test]
// Needs GEMINI_API_KEY in the environment. Photos stay local; only digits are written to the results file.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { formatReport, parseLabels, score, type LabelRow, type ReadResult } from "../src/lib/accuracy";
import { GeminiMeterReader } from "../src/lib/readers/gemini";
import { ReaderError } from "../src/lib/readers/types";

// The reader makes two Gemini calls per photo, so pace photos about 12 s apart by default.
const DEFAULT_DELAY_MS = 12000;
const RETRY_WAIT_MS = 30000;
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  let split = "test";
  let delayMs = Number(process.env.ACCURACY_DELAY_MS ?? DEFAULT_DELAY_MS);
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--split") split = args[++i] ?? "";
    else if (args[i] === "--delay-ms") delayMs = Number(args[++i]);
    else pos.push(args[i]);
  }
  const usage = "Usage: npx tsx scripts/accuracy.ts <labels.csv> <photos-dir> [--split test] [--delay-ms 12000]";
  if (pos.length < 2 || !split) fail(usage);
  if (!Number.isFinite(delayMs) || delayMs < 0) fail(`Bad delay. ${usage}`);
  if (!process.env.GEMINI_API_KEY) fail("GEMINI_API_KEY is not set. Set it in your shell, then run again.");

  const [labelsPath, photosDir] = pos;
  let rows: LabelRow[];
  try {
    rows = parseLabels(readFileSync(labelsPath, "utf8")).filter((r) => r.split === split);
  } catch (e) {
    fail(`Could not read labels: ${(e as Error).message}`);
  }
  if (rows.length === 0) fail(`No labelled photos with split "${split}" in ${labelsPath}.`);

  const reader = new GeminiMeterReader();
  const results: ReadResult[] = [];
  // Service or file problems say nothing about reading quality, so they are not scored.
  const notScored: { file: string; truth: string; meter_type: string; reason: string }[] = [];

  for (const [i, row] of rows.entries()) {
    const tag = `[${i + 1}/${rows.length}] ${row.file}`;
    const base: ReadResult = { file: row.file, truth: row.true_reading, read: null, meter_type: row.meter_type };
    const skip = (reason: string) => {
      notScored.push({ file: row.file, truth: row.true_reading, meter_type: row.meter_type, reason });
      console.log(`${tag}: not scored (${reason})`);
    };
    let img: { base64: string; mimeType: string };
    const mimeType = MIME[extname(row.file).toLowerCase()];
    if (!mimeType) {
      skip("unsupported image type");
      continue;
    }
    try {
      img = { base64: readFileSync(join(photosDir, row.file)).toString("base64"), mimeType };
    } catch {
      skip("file not found or unreadable");
      continue;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // expectedDigits comes from the label, the same hint the app gets from the meter's configured length.
        const scan = await reader.readMeter(img, { expectedDigits: row.true_reading.length });
        results.push({ ...base, read: scan.digitsText });
        console.log(`${tag}: read ${scan.digitsText}, truth ${row.true_reading}`);
        break;
      } catch (e) {
        const msg = (e as Error).message;
        if (attempt === 0 && /HTTP 429/.test(msg)) {
          console.log(`${tag}: rate limited, waiting ${RETRY_WAIT_MS / 1000}s then retrying once`);
          await sleep(RETRY_WAIT_MS);
          continue;
        }
        if (e instanceof ReaderError && e.code === "bad_output") {
          // The model answered but gave nothing usable: a genuine reading miss.
          results.push(base);
          console.log(`${tag}: no usable reading (counts as a miss)`);
        } else {
          skip(e instanceof ReaderError ? `service error: ${e.code}${/HTTP 429/.test(msg) ? " 429" : ""}` : "service error");
        }
        break;
      }
    }
    if (i < rows.length - 1) await sleep(delayMs);
  }

  const s = score(results);
  console.log("\n" + formatReport(s));
  if (notScored.length > 0) {
    console.log(`\nNot scored (service or file error): ${notScored.length}`);
    for (const n of notScored) console.log(`  ${n.file}: ${n.reason}`);
    console.log("Rerun to cover these photos before quoting the figure.");
  }
  const outPath = join(dirname(labelsPath), "accuracy-results.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ split, ranAt: new Date().toISOString(), score: s, notScored, results }, null, 2));
  console.log(`\nResults written to ${outPath}`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).message}`));

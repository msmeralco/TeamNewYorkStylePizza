# Scripts

## Meter-reading accuracy (`accuracy.ts`)

This produces the one number judges will test: exact match of every digit on the held-out test photos, reported as "N of 50 (X%)".

### 1. Place the photos

Put photos in `data-private/photos/` (gitignored, never commit them). Before saving, follow the privacy rules in the kit's `04_data_prep.md`: owner asked first, no faces, house numbers, street signs or account and meter serial numbers in frame, no GPS tag.

### 2. Label them

Copy the kit's `meter_labels_template.csv` to `data-private/labels.csv`, delete the example row, and add one row per photo:

`file,true_reading,meter_type,lighting,angle,split,notes`

- `true_reading`: digits only as a person reads them, keep leading zeros (`04572`).
- `meter_type`: `analog_dial` or `digital`.
- `split`: `dev` (we may look at it while tuning) or `test` (held out; nobody looks at it).
- Two people label each test photo separately. If they disagree, look again together before writing the row.

### 3. Run it

PowerShell:

```
$env:GEMINI_API_KEY='...'; npx tsx scripts/accuracy.ts data-private/labels.csv data-private/photos --split test
```

bash / macOS / Linux:

```
GEMINI_API_KEY=... npx tsx scripts/accuracy.ts data-private/labels.csv data-private/photos --split test
```

Never commit the key or put it in a file in the repo. `tsx` is fetched by `npx`; it is not a project dependency. The default split is `test`.

Pacing: each photo costs two Gemini calls, and the free tier allows roughly 10 a minute, so the script waits 12 s between photos (50 photos take about 10 minutes). Override with `--delay-ms 8000` or the `ACCURACY_DELAY_MS` env var if your quota is higher. A rate-limited (HTTP 429) call is retried once after 30 s.

Scoring: only photos the model actually answered are scored (an answer with no usable digits counts as a miss). Photos that fail because of the service (quota, network, key) or the file (missing, unsupported type) are listed under "Not scored (service or file error)" and left out of "N of M". Rerun until that list is empty before quoting the figure.

Note: the script passes each row's `true_reading` length to the reader as the expected digit count, the same hint the app gets from a meter's configured length. So the length check cannot fail here. Make sure the label length matches the real register.

It prints the report (overall, analog and digital separately, and the list of misses) and writes `data-private/accuracy-results.json` next to the labels file. If the figure is below our 90% target, say so on demo day. The confirm step is the safety net.

### Rule: demo props never count

The printable sample bill and drawn meter faces in the kit's `print/` folder are demo props. Never put them in the labels file or the photos folder, and never count them toward the figure. Only real photos of real meters, in the `test` split, count.

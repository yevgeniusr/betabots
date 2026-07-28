# Local Dashboard

Betabots includes a local, read-only study report for artifacts in `.betabots/runs`. It turns a selected run into a human-facing report while keeping the recorded source material available for inspection.

The dashboard never runs bots, edits cohorts, writes run artifacts, or changes the target project. Refreshing the report only reads the configured run directory again. It also omits dot-prefixed run directories (for example, runtime or temporary directories) from the run picker.

## Start

From a project that contains `.betabots/runs`:

```bash
node /path/to/betabots/web/server.cjs
```

From the Betabots repository while inspecting another project:

```bash
node web/server.cjs \
  --runs /path/to/target-app/.betabots/runs \
  --port 3999
```

The server binds to `127.0.0.1` by default, so `http://127.0.0.1:3999` is available only on the local machine.

You can also set the runs directory and port with environment variables:

```bash
BETABOTS_RUNS_DIR=/path/to/.betabots/runs PORT=3999 node web/server.cjs
```

### Tailnet access

`HOST` is optional. To let devices on the same Tailscale tailnet read the report, bind the server to that machine's specific Tailscale IPv4 address—not to all interfaces. Replace the example address with the value from `tailscale ip -4` on the machine running the dashboard:

```bash
HOST=100.64.0.2 PORT=3999 node web/server.cjs \
  --runs /path/to/target-app/.betabots/runs
```

Then open `http://<that-tailscale-ip>:3999` from an authorized tailnet device. This is local/tailnet access only; the dashboard does not publish, host, or deploy reports to the public internet.

## Report structure

Choose a visible run to open a four-part study report:

- **Overview** leads with source-derived highlights from `analysis.md`, compact artifact counts, and the complete study notes behind a disclosure.
- **Bot stories** lets readers open a bot's account with recorded goals, outcome, ideas, action evidence, truth assessments, and life-cost decisions. The complete event timeline and raw persona story stay available on demand.
- **Evidence** groups the recorded bot timelines and action evidence, screenshots, explicit loading flags, and truth assessments.
- **Technical details** retains provenance and lower-level artifacts, including run metadata, LLM and fallback/debug counters, Betabook, Destiny, and the complete files-and-artifacts list.

The report is intentionally evidence-led: artifact counts are not conclusions, and empty states make missing or partial material explicit. Raw logs, full timelines, study notes, and technical artifacts are preserved behind progressive disclosure so that the main report remains readable without hiding the underlying record.

## Visual direction and accessibility

The interface uses a warm editorial study-report treatment rather than a dense console: readable notes and stories lead, with supporting evidence close by. Its hero uses the bundled, generated, text-free journey artwork solely as decoration; it has empty alternative text and must not be treated as run evidence or a depiction of a recorded session.

The report is responsive at 390, 900, 1024, and 1440 pixel viewport widths. The four section tabs use semantic tab roles and support mouse, touch, and keyboard operation: use Left/Right Arrow to move between tabs and Home/End for the first/last tab. Disclosures keep their source details accessible by keyboard, and reduced-motion preferences are honored.

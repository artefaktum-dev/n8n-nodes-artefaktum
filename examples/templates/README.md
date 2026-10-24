# Templates

Three importable n8n workflows that show the patterns Artefaktum is good at. In n8n use Import from File, then pick your Artefaktum API credential on each Artefaktum node.

## Cache an expensive step (`cache-expensive-step.json`)

Get looks for today's result by key and returns `found: false` instead of failing when there is none. Only then does the expensive step run (here an HTTP request to Open-Meteo), and Upload stores its result under the same key with If Key Exists = Add New Version. The next run within the hour reads the stored text and skips the request.

## Nightly report, latest wins (`nightly-report-latest-wins.json`)

A Schedule Trigger fetches the current Vilnius temperature, builds a one-line summary and uploads it under the fixed key `report:weather:vilnius`, adding a new version each night. A second branch starts from a Manual Trigger, reads the key back with Get and parses the latest report, so any workflow can ask for "the newest report" without knowing an id.

## Process each URL once (`process-each-url-once.json`)

Each item is uploaded under the key `seen:<url>` with If Key Exists = Reuse Existing and Max Age 0. The first time a URL is seen the output carries `cache: created`, on every later run `cache: hit`. An IF node sends only the created ones on to the real work and routes the rest to "Already processed".

## Submitting to n8n.io

Checklist for each template:

- Name it by the problem it solves, not by the node ("Cache an expensive step", not "Artefaktum Get and Upload").
- Keep the sticky note that explains the pattern in two sentences.
- Pick the categories that match the problem.
- The community node is listed by its npm name, `n8n-nodes-artefaktum`.

Submission waits for 0.3.0 to appear in n8n Cloud.

# Demo video workflow

Everything needed to record the n8n verification video: a fresh n8n, a seeded
Artefaktum project, and one workflow that covers install, credential test, the
most common operation and use as an AI agent tool.

## Story

A nightly-style pipeline collects a 3-day weather forecast for 46 European
capitals from [Open-Meteo](https://open-meteo.com), combines them into one
report and stores that report as a single artifact in Artefaktum. A chat agent
then finds the report, reads it and answers questions from it.

Needs version 0.3.0 or later of the node: the agent reads the file through
**Get** with **Output** set to **Text**.

| Node | What it does |
| --- | --- |
| European capitals | Emits 46 items: city, key slug, country, latitude, longitude. |
| Fetch forecast | One Open-Meteo request for all capitals (runs once, comma-separated coordinates), 3 days of daily values in each city's own timezone. |
| Build report | Combines the 46 forecasts into one report, plus a short description and highlights (warmest, coldest, wettest). |
| Store report | Artefaktum **Upload** with If Key Exists = Reuse Existing, key `forecast:european-capitals:<date>`, max age one hour. |
| AI Agent | Chat agent with two Artefaktum tools: *Search artifacts* (Search) and *Read artifact* (Get as Text). |

What goes where:

| Part of the artifact | Holds | Size in this demo |
| --- | --- | --- |
| File | The whole report: every capital, every day | about 23 KB of JSON |
| Description | What the report is and what it covers | about 240 characters |
| Metadata | Period, source, and the three highlights | about 250 bytes |

The description says what the artifact is; it does not repeat the content. The
agent searches by description, picks an artifact, and reads the file.

The first run uploads the report (`cache: "created"`). A second run within the
hour uploads nothing and returns the stored artifact (`cache: "hit"`, same ID).

| Run | Result | Time on a laptop |
| --- | --- | --- |
| First | 1 × `created` | about 2 s |
| Second | 1 × `hit` | about 1 s |
| One chat question | search, read, answer | 7 to 11 s |

An artifact is a whole result, not a row. Storing each capital separately
would mean 46 uploads of four HTTP calls each, run one after another: about a
minute for the same data.

## Before recording (once, off camera)

1. Seed the project and clear earlier demo runs:

   ```bash
   pip install artefaktum
   export ARTEFAKTUM_API_KEY=...
   python seed.py --reset
   ```

   `--reset` deletes the reports stored by earlier runs, so the first run on
   camera shows `cache: "created"`. It only touches artifacts whose key
   starts with `forecast:`, `weather:` or `weather-digest:`.

2. Start a fresh n8n: `./run-n8n.sh --fresh`. Create the owner account at
   http://localhost:5678. Do not install the node yet.

3. Have ready to paste: the Artefaktum API key (scopes `read`, `write`,
   `search`), an OpenAI API key, and the contents of `artefaktum-demo.json`.

## On camera (about 4 minutes, no cuts)

1. **Settings → Community Nodes → Install**: `n8n-nodes-artefaktum`. Show the
   version in the list matches the submitted one.
2. **New workflow**. Add an Artefaktum node from the node panel. In it, create
   the credential: paste the API key, click **Test**, show the green check.
   Delete that node again (the paste below adds its own).
3. Select the canvas and paste `artefaktum-demo.json`. Open each of the three
   Artefaktum nodes once so the credential is picked up; open **OpenAI Chat
   Model** and create the OpenAI credential.
4. **Execute workflow**. Open *Build report* to show 46 forecasts going in and
   one report coming out. Open *Store report*: `cache: "created"`, a short
   description, and the highlights as metadata. Execute again: `cache: "hit"`
   and the same artifact ID.
5. **Open chat** and ask, for example:
   - *Should I take an umbrella in Dublin tomorrow? And how warm will it get in Oslo?*
   - *Which European capital will be the warmest over the next three days?*

   In the execution log, show the agent calling *Search artifacts*, then
   *Read artifact*, then answering with the title of the artifact it read.

## Notes

- Upload returns `status: "processing"` for a few seconds while search
  metadata is derived, so leave a moment between the first run and the chat.
- *Fetch forecast* makes a single request on purpose. Open-Meteo rejects bursts
  of parallel requests with HTTP 429 "Too many concurrent requests".
- The agent's system message starts with today's and tomorrow's date, built with
  `$now`. A language model has no clock, and a small model is unreliable at
  working out "tomorrow" by itself once the tool results get long.
- n8n does not pass binary files to AI agents, so *Read artifact* uses
  **Output: Text**, which returns the file content in the `content`
  field. **Max Characters** (default 50,000) caps it; the report is about
  23,000 characters, so it is returned whole.
- Community nodes only show up as agent tools when n8n runs with
  `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` (`run-n8n.sh` sets it).

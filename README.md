# n8n-nodes-artefaktum

This is an n8n community node for [Artefaktum](https://artefaktum.dev), a
service that stores artifacts — files plus the metadata needed to find them
and judge whether they are still current — so workflows and AI agents can
hand results to each other instead of recomputing them.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## Installation

**Self-hosted n8n**: run `npm install n8n-nodes-artefaktum` in your n8n
custom nodes directory, or install it from n8n's UI under
**Settings → Community Nodes**. See the
[installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
for details.

**n8n Cloud**: the node will be installable directly from the Cloud node
panel once it has passed n8n's community node verification.

## Operations

The node has five operations: **Upload**, **Get**, **Search**, **Update** and
**Delete**. **Operation** is the first field.

The **Project** field's "From List" mode lists the projects in your account;
every account also has a project with slug `default`, which is the default and
can also be entered in Slug mode.

### Upload

Store a file or text as a new artifact, or as a new version of the artifact
under a key.

| Parameter | Description |
| --- | --- |
| Project | The project the artifact belongs to. Defaults to the slug `default`. |
| Input Data Source | *Binary File* (a binary property of the input item) or *Text* (text or JSON built with an expression). |
| Input Binary Field | Name of the binary property that holds the file (binary source). |
| Content | The text to store (text source). |
| Title | What the artifact is; searched by other agents. Defaults to the file name. |
| Key | Optional. Your own unique key for this artifact within the project, e.g. `report:sales:2026-10-24` or a source URL. |
| If Key Exists | Appears once Key is set. *Stop With Error* (default), *Add New Version*, or *Reuse Existing*. |
| Max Age (Seconds) | With *Reuse Existing*: reuse the stored artifact only if it is younger than this. `0` accepts any age. |
| Options → Description | Longer description; searched semantically. |
| Options → Tags | Comma-separated tags. |
| Options → Metadata (JSON) | Structured metadata, searchable by filters. |
| Options → Expires In (Hours) | Delete the artifact automatically after this many hours. `0` keeps it. |
| Options → File Name | Stored file name. Defaults to the binary file name, or a generated name for text. |
| Options → Content Type | MIME type. Defaults to the binary file type, or `text/plain` for text. |

Without a Key, or with *Stop With Error*, Upload creates a new artifact and
fails if the key is already taken. *Add New Version* stores the file as a new
version of the artifact with that key (creating it if there is none), so the
key always points at the latest. *Reuse Existing* returns the stored artifact
without uploading when one with that key exists and is fresh enough
(`cache: "hit"` in the output); otherwise it uploads and returns the new one
(`cache: "created"`).

Upload returns the artifact with `status: "processing"` for a few seconds
while Artefaktum finishes deriving search metadata; Search only finds it once
its status is `ready`.

### Get

Fetch one artifact: its details, its file, or its text.

| Parameter | Description |
| --- | --- |
| Lookup | Find the artifact *By ID* (default) or *By Key*. |
| Artifact ID | The artifact ID, e.g. from a previous Artefaktum node (By ID). |
| Key | The key to look up (By Key). |
| Project | The project to resolve the key in (By Key). |
| Max Age (Seconds) | By Key: an artifact last updated longer ago than this counts as not found. `0` accepts any age. |
| If Not Found | By Key: *Stop With Error* (default) or *Return `found: false`*. |
| Output | *Binary File* (default) puts the file into a binary property. *Text* puts the content into the `content` field, for text files such as JSON, CSV or Markdown; it reads files of at most 25 MB and refuses larger ones and non-text ones before downloading anything. *Details Only* returns the artifact without its file. |
| Options → Put Output File in Field | Name of the binary property to write the file to (Binary File). |
| Options → File Name | Override the file name on the binary property (Binary File). |
| Options → Max Characters | Cut the content after this many characters (Text; default 50,000; `0` returns everything). The output reports `content_truncated` and `content_characters`. |
| Options → Verify Checksum | Whether to compare the downloaded bytes against the stored SHA-256 (Binary File, Text). |
| Options → Version ID | A specific version; defaults to the latest (Binary File, Text). |
| Options → Simplify | Whether to return a simplified version of the artifact instead of the raw data. On by default. |

A lookup By Key adds `found: true` to the output. When nothing matches (or the
artifact is older than Max Age) and If Not Found is *Return `found: false`*, the
output is `{ "found": false, "key": …, "project_id": …, "reason": … }` and no
binary file. Text output adds `content`, `content_truncated`,
`content_characters` and `content_version_id`, the id of the version that was
actually read.

### Search

Find artifacts by meaning, keywords, tags and filters. Leave Query empty to
list by filters only.

| Parameter | Description |
| --- | --- |
| Project | The project to search. Defaults to the slug `default`. |
| Query | What you are looking for, in words. |
| Return All | Whether to return all results or only up to a given limit. |
| Limit | Max number of results to return. |
| Filters → Content Types | Comma-separated MIME types. |
| Filters → Created After / Created Before | Restrict results to a date range. |
| Filters → Include Superseded | Whether to include artifacts that a newer artifact supersedes. |
| Filters → Tags (All Of) | Comma-separated; every tag must match. |
| Options → Search Mode | Hybrid (keyword and meaning combined, default), Semantic (by meaning) or Text (by keywords). |
| Options → Simplify | Whether to return a simplified version of the response instead of the raw data. On by default. |

### Update

Change an artifact's title, description, tags, metadata or expiry.

| Parameter | Description |
| --- | --- |
| Lookup, Artifact ID, Key, Project | Find the artifact By ID or By Key, as in Get. A missing artifact is an error. |
| Update Fields → Title, Description, Tags, Metadata (JSON) | Replace the corresponding field. |
| Update Fields → Expires At | Set a new expiry. |
| Update Fields → Clear Expiry | Whether to remove the expiry so the artifact is kept. |

An empty value under **Update Fields** is ignored — leave a field empty to
keep it unchanged. Clearing description or metadata back to empty is not
supported yet.

### Delete

| Parameter | Description |
| --- | --- |
| Lookup, Artifact ID, Key, Project | Find the artifact By ID or By Key, as in Get. A missing artifact is an error. |

## Credentials

Mint an API key in the [Artefaktum console](https://artefaktum.dev/console/)
and paste it into the node credential's **API Key** field. Choose the scopes
the workflow actually needs: `read`, `write`, `search`, and `delete` — only
grant `delete` if the workflow deletes artifacts. Update and Delete read the
artifact first, so their key needs `read` as well as `write`/`delete`.

**Base URL** defaults to `https://api.artefaktum.dev` and only needs to
change for a self-hosted Artefaktum instance.

## Compatibility

Requires n8n 1.0 or later. Tested against n8n 1.x images
(`n8nio/n8n:latest`, September 2026) and Node.js 20, 22 and 24. No runtime
dependencies.

## Usage

### Patterns

Three workflows cover most uses. Each is built from the nodes shown, with no
error-handling trick.

**Cache an expensive step.** Skip the step entirely when today's result is
already stored.

> Manual Trigger → **Get** (Lookup = By Key, Key `weather:vilnius:{{ $now.toFormat('yyyy-LL-dd') }}`,
> Max Age `3600`, If Not Found = Return `found: false`, Output = Text) → **IF**
> `{{ $json.found }}` → true: use `{{ JSON.parse($json.content) }}`; false: the
> expensive step (for example an HTTP Request) → **Upload** (same Key, text
> content, If Key Exists = Add New Version).

If Key Exists = Add New Version matters because a stale copy (older than Max
Age) still holds the key: the new result becomes its latest version instead of
failing as a duplicate.

See [`examples/templates/cache-expensive-step.json`](examples/templates/cache-expensive-step.json)
for the complete workflow.

**Nightly report, latest wins.** Each run stores a new version under one key.

> Build report → **Upload** (Key `report:sales`, If Key Exists = Add New
> Version). Consumers read it with **Get** (Lookup = By Key, Key `report:sales`).

**Process each item once.** Do the work only for items you have not seen.

> **Upload** (Key = the item's URL, If Key Exists = Reuse Existing) → **IF**
> `{{ $json.cache }}` equals `created` → do the work.

### Letting an AI agent read an artifact

n8n does not pass binary files to AI agents, so an agent that uses **Get** with
the default output sees only the artifact's metadata. Give the agent two
Artefaktum tools instead:

1. **Search** to find. Let the model fill **Query**.
2. **Get** with **Output** set to **Text** to read. Let the model fill
   **Artifact ID** with an ID from the search results.

The agent searches, picks the artifact that fits, and reads it. Text works for
text files such as JSON, CSV, Markdown and plain text; for anything else the tool
answers with a message naming the content type. Only UTF-8 is decoded; bytes
that are not valid UTF-8 appear as the replacement character (`�`). Files over
25 MB cannot be read as text at all — the tool refuses before downloading
anything. Long files are cut at **Max Characters** and the output says so,
which keeps a large file from filling the model's context. The output also
carries `content_version_id`, the id of the version that was actually read.

### Limits

Artefaktum enforces per-plan quotas — storage, request rate and artifact
count — see [pricing](https://artefaktum.dev/pricing/) for the current
limits, plus a per-file size limit: 100 MB on the Free plan, 5 GB on Pro.
When a quota is exceeded the API returns `quota_exceeded` as the error text.

In practice the node's own memory use is the tighter constraint on small
n8n instances: it buffers each file fully in memory for both upload and
download, roughly 2–3× the file size per item. Keep individual files to
tens of MB and avoid large batches when running n8n with limited memory.
Text mode therefore refuses files over 25 MB.

Search results are ordered by relevance; there is no sort option because
the Artefaktum API ranks results itself.

Artefaktum also limits field sizes: a title is at most 500 characters, a description
10,000, a tag 64, and metadata 16 KB of JSON nested at most 5 levels deep, with at most
50 tags per artifact. See the [API limits](https://artefaktum.dev/docs/rest/#limits).

## Templates

Importable workflows live in [`examples/templates/`](examples/templates/README.md):

- [Cache an expensive step](examples/templates/cache-expensive-step.json)
- [Nightly report, latest wins](examples/templates/nightly-report-latest-wins.json)
- [Process each URL once](examples/templates/process-each-url-once.json)

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Artefaktum](https://artefaktum.dev)
- [Artefaktum pricing](https://artefaktum.dev/pricing/)
- [Artefaktum TypeScript SDK](https://www.npmjs.com/package/artefaktum)

## Version history

- **0.3.0**: Five operations — Upload, Get, Search, Update, Delete — with
  Operation as the first field. Breaking: the Resource picker and
  Project → Get Many are gone; Get or Upload is now Upload with If Key Exists =
  Reuse Existing; Download is now Get with Output = Binary File or Text; Get Many
  is now Search; External Key is now Key. Workflows saved with 0.2.0 must be
  rebuilt. New: Get By Key with Max Age and If Not Found, If Key Exists on
  Upload, Output = Details Only.
- **0.2.0**: Download can return text for AI agents (Output Format);
  Summary option removed.
- **0.1.3**: Package author contact updated.
- **0.1.2**: Simplify parameter on Get and Get Many; project picker now
  defaults to the list ("From List") instead of the `default` slug.
- **0.1.1**: Repository moved to the artefaktum-dev organisation; first
  release published with npm provenance.
- **0.1.0**: Initial release.

## Development

```bash
npm install     # install dependencies
npm test        # unit tests (the live test skips without ARTEFAKTUM_TEST_API_KEY)
npm run lint
npm run build   # build to dist/
```

`npm run dev` starts n8n with the node linked. It needs Node ≥ 24 and installs n8n on
first use, which can take a long time. A reliable alternative is n8n from Docker with
the built package installed into n8n's nodes directory:

```bash
npm run build && npm pack                       # produces n8n-nodes-artefaktum-<version>.tgz
mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install /path/to/n8n-nodes-artefaktum-<version>.tgz
docker run -it --rm -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n:latest
```

Do not use `N8N_CUSTOM_EXTENSIONS`: it registers the node under the package name
`CUSTOM`, so workflows referencing `n8n-nodes-artefaktum.artefaktum` will not load.

Releases are cut by pushing a version tag; see `npm run release`.

## License

[MIT](LICENSE)

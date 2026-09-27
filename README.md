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

### Artifact

The **Project** field's "From List" mode lists the projects in your
account; every account also has a project with slug `default`, which you
can also enter directly in Slug mode.

| Parameter | Applies to | Description |
| --- | --- | --- |
| Project | Upload, Get or Upload, Get Many, Get | The project the artifact belongs to. Every tenant has a project with slug `default`. |
| External Key | Get or Upload | The key that identifies this result. If an artifact with this key exists and is fresh enough, it is returned instead of uploading. |
| Max Age (Seconds) | Get or Upload | Reuse the stored artifact only if it is younger than this. `0` accepts any age. |
| Input Data Source | Upload, Get or Upload | Upload the file held in a binary property of the input item, or text/JSON built with an expression. |
| Input Binary Field | Upload, Get or Upload (binary source) | Name of the binary property that holds the file. |
| Content | Upload, Get or Upload (text source) | The text to store, built with an expression if needed. |
| File Name | Upload, Get or Upload | Stored file name. Defaults to the binary file name, or a generated name for text. |
| Content Type | Upload, Get or Upload | MIME type. Defaults to the binary file type, or `text/plain` for text. |
| Title | Upload, Get or Upload | What the artifact is. Searched by other agents. Defaults to the file name. |
| Options → Description | Upload, Get or Upload | Longer description; searched semantically. |
| Options → Expires In (Hours) | Upload | Delete the artifact automatically after this many hours. `0` keeps it. |
| Options → External Key | Upload | Your own unique key for this artifact within the project, e.g. a source URL or a hash. |
| Options → Metadata (JSON) | Upload, Get or Upload | Structured metadata, searchable by filters. |
| Options → Tags | Upload, Get or Upload | Comma-separated tags. |
| Lookup | Get | Find the artifact by ID or by External Key. |
| Artifact ID | Download, Update, Delete, Get (Lookup = By ID) | The artifact ID, e.g. from a previous Artefaktum node in this workflow. |
| Output Format | Download | *Binary File* puts the file into a binary property. *Text* puts the content into the `content` field, for text files such as JSON, CSV or Markdown. |
| External Key | Get (Lookup = By External Key) | The external key to look up. |
| Project | Get | The project to resolve the external key against (used when Lookup = By External Key). |
| Download Options → File Name | Download (Binary File) | Override the file name on the binary property. |
| Download Options → Put Output File in Field | Download (Binary File) | Name of the binary property to write the file to. |
| Download Options → Max Characters | Download (Text) | Cut the content after this many characters (default 50,000; 0 returns everything). The output reports `content_truncated` and `content_characters`. |
| Download Options → Verify Checksum | Download | Whether to compare the downloaded bytes against the stored SHA-256. |
| Download Options → Version ID | Download | A specific version; defaults to the latest. |
| Query | Get Many | What you are looking for, in words. Leave empty to list by filters only. |
| Search Mode | Get Many | Hybrid (keyword and meaning combined), Semantic (by meaning) or Text (by keywords). |
| Return All | Get Many | Whether to return all results or only up to a given limit. |
| Limit | Get Many | Max number of results to return. |
| Simplify | Get, Get Many | Whether to return a simplified version of the response instead of the raw data. On by default. |
| Filters → Content Types | Get Many | Comma-separated MIME types. |
| Filters → Created After / Created Before | Get Many | Restrict results to a date range. |
| Filters → Include Superseded | Get Many | Whether to include artifacts that a newer artifact supersedes. |
| Filters → Tags (All Of) | Get Many | Comma-separated; every tag must match. |
| Update Fields → Title, Description, Tags, Metadata (JSON) | Update | Replace the corresponding field. |
| Update Fields → Expires At | Update | Set a new expiry. |
| Update Fields → Clear Expiry | Update | Whether to remove the expiry so the artifact is kept. |

An empty value under **Update Fields** is ignored — leave a field empty to
keep it unchanged. Clearing description or metadata back to empty is not
supported yet.

Operations: **Upload**, **Get or Upload**, **Download**, **Get**,
**Get Many**, **Update**, **Delete**.

Upload returns the artifact with `status: "processing"` for a few seconds
while Artefaktum finishes deriving search metadata; Get Many only finds it
once its status is `ready`.

### Project

| Parameter | Applies to | Description |
| --- | --- | --- |
| — | Get Many | Lists the projects of your tenant. No parameters beyond Resource/Operation. |

## Credentials

Mint an API key in the [Artefaktum console](https://artefaktum.dev/console/)
and paste it into the node credential's **API Key** field. Choose the scopes
the workflow actually needs: `read`, `write`, `search`, and `delete` — only
grant `delete` if the workflow deletes artifacts.

**Base URL** defaults to `https://api.artefaktum.dev` and only needs to
change for a self-hosted Artefaktum instance.

## Compatibility

Requires n8n 1.0 or later. Tested against n8n 1.x images
(`n8nio/n8n:latest`, September 2026) and Node.js 20, 22 and 24. No runtime
dependencies.

## Usage

### Get or Upload (caching)

Get or Upload always needs the content, because the API requires
`size_bytes` to resolve the key — so to skip an expensive step entirely,
call **Get** by external key first and branch on whether it succeeds. Use
**Get or Upload** instead when you want a stable stored copy and
de-duplication: give it an **External Key** that identifies the result (for
example `weather:vilnius:2026-09-23`) and a **Max Age (Seconds)**; if an
artifact with that key exists and is younger than the max age, it is
returned as-is (`cache: "hit"` in the output), otherwise the content you
provide is uploaded and stored under that key (`cache: "created"`).

See [`examples/cache-api-response.json`](examples/cache-api-response.json)
for a complete workflow: Manual Trigger → HTTP Request (a weather API) →
Artefaktum (Get or Upload), caching the response for an hour under a
per-day key.

### Letting an AI agent read an artifact

n8n does not pass binary files to AI agents, so an agent that uses **Download** with
the default output sees only the artifact's metadata. Give the agent two Artefaktum
tools instead:

1. **Get Many** to search. Let the model fill **Query**.
2. **Download** with **Output Format** set to **Text** to read. Let the model fill
   **Artifact ID** with an ID from the search results.

The agent searches, picks the artifact that fits, and reads it. Text works for
text files such as JSON, CSV, Markdown and plain text; for anything else the tool
answers with a message naming the content type. Long files are cut at
**Max Characters** and the output says so, which keeps a large file from filling the
model's context.

### Limits

Artefaktum enforces per-plan quotas — storage, request rate and artifact
count — see [pricing](https://artefaktum.dev/pricing/) for the current
limits, plus a per-file size limit: 100 MB on the Free plan, 5 GB on Pro.
When a quota is exceeded the API returns `quota_exceeded` as the error text.

In practice the node's own memory use is the tighter constraint on small
n8n instances: it buffers each file fully in memory for both upload and
download, roughly 2–3× the file size per item. Keep individual files to
tens of MB and avoid large batches when running n8n with limited memory.

Search results are ordered by relevance; there is no sort option because
the Artefaktum API ranks results itself.

Artefaktum also limits field sizes: a title is at most 500 characters, a description
10,000, a tag 64, and metadata 16 KB of JSON nested at most 5 levels deep, with at most
50 tags per artifact. See the [API limits](https://artefaktum.dev/docs/rest/#limits).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Artefaktum](https://artefaktum.dev)
- [Artefaktum pricing](https://artefaktum.dev/pricing/)
- [Artefaktum TypeScript SDK](https://www.npmjs.com/package/artefaktum)

## Version history

- **0.2.0**: Download can return text for AI agents (Output Format);
  Summary option removed.
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

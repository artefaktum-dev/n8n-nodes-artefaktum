# Changelog

## 0.3.0 — 2026-10-24

Breaking: the operations were redesigned around five verbs. Workflows saved with 0.2.0 must be rebuilt; the repo example and the demo video workflow are rewritten for this release.

- The Resource picker is gone; **Operation** is the first field.
- `Project → Get Many` is removed. The Project field's From List mode still lists your projects.
- `Get or Upload` is removed. Use **Upload** with **If Key Exists** = Reuse Existing.
- `Download` is removed. Use **Get** with **Output** = Binary File or Text.
- `Get Many` is renamed **Search**; its internal value changes from `getMany` to `search`.
- `External Key` is renamed **Key** everywhere; the parameter name changes from `externalKey` to `key`.
- File Name and Content Type (Upload) and Search Mode (Search) move into Options.
- Get's default **Output** is now Binary File; 0.2.0's Get returned details only. Set Output = Details Only for the old behaviour.
- **Simplify** moved from a top-level parameter into Get Options and Search Options, and now also applies to the JSON half of Binary File and Text output. `latest_version.*` expressions on old Download output return nothing.
- Update and Delete accept a **Key** as well as an Artifact ID.

New:

- Upload has an optional top-level **Key** and **If Key Exists**: Stop With Error, Add New Version, or Reuse Existing (with **Max Age**, output `cache: "hit"` or `"created"`).
- Get can look an artifact up **By Key**, with **Max Age** and **If Not Found** = Return `found: false`, so a workflow can branch on a cache miss and skip the expensive step.
- Get has **Output** = Binary File, Text or Details Only.
- Project defaults to the slug `default` on every operation.
- `examples/cache-api-response.json` is replaced by `examples/cache-expensive-step.json`, which skips the expensive step on a cache hit.

## 0.2.0 — 2026-09-28

- Download has a new **Output Format**: *Binary File* (the default, as before) or *Text*. Text puts the file content into the `content` field of the output, so an AI agent can read an artifact. n8n does not pass binary files to agents.
- New Download option **Max Characters** (default 50,000) caps the text; the output reports `content_truncated` and `content_characters`.
- Text output also reports `content_version_id`, the id of the version that was actually read.
- Text refuses non-text files, and files over 25 MB, before downloading anything.
- Removed the **Summary** option from Upload. The Artefaktum API no longer stores a summary, and the option's claim that the server would derive one was wrong. Workflows that still have it set keep working on this version; the value is no longer sent. The API refuses an upload that sends a summary, so versions up to 0.1.3 fail when Summary is set. The API also no longer returns `summary` on versions, so an expression such as `{{ $json.latest_version.summary }}` now yields nothing.

## 0.1.3 — 2026-09-23

- Package author contact set to support@artefaktum.dev.

## 0.1.2 — 2026-09-23

- Added a Simplify parameter to Get and Get Many, on by default, returning a smaller set of stable fields instead of the raw API response.
- The Project picker now defaults to "From List" instead of the `default` slug.
- README restructured to follow n8n's community node documentation template.

## 0.1.1 — 2026-09-23

- Repository moved to the artefaktum-dev organisation; package metadata and provenance now point there.
- First release published from GitHub Actions with npm provenance.

## 0.1.0 — 2026-09-23

Initial release of the Artefaktum node.

- Artifact: Upload, Get or Upload, Download, Get, Get Many, Update, Delete
- Project: Get Many
- Artefaktum API credential (API key, optional self-hosted Base URL)
- Usable as an AI agent tool

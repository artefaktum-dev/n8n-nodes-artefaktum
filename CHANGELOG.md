# Changelog

## 0.2.0 — 2026-09-27

- Download has a new **Output Format**: *Binary File* (the default, as before) or *Text*. Text puts the file content into the `content` field of the output, so an AI agent can read an artifact. n8n does not pass binary files to agents.
- New Download option **Max Characters** (default 50,000) caps the text; the output reports `content_truncated` and `content_characters`.
- Text output also reports `content_version_id`, the id of the version that was actually read.
- Text refuses non-text files, and files over 25 MB, before downloading anything.
- Removed the **Summary** option from Upload. The Artefaktum API no longer stores a summary, and the option's claim that the server would derive one was wrong. Workflows that still have it set keep working; the value is ignored. The API also no longer returns `summary` on versions, so an expression such as `{{ $json.latest_version.summary }}` now yields nothing.

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

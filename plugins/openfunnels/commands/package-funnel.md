---
description: Validate a funnel directory against the OpenFunnels package spec and zip it for upload
---

Package the funnel in $ARGUMENTS (or the current directory if no argument was
given) into an upload-ready OpenFunnels .zip.

1. Run the validator:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-funnel.mjs" <funnel-dir>`
2. If there are ERRORs, fix them in the source files (consult the
   funnel-packager skill and its FUNNEL-PACKAGE-SPEC.md reference for the
   rules), then re-run until clean. Report WARNs to the user with a one-line
   explanation of what each one means in practice — do not silently ignore
   them, but they don't block packaging.
3. Zip the directory contents (not a wrapping folder) to `<dir-name>.zip`
   next to the directory, excluding `.DS_Store`, `Thumbs.db`, `__MACOSX`,
   `.git` and any existing `*.zip`.
4. Confirm the zip is under 25 MB and report: path, size, file count, pages
   found, whether it contains a split test (`index-b.html`), `funnel.json`
   or `tracking.md`.

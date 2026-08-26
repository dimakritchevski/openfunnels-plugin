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
   `.git` and any existing `*.zip`. Use a method that cannot include the
   parent folder — on Windows,
   `[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dest, $level, $false)`
   (the `$false` is `includeBaseDirectory`); on Unix,
   `cd <dir> && zip -r ../<dir-name>.zip .` — PowerShell's
   `Compress-Archive -Path "dir\*"` is NOT reliable for this and has produced
   wrapped zips.
4. **Verify the zip root** by listing the archive's top-level entries:
   - Single funnel: `index.html` must be at the zip root.
   - Bundle (one folder per funnel): the root entries must be exactly the
     funnel slug folders — a single wrapping folder means the import will
     fail; rebuild the zip.
5. Confirm the zip is under 25 MB (50 MB for a bundle) and report: path,
   size, file count, pages found, whether it contains a split test
   (`index-b.html`), `funnel.json` or `tracking.md`.

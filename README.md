# OpenFunnels Skills

Claude Code plugin marketplace for the OpenFunnels team. One install, always
up to date — the funnel package spec and packaging tools ship as a plugin
that tracks this repo.

## Install (once)

In Claude Code:

```
/plugin marketplace add dimakritchevski/openfunnels-skills
/plugin install openfunnels@openfunnels-skills
```

You need read access to this repo (it's private) — your normal GitHub
authentication is used to clone it.

## Update

Claude Code checks the marketplace for new versions; you can force it any
time with:

```
/plugin update openfunnels
```

## What's inside

| Component | What it does |
|---|---|
| `funnel-packager` skill | The full funnel package spec (v1) — Claude follows it automatically whenever you build or edit OpenFunnels pages. |
| `/package-funnel [dir]` | Validates a funnel directory against the spec (same rules as the platform's upload validation) and zips it ready for upload. |

More skills (landing-page design, copywriting) will land here as they're
written — they arrive via the same plugin update, nothing new to install.

## Source of truth

`plugins/openfunnels/skills/funnel-packager/references/FUNNEL-PACKAGE-SPEC.md`
is a **mirror** of `FUNNEL-PACKAGE-SPEC.md` in the OpenFunnels platform repo,
synced by `scripts/sync-spec.ps1` there. Don't edit the mirror here — change
the platform copy and sync.

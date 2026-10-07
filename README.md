# OpenFunnels Plugin

Claude Code plugin marketplace for the OpenFunnels team. One install, always
up to date — the funnel package spec and packaging tools ship as a plugin
that tracks this repo.

## Install (once)

In Claude Code:

```
/plugin marketplace add dimakritchevski/openfunnels-plugin
/plugin install openfunnels@openfunnels-plugin
```

You need read access to this repo (it's private) — your normal GitHub
authentication is used to clone it.

## Update (important)

Plugins from a private GitHub marketplace like this one do **not** update
themselves unless auto-update is switched on. Turn it on once, or you'll keep
running an old copy of the spec:

1. In Claude Code run `/plugin`, open **Marketplaces**, pick
   `openfunnels-plugin` and enable auto-update.

To update by hand at any time:

```
/plugin marketplace update openfunnels-plugin
/plugin update openfunnels
```

Restart Claude Code after updating. Check your version with
`/plugin` (installed plugins list): it should match `version` in
`plugins/openfunnels/.claude-plugin/plugin.json`.

## What's inside

| Component | What it does |
|---|---|
| `funnel-packager` skill | The full funnel package spec (v1) — Claude follows it automatically whenever you build or edit OpenFunnels pages. |
| Prompt hook | When your message mentions OpenFunnels, landing pages or funnels, it reminds Claude to load `funnel-packager` before building. Makes the skill trigger reliably even with lots of other skills installed. |
| `/package-funnel [dir]` | Validates a funnel directory against the spec (same rules as the platform's upload validation) and zips it ready for upload. |

More skills (landing-page design, copywriting) will land here as they're
written — they arrive via the same plugin update, nothing new to install.

## Source of truth

`plugins/openfunnels/skills/funnel-packager/references/FUNNEL-PACKAGE-SPEC.md`
is a **mirror** of `FUNNEL-PACKAGE-SPEC.md` in the OpenFunnels platform repo,
synced by `scripts/sync-spec.ps1` there. Don't edit the mirror here — change
the platform copy and sync.

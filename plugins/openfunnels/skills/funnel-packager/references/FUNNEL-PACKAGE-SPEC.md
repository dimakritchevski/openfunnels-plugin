# Funnel Package Format — v1

A funnel package is a plain **.zip** of static files. It is the contract between
page generation (Claude) and the platform. Uploads are validated against this
spec; violations are rejected with a clear error.

## Structure

- `index.html` **must** exist at the zip root (a single wrapping top-level
  folder is tolerated and stripped automatically).
- Other pages route by filename: `thank-you.html` → `/thank-you`,
  `pricing/index.html` → `/pricing/`. A page's public path can be changed
  later in the admin (funnel → Steps → Pages & URLs) without touching the
  package; the filename path then redirects to the new one, so relative links
  inside the package keep working. The funnel's own URL path (its folder on
  the client domain) is set when the funnel is created and editable there too.
- `404.html` at the root, if present, is served for unknown paths.
- All asset references must be **relative** paths (`assets/style.css`,
  `images/hero.webp`) — never root-relative (`/images/…`), because preview URLs
  mount the funnel under a path prefix (`client.openfunnels.app/<funnel>/`).
  Root-relative is reserved for `/_platform/*` and `data-redirect` targets,
  which the platform remounts automatically. No external CDNs for critical
  rendering.
- `__MACOSX/`, `.DS_Store`, `Thumbs.db` are ignored.

## Forms (leads)

- A lead-capture form is marked `<form data-lead data-redirect="/thank-you">`.
  The injected platform snippet submits it to the lead API and redirects on
  success. Forms without `data-lead` are not captured (upload warns).
- No-JS fallback: `action="/_platform/lead" method="POST"` behaves identically.
- Include the honeypot field in every lead form:
  `<input name="company_website" class="hp" tabindex="-1" autocomplete="off">`
  (hide `.hp` off-screen in CSS — do not use `display:none`).

## Review funnels (`"kind": "review"`)

A **review funnel** is the third funnel kind (after landing pages and forms):
staff send a customer a review request, happy customers go to Google, unhappy
ones leave private feedback. It is an ordinary v1 package with fixed page
names and one extra form marker; declare it with `"kind": "review"` in
`funnel.json` (or pick "Review funnel" when adding the funnel by hand).

| Page | Who sees it | Purpose |
|---|---|---|
| `index.html` | staff | the send form: `first_name`, `email`, `phone` |
| `sent.html` | staff | "request sent" + a link back to `./` |
| `review-page.html` | customer | "Did you have a great experience?" → **Yes** links to `yes`, **No** links to `no` |
| `yes.html` | customer | link to the review platform (Google's write-a-review URL) |
| `no.html` | customer | private feedback form (an ordinary lead form, see below) |
| `thanks.html` | customer | feedback received |

`index.html`, `review-page.html`, `yes.html` and `no.html` are required for a
review funnel; the platform routes them by filename like any other page. Link
between them with **relative** hrefs (`yes`, `no`, `./`), never `/yes`.

**The send form** is marked `data-review-request`, not `data-lead`:

```html
<form data-review-request data-redirect="/sent"
      action="/_platform/review-request" method="POST">
  <input name="first_name" placeholder="Client's first name">
  <input name="email" type="email" required>
  <input name="phone" type="tel" required>
  <input name="company_website" class="hp" tabindex="-1" autocomplete="off">
  <p class="error" data-error hidden></p>
  <button type="submit">Send review request</button>
</form>
```

- On submit the platform stores the request (visible on the funnel's
  **Requests** tab, never in Leads) and sends the **customer** an SMS and an
  email carrying a link to this funnel's `/review-page` on the same host the
  request was sent from. The client's own lead recipients are not notified.
- `data-redirect` defaults to `/sent`. The honeypot is required as for lead
  forms. The no-JS fallback `action` is remounted like `/_platform/lead`.
- An optional element with `data-error` inside the form receives validation
  messages (bad phone, daily cap hit); without one the browser alerts.
- Phone numbers are normalised to E.164 (Australian `04xx` accepted); an
  invalid number or email is rejected with a message, not sent.
- Caps: 20 requests per IP per 10 minutes, 100 per funnel per hour, 3 per
  customer per day. Keep the index page URL unlisted; it has no login.

**The feedback form** on `no.html` is a normal lead form
(`<form data-lead data-form="review-feedback" data-redirect="/thanks">`).
On a review funnel its submissions are worded as "review feedback" in email
and Slack, are never texted, and appear on the **Feedback** tab.

**Message templates** live in `funnel.json` under `"review"` and can be edited
later on the funnel's Settings tab. Placeholders: `{first_name}` (blank →
"there"), `{business}` (the client's name), `{link}` (the review page URL).
Keys are merged over the funnel's stored templates on deploy; omit a key to
leave it alone. SMS is forced to GSM-7 and cut at 459 characters, so keep it
plain and short and always include `{link}`.

```json
{
  "kind": "review",
  "steps": [
    { "name": "Review page",   "path": "/review-page" },
    { "name": "Happy (Yes)",   "path": "/yes" },
    { "name": "Unhappy (No)",  "path": "/no" },
    { "name": "Feedback sent", "path": "/thanks" }
  ],
  "goal": "step:/yes",
  "review": {
    "sms": "Hi {first_name}, thanks for choosing {business}. Would you mind sharing how your experience was? It takes under a minute: {link}",
    "email_subject": "How was your experience with {business}?",
    "email_body": "Hi {first_name},\n\nThank you for choosing {business}. ...\n\n{link}\n\nKind regards,\n{business}"
  }
}
```

In the email body, blank lines start a new paragraph and a line holding only
`{link}` renders as a button. Set `goal` to `step:/yes` so the funnel's
conversion is "the customer said they were happy"; step analytics then show
requests → review page → yes / no.

## Editable-content markers (`data-edit` / `data-section`)

Mark every piece of content a human might later want to change — headlines,
subheads, CTA labels, offer/price lines, testimonial quotes, guarantee copy —
with a `data-edit` attribute, and wrap each major page region in a
`data-section`:

```html
<section data-section="hero" id="hero">
  <h1 data-edit="hero-headline">Protect Your Home, Your Relationship With
    Your Children and Your Financial Future</h1>
  <p data-edit="hero-sub">Divorce can quickly put everything you care about
    at risk…</p>
  <button type="submit" data-edit="cta-primary">Book My One-Hour Consultation</button>
</section>
```

Rules:

- Names are kebab-case, unique within the page, prefixed by their section:
  `hero-headline`, `hero-sub`, `benefits-1`, `faq-3-answer`, `cta-primary`.
- Put `data-edit` on the element that OWNS the text (the `h1`, the `p`, the
  `button`) — never on a wrapper `div`, and never split one sentence across
  two marked elements.
- Keep a marked element's text as **one text node — no element children**. The
  editor's click-to-edit refuses any element that has child elements (editing
  mixed content as plain text would mangle the markup), so text that shares
  its parent with an element sibling silently loses inline editing. When one
  visual block holds two texts — an eyebrow + a headline, a price + a suffix —
  give EACH its own element with its own `data-edit`, and never leave editable
  text as a bare text node beside an element:

  ```html
  <!-- WRONG — the headline is a bare text node next to the span, so it is
       selectable but NOT click-editable: -->
  <h1 data-edit="hero-headline"><span class="eyebrow" data-edit="hero-eyebrow">Facing divorce?</span>
    Protect Your Home</h1>

  <!-- RIGHT — two single-text-node elements, both click-editable: -->
  <h1><span class="eyebrow" data-edit="hero-eyebrow">Facing divorce?</span>
    <span data-edit="hero-headline">Protect Your Home</span></h1>
  ```

  In long body copy an inline `<strong>` accent is tolerated — but know the
  cost: that paragraph can then only be edited through chat, not by clicking.
- Minimum per page: hero headline, hero subhead, and the primary CTA marked.
- Section names from this set where they apply: `hero`, `trust`, `benefits`,
  `how-it-works`, `testimonials`, `faq`, `cta`, `footer`.

Why: the in-app variation editor (natural-language + click-to-select edits)
targets elements by these markers. Unmarked pages still work — the editor
falls back to positional selectors — but marked pages give precise,
unambiguous edits and cheaper split-test variations.

## Section anchors (deep links)

Every `data-section` element also carries an **`id` matching its section
name**: `<section data-section="testimonials" id="testimonials">`. That makes
each major region directly linkable — `…/example/#testimonials` opens the
page scrolled to the testimonials section, which is how ads, emails and social
posts should link to a specific part of a funnel.

- ids are unique within the page and kebab-case, same as section names.
- Treat an id as a **published URL once the funnel is live** — renaming it
  breaks every ad or post already linking to `#that-name`. Rename sections
  freely before launch, deliberately after.
- Pages with a sticky header set `scroll-margin-top` on sections (roughly the
  header's height) so the browser doesn't scroll the section heading
  underneath the fixed nav:
  `section[id] { scroll-margin-top: 90px; }`
- Upload **warns** (never rejects) when a `data-section` has no `id`, so
  hand-me-down pages still deploy.

## Reserved

- The `/_platform/*` path prefix belongs to the platform (lead API, events,
  webhooks). Packages must not contain files under `_platform/`.
- The platform injects `<script>window.__lmt=…</script>` plus any configured
  tracking scripts into `<head>` / before `</body>` at serve time. Pages must
  contain proper `<head>` and `<body>` elements.

## Limits

| Limit | Value |
|---|---|
| Zip size | 25 MB |
| Unpacked size | 100 MB |
| File count | 500 |
| Paths | no `..`, no absolute paths; `\` separators are normalised to `/` |

## Split tests (`index-b.html`)

A package (or bundle folder) containing both `index.html` and **`index-b.html`**
deploys as an A/B split test in one step:

- Variant **A** = the package minus `index-b.html`.
- Variant **B** = the same file set with `index-b.html` serving as the entry
  page. All other pages and assets are shared between both variants.
- On upload/import with activation: both versions are stored, variants A and B
  go live at 50/50, and a running split test is created — identical to starting
  one manually. Sticky per-visitor assignment, stats, declare-winner and cancel
  all work as normal from the funnel page.
- A/B only — `index-c.html` etc. is not a thing; the stats engine is
  two-variant.
- If a split test is **already running** on that funnel, the versions are
  uploaded but nothing is activated and no test is started (flagged in the
  result) — a live test is never clobbered.
- Bulk-import revert ends an imported test and returns the funnel to whatever
  it served before.

## Manifest (`funnel.json`, optional)

A package (or bundle folder) may include a **`funnel.json`** at its root to
pre-wire the funnel's URL slug, lead category, funnel steps and conversion
goal on deploy. It is deploy metadata: it is never served, and it does not
count towards the version's content hash.

```json
{
  "slug": "adi-business-lawyer-sydney-lp",
  "category": "Business Law",
  "steps": [
    { "name": "Landing page", "path": "/" },
    { "name": "Book a call",  "path": "/book-a-call" },
    { "name": "Booked",       "path": "/thank-you" }
  ],
  "goal": "step:/thank-you"
}
```

- `slug` (**bundle imports only**): the funnel's URL path segment
  (`/adi-business-lawyer-sydney-lp/`), instead of the folder name. Use it when
  the URL must match something that already exists — ads, a funnel being
  replaced — without renaming folders. Lowercase letters, digits and hyphens,
  starting with a letter or digit, max 63 characters; an invalid or duplicate
  slug **errors that folder's row** at preview (a funnel at the wrong URL is
  worse than a blocked import). Matching against existing funnels (the
  idempotent re-import) uses this slug. In a single-package upload the key is
  ignored with a warning: that funnel already has a URL, set on its settings
  page.
- `category`: the **lead category** shown in lead notifications ("New
  *Business Law* Lead for Aditum Lawyers") and the funnel's settings field.
  Free text, max 60 characters. Present = set it on deploy; `""` or `null` =
  clear it; absent = leave the funnel's current category alone. Without one,
  notifications fall back to the funnel name.
- `steps` (max 10, ordered): powers the step-flow analytics on the funnel page
  — unique visitors per step and step→step conversion. `name` is the label
  shown in that analytics view (defaults to the path when omitted); `path` is
  the routed page path, normalised (`/thank-you.html` ≡ `/thank-you` ≡
  `/thank-you/`).
- `goal`: what counts as a conversion for split-test stats — `"leads"`
  (form leads + calls + Calendly bookings; the default), `"booking"`
  (Calendly bookings only), or `"step:/path"` (unique visitors reaching that
  page, e.g. a post-booking confirmation).
- Every key is optional; uploading a manifest replaces the funnel's existing
  steps/goal/category for the keys present. A malformed manifest (or a bad
  value for one key) warns and is ignored — it never blocks a deploy, with the
  one exception above: a bad `slug` in a bundle errors its row.
- In a **bundle**, `_shared/funnel.json` sets defaults for every funnel
  (category, steps, goal once instead of 20 times); each folder's own
  `funnel.json` overrides it **key by key** (its `steps` replace the shared
  list wholesale, not per entry). `slug` is dropped from the shared file with
  a warning — it belongs in each folder.

## Tracking tags (`tracking.md`)

An optional **`tracking.md`** at the package root declares the funnel's
tracking tags so they deploy with the zip instead of being configured by hand
per funnel. Like `funnel.json`, it is metadata: parsed out, never served, and
excluded from the content hash.

Each `## ` heading is one tag. The heading names the location — it must
contain **head** or **body** (case-insensitive) — and may scope the tag to
specific pages with `/path` tokens:

~~~markdown
# Tracking tags

## Head
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXXXX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','AW-XXXXXXXXX');</script>
```

## Body end
```html
<script src="//cdn.callrail.com/companies/XXXXXXXXX/XXXXXXXXXXXX/12/swap.js"></script>
```

## Head — /thank-you
```html
<script>gtag('event','conversion',{'send_to':'AW-XXXXXXXXX/XXXXXXXXXXX'});</script>
```
~~~

- The tag HTML is the section's fenced code block(s); raw text under the
  heading works too if there are no fences.
- Scoped headings can list several pages: `## Head — /thank-you, /book-a-call`.
  No `/path` in the heading = every page.
- Deploying a package with `tracking.md` **replaces** the funnel's previous
  `tracking.md` tags (an empty file clears them). Scripts added by hand in the
  admin are never touched, and imported tags show "(imported)" there.
- Bad sections warn and are skipped — `tracking.md` never blocks a deploy.
  Max 20 sections, 20k characters each.
- In a **bundle**, put it at `_shared/tracking.md` to apply the same tags to
  every funnel in one place (a funnel folder's own `tracking.md` wins). Because
  it's outside the content hash, re-importing a bundle where only the tags
  changed updates every funnel's tags even though each folder reports
  "unchanged".

## Tracking pixels & Calendly (serve-time behaviour)

- Tracking scripts added in the admin can be scoped to specific pages (e.g. a
  conversion pixel only on `/thank-you`); unscoped scripts inject everywhere.
- Pageviews (visitor counts, step flow) are reported client-side by the
  platform snippet, not at serve time — link scanners, unfurlers and other
  bots that don't run JS never count as visitors, and JS-running crawlers are
  filtered by user agent. No markup needed; the snippet is injected
  automatically.
- The platform snippet reports Calendly bookings automatically: when an
  embedded Calendly widget fires `calendly.event_scheduled`, a **booking**
  lead is recorded with variant/session attribution and client notifications
  fire. No extra markup needed — just embed the Calendly widget normally.
- Post-booking navigation: if any element on the page carries
  `data-booking-redirect="/path"`, the snippet redirects the visitor there
  once the booking is recorded (base-path aware, same as form
  `data-redirect`). Use this instead of Calendly's own redirect setting so a
  single Calendly event type can be shared across all funnels while each
  funnel keeps its own confirmation page. Without the attribute, behaviour is
  unchanged — the visitor stays on Calendly's confirmation screen.

## Bundle format (bulk import)

A **bundle** is a zip whose root contains one folder per funnel — no
`index.html` at the zip root. Uploaded on a client's Funnels page, it imports
every funnel at once (preview first, then commit).

- Folder name becomes the funnel's URL slug (`commercial-leases-nsw/` →
  `/commercial-leases-nsw/`) unless the folder's `funnel.json` sets `slug`
  (§Manifest), which wins. Folder names that aren't valid slugs are
  normalised; each folder must contain a valid v1 package (`index.html` at
  folder root). The preview table shows the resulting slug next to the folder
  whenever the two differ.
- An optional `_shared/` folder at the zip root is copied into every funnel
  (the funnel's own file wins on a path collision). Put common images/CSS here
  once instead of duplicating them per folder. `_shared/funnel.json` and
  `_shared/tracking.md` are bundle-wide metadata, never served: the manifest
  merges key by key, the tracking file is taken whole unless the folder has
  its own (§Manifest, §Tracking tags).
- The default funnel name is the `index.html` `<title>`, editable at preview.
- Imports are idempotent: a folder whose slug (folder name or manifest `slug`)
  matches an existing funnel uploads a **new version** of it; if the content
  is byte-identical to what's currently serving, it's skipped as unchanged.
  Re-upload the whole bundle after editing a few funnels — only those change.
  Metadata (slug aside) still applies on an unchanged row, so a bundle that
  only adds categories or step names updates every funnel.
- Bundle limits: 50 MB zip, 2000 files, 100 MB unpacked (per-funnel limits
  above still apply to each folder).
- **No wrapping folder — and verify it.** The single-package tolerance for a
  wrapping top-level folder does **not** apply to bundles: the funnel folders
  must sit directly at the zip root. A bundle zipped with a wrapper (e.g.
  `my-bundle/criminal-defence-lawyer/…`) reads as one funnel named
  `my-bundle` with no `index.html` and the import fails. This is easy to do
  by accident: PowerShell's `Compress-Archive -Path "dir\*"` can include the
  parent folder depending on version and path quoting. Zip the directory
  **contents**, not the directory:
  - PowerShell / .NET (deterministic):
    `[System.IO.Compression.ZipFile]::CreateFromDirectory($srcDir, $destZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)`
    — the final `$false` is `includeBaseDirectory` and is the guarantee.
  - Unix `zip`: `cd <bundle-dir> && zip -r ../bundle.zip .`
  - **Mandatory post-zip check** before calling a bundle done: list the
    archive's root entries and confirm they are exactly the funnel slug
    folders (no other root entry, no `index.html`). If the root shows a
    single folder wrapping everything, rebuild the zip.

## Versioning

This is **v1**. Breaking changes to the format bump the version; the validator
stays backwards-compatible with older packages wherever possible.

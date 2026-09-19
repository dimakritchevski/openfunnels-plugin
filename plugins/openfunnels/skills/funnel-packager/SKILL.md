---
name: funnel-packager
description: Build, edit, or package landing pages and funnels for the OpenFunnels platform. Use whenever creating funnel pages, preparing a funnel .zip for upload, building a bundle for bulk import, setting up a split test (index-b.html), writing funnel.json or tracking.md, or when the user mentions OpenFunnels, funnel packages, or uploading a funnel.
---

# OpenFunnels Funnel Packager

You are building a **funnel package** — a plain .zip of static files that the
OpenFunnels platform validates, deploys and serves. The full contract is in
[references/FUNNEL-PACKAGE-SPEC.md](references/FUNNEL-PACKAGE-SPEC.md).
**Read that file in full before generating or editing any funnel page.** It is
the single source of truth, mirrored automatically from the platform repo —
never rely on memory of an older version.

## Non-negotiables (upload rejects or breaks silently without these)

- `index.html` at the zip/folder root. Other pages route by filename
  (`thank-you.html` → `/thank-you`).
- **All asset references relative** (`assets/style.css`), never root-relative
  (`/images/…`) — funnels are served under a path prefix. Root-relative is
  reserved for `/_platform/*` and `data-redirect` targets only. No external
  CDNs for critical rendering.
- Proper `<head>` and `<body>` elements on every page (the platform injects
  its snippet and tracking there).
- Nothing under a `_platform/` path.

## Lead forms

- Mark every lead-capture form `<form data-lead data-redirect="/thank-you">`.
- No-JS fallback: `action="/_platform/lead" method="POST"`.
- Every lead form includes the honeypot:
  `<input name="company_website" class="hp" tabindex="-1" autocomplete="off">`
  with `.hp` hidden **off-screen in CSS** (never `display:none`).

## Editable markers — the rules people get wrong

- Wrap each major region in `data-section` with a **matching `id`**
  (`<section data-section="hero" id="hero">`); set
  `section[id] { scroll-margin-top: … }` when there's a sticky header.
- Mark every human-editable text with `data-edit` on the element that OWNS
  the text (`h1`, `p`, `button`) — kebab-case, section-prefixed, unique names.
- A `data-edit` element must hold **one text node, no element children**.
  Eyebrow + headline in one `h1` = two spans, each with its own `data-edit`;
  never a bare text node beside an element sibling.
- Minimum per page: hero headline, hero subhead, primary CTA.

## Extras (see the spec for exact formats)

- **Split test**: ship `index-b.html` alongside `index.html` → deploys as a
  50/50 A/B test in one step. A/B only; never clobbers a running test.
- **`funnel.json`** (optional, root): pre-wires the URL `slug` (bundle
  imports only — a bad one errors that folder), the lead `category` ("Family
  Law"), funnel `steps` (max 10, each `{name, path}` — `name` is the label
  in analytics) and the conversion `goal` (`"leads"` | `"booking"` |
  `"step:/path"`).
- **`tracking.md`** (optional, root): declares tracking tags per location
  (`## Head`, `## Body end`) and optionally per page (`## Head — /thank-you`).
- **Bundle** (bulk import): zip with one folder per funnel (folder name =
  slug unless its `funnel.json` sets one), optional `_shared/` copied into
  every funnel. `_shared/funnel.json` = manifest defaults for all funnels
  (category, steps, goal set once; never `slug`), overridden key by key by
  each folder's own `funnel.json`.
- **Calendly**: embed the widget normally — bookings are tracked
  automatically. Use `data-booking-redirect="/path"` for post-booking
  navigation, not Calendly's own redirect setting.

## Review funnels (`"kind": "review"` in funnel.json)

Staff send a customer a review request; happy customers go to Google, unhappy
ones leave private feedback. Fixed pages: `index.html` (staff send form),
`sent.html`, `review-page.html` (Yes → `yes`, No → `no`), `yes.html` (Google
write-a-review link), `no.html` (feedback form), `thanks.html`. Link between
them with relative hrefs.

- The send form is **`data-review-request`**, not `data-lead`:
  `<form data-review-request data-redirect="/sent" action="/_platform/review-request" method="POST">`
  with `first_name`, `email`, `phone` inputs, the honeypot, and an optional
  `<p data-error hidden></p>` for validation messages. The platform texts and
  emails the **customer** a link to `/review-page`; the client's lead
  recipients are never notified.
- The feedback form on `no.html` is an ordinary lead form
  (`data-lead data-form="review-feedback" data-redirect="/thanks"`).
- Mark the review-platform link on `yes.html` with `data-track-click="review"`.
- Ship the review email as `emails/review.html`: a 600px table-layout HTML
  email, inline CSS, PNG/JPG logo (never SVG), `{first_name}`, `{business}`
  and one `<a href="{link}">` button, `data-edit` on texts. Files under
  `emails/` are sent, never served; reference assets as `../images/…` and
  they are absolutised at send time. Without it the plain-text `email_body`
  template is used.
- Templates go under `"review"` in `funnel.json` (`sms`, `email_subject`,
  `email_body`; placeholders `{first_name}`, `{business}`, `{link}`); set
  `"goal": "click:review"` and list steps `/review-page`, `/yes`, `/no`, `/thanks`.

## Tracked clicks

`data-track-click="<name>"` on any link/button reports the click to the
platform; `"goal": "click:<name>"` (combinable: `"form,click:call"`) makes it
the conversion. Lowercase letters, digits, hyphens. Spec §Tracked clicks.

## Before handing over a package

Run the bundled validator on the funnel directory — it applies the same rules
as the platform's upload validation:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-funnel.mjs" <funnel-dir>
```

Fix every ERROR (upload would reject) and read every WARN (something will
silently not work — unmarked forms don't capture leads, mixed-content
`data-edit` loses click-editing). Or use the `/package-funnel` command, which
validates and zips in one step.

# Owner back channel (private)

Sends every Instant Quote **quote request, sample request and sign-up** to the owner by email, and shows a
**live feed** of who is using the app right now. Customers never see the feed or the alerts.

When `FEED.url` is set, "Request my visit" and "Order my samples" send the request straight to the office and
the customer just sees "✓ Sent!" (no more copy-and-text step). If sending fails, the old copy/call/text
fallback appears so no request is lost.

How it works:

- `www/index.html` (`FEED`) posts small JSON batches to a Google Apps Script web app: app activity
  (the same first-party events the app already records, product ids turned into names), the contact gate,
  quote and sample requests. `FEED.url` empty = off.
- `backchannel/Code.gs` runs in the owner's Google account. It writes everything to a private Google Sheet
  (tabs Activity, Quotes, Leads) and emails `NOTIFY` for each quote, sample request and sign-up
  (reply-to is the customer, so hitting Reply answers them).
- `backchannel/Dashboard.html` is the live feed: `<web app url>?key=<DASH_KEY>`, refreshes every 10 s.
  Without the key the URL shows "Not found."

Stays inside the privacy policy: first-party use data, contact info typed into the app, sent to a service
provider (Google) that runs it for us. No ad trackers, no IP addresses stored.

## One-time setup (owner's Google account)

1. Go to <https://script.google.com> signed in as gomezflooringcompany@gmail.com > **New project**.
   Name it `GFC Instant Quote Alerts`.
2. Replace the code in `Code.gs` with `backchannel/Code.gs`.
3. **+ (Add a file) > HTML**, name it `Dashboard`, paste `backchannel/Dashboard.html`.
4. Pick `setup` in the function menu > **Run** > Review permissions > choose the account >
   Advanced > Go to GFC Instant Quote Alerts > Allow. (Google shows "unverified" because it's your own script.)
   This creates the Google Sheet "GFC Instant Quote - Live Feed (private)" in Drive.
5. **Deploy > New deployment** > type **Web app** > Execute as **Me** > Who has access **Anyone** > Deploy.
   Copy the Web app URL (ends in `/exec`).
6. Run `dashboardLink` and open the link it logs: that's the private live feed. Bookmark it on your phone.
7. Optional: run `testQuote` to get a test email.
8. Put the `/exec` URL in `FEED.url` in `www/index.html` and merge to `main`
   (jsDelivr can take up to 12 h to refresh `@main`; purge `https://purge.jsdelivr.net/gh/gomezflooringcompany-lang/gfc-quote-app@main/www/index.html`).

Changing `Code.gs` later: edit it, then **Deploy > Manage deployments > Edit > Version: New version**
so the same URL keeps working.

## Keep your own testing out of the feed

Open `https://gomezflooringcompany.store/pages/gfc-instant-quote?gfcstaff=1` once on each of your phones and
computers. That browser stops sending activity. `?gfcstaff=0` turns it back on.

## Limits

Gmail lets a script send about 100 emails a day, plenty for quotes and sign-ups. Turn off sign-up emails with
`EMAIL_ON_SIGNUP = false`.

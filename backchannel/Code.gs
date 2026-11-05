/**
 * GFC Instant Quote: owner back channel (private).
 *
 * Runs as a Google Apps Script web app in the owner's Google account.
 *  - doPost: the quote app sends activity, sign-ups, quote and sample requests here.
 *            Everything is written to a private Google Sheet; quotes, samples and
 *            sign-ups are also emailed to NOTIFY.
 *  - doGet:  ?key=<DASH_KEY> shows the live-feed dashboard. Without the key it shows nothing.
 *
 * Setup steps: backchannel/README.md
 */

var NOTIFY = 'gomezflooringcompany@gmail.com';
var INGEST_KEY = 'gfc-iq';        // must match FEED.key in www/index.html
var EMAIL_ON_SIGNUP = true;       // email when someone fills the contact gate
var TZ = 'America/Los_Angeles';
var ACTIVE_MIN = 10;              // "live now" = activity in the last 10 minutes
var MAX_ACTIVITY_ROWS = 50000;

var COLS = {
  Activity: ['Time', 'Who', 'Email', 'Phone', 'ZIP', 'Event', 'Detail', 'Source', 'Visitor', 'Session'],
  Quotes: ['Time', 'Type', 'Name', 'Email', 'Phone', 'ZIP', 'City', 'Total', 'Private pricing', 'Best time', 'Summary', 'Visitor'],
  Leads: ['Time', 'Name', 'Email', 'Phone', 'ZIP', 'Logged-in customer', 'Interests', 'Visitor']
};

// ---------- one-time setup (run from the editor) ----------
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = book_();
  if (!props.getProperty('DASH_KEY')) props.setProperty('DASH_KEY', Utilities.getUuid().replace(/-/g, ''));
  MailApp.getRemainingDailyQuota(); // asks for the email permission now
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Dashboard key: ' + props.getProperty('DASH_KEY'));
  Logger.log('After you deploy, run dashboardLink() to get the full dashboard link.');
}

function dashboardLink() {
  var url = ScriptApp.getService().getUrl();
  var key = PropertiesService.getScriptProperties().getProperty('DASH_KEY');
  Logger.log(url ? url + '?key=' + key : 'Deploy the web app first (Deploy > New deployment > Web app).');
}

/** Sends a fake quote through the same code path, to check email + sheet. */
function testQuote() {
  handle_({
    k: INGEST_KEY, kind: 'quote', vid: 'test-visitor', sid: 'test-session', src: 'test',
    who: { name: 'TEST Customer', email: NOTIFY, phone: '(818) 203-1168', zip: '91342' },
    ev: [{ t: Date.now(), e: 'open', d: 'quote' }],
    quote: { total: 4321, priv: false, city: 'Sylmar', best: 'Morning', name: 'TEST Customer', phone: '(818) 203-1168',
      summary: 'New quote request (app)\nName: TEST Customer\nThis is a test from testQuote(). You can delete this row.' }
  });
}

// ---------- intake ----------
function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (!raw || raw.length > 200000) return out_('ignored');
  var d;
  try { d = JSON.parse(raw); } catch (x) { return out_('ignored'); }
  if (!d || d.k !== INGEST_KEY) return out_('ignored');
  handle_(d);
  return out_('ok');
}

function handle_(d) {
  var who = d.who || {};
  var now = new Date();
  var label = clip_(who.name, 60) || ('Visitor ' + clip_(d.vid, 4));
  var vid = clip_(d.vid, 40), sid = clip_(d.sid, 40), src = clip_(d.src, 10);
  var base = function (t, ev, detail) {
    return [t, label, clip_(who.email, 120), clip_(who.phone, 40), clip_(who.zip, 10), ev, detail, src, vid, sid];
  };
  var rows = (d.ev || []).slice(0, 60).map(function (x) {
    var t = new Date(+x.t || now);
    if (isNaN(t.getTime()) || Math.abs(t - now) > 864e5) t = now;
    return base(t, clip_(x.e, 40), clip_(x.d, 200));
  });
  var kind = d.kind;
  var q = d.quote || {}, s = d.sample || {};
  if (kind === 'lead') rows.push(base(now, 'SIGN-UP', who.login ? 'logged-in store customer' : 'filled contact form'));
  if (kind === 'quote') rows.push(base(now, 'QUOTE SENT', '$' + num_(q.total) + (q.priv ? ' (private pricing)' : '')));
  if (kind === 'sample') rows.push(base(now, 'SAMPLE REQUEST', clip_(s.address, 200)));

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = book_();
    append_(ss.getSheetByName('Activity'), rows);
    if (kind === 'quote') append_(ss.getSheetByName('Quotes'), [[now, 'Quote', clip_(q.name || who.name, 80), clip_(who.email, 120),
      clip_(q.phone || who.phone, 40), clip_(who.zip, 10), clip_(q.city, 60), num_(q.total), q.priv ? 'YES' : '', clip_(q.best, 40),
      clip_(q.summary, 45000), vid]]);
    if (kind === 'sample') append_(ss.getSheetByName('Quotes'), [[now, 'Samples', clip_(s.name || who.name, 80), clip_(who.email, 120),
      clip_(s.phone || who.phone, 40), clip_(who.zip, 10), clip_(s.address, 200), '', '', '', clip_(s.summary, 45000), vid]]);
    if (kind === 'lead') append_(ss.getSheetByName('Leads'), [[now, clip_(who.name, 80), clip_(who.email, 120), clip_(who.phone, 40),
      clip_(who.zip, 10), who.login ? 'YES' : '', clip_(d.interests, 2000), vid]]);
    trim_(ss.getSheetByName('Activity'));
  } finally {
    lock.releaseLock();
  }

  try {
    if (kind === 'quote') mailQuote_(who, q);
    if (kind === 'sample') mailSample_(who, s);
    if (kind === 'lead' && EMAIL_ON_SIGNUP) mailLead_(who, d.interests);
  } catch (err) {
    console.error('email failed: ' + err);
  }
}

// ---------- emails (to the owner only) ----------
function mailQuote_(who, q) {
  var name = q.name || who.name || 'Someone';
  var where = q.city || who.zip || '';
  send_('New instant quote: ' + name + ' $' + num_(q.total).toLocaleString('en-US') + (where ? ' (' + where + ')' : ''),
    '<p><b>' + esc_(name) + '</b> just sent a quote from the Instant Quote.</p>' +
    contact_(who, q.phone) +
    '<p><b>Instant quote: $' + num_(q.total).toLocaleString('en-US') + '</b>' + (q.priv ? ' (private pricing)' : '') +
    (q.best ? '<br>Best time to call: ' + esc_(q.best) : '') +
    (q.videos || q.photos ? '<br>They have ' + num_(q.videos) + ' video(s) and ' + num_(q.photos) + ' floor photo(s) to text you.' : '') + '</p>' +
    '<pre style="white-space:pre-wrap;font:13px/1.45 monospace;background:#f3f5f9;padding:12px;border-radius:8px">' + esc_(q.summary) + '</pre>',
    who.email);
}

function mailSample_(who, s) {
  var name = s.name || who.name || 'Someone';
  send_('Sample request: ' + name,
    '<p><b>' + esc_(name) + '</b> asked for samples ($25 by Zelle).</p>' + contact_(who, s.phone) +
    '<pre style="white-space:pre-wrap;font:13px/1.45 monospace;background:#f3f5f9;padding:12px;border-radius:8px">' + esc_(s.summary) + '</pre>',
    who.email);
}

function mailLead_(who, interests) {
  send_('Instant quote sign-up: ' + (who.name || 'new visitor') + (who.zip ? ' (' + who.zip + ')' : ''),
    '<p><b>' + esc_(who.name || 'Someone') + '</b> filled in their contact info in the Instant Quote. No quote sent yet.</p>' +
    contact_(who) +
    (interests ? '<pre style="white-space:pre-wrap;font:13px/1.45 monospace;background:#f3f5f9;padding:12px;border-radius:8px">' + esc_(interests) + '</pre>' : ''),
    who.email);
}

function contact_(who, phone) {
  var p = phone || who.phone;
  return '<p>' + (who.email ? 'Email: <a href="mailto:' + esc_(who.email) + '">' + esc_(who.email) + '</a><br>' : '') +
    (p ? 'Phone: <a href="tel:' + esc_(String(p).replace(/[^\d+]/g, '')) + '">' + esc_(p) + '</a><br>' : '') +
    (who.zip ? 'ZIP: ' + esc_(who.zip) : '') + '</p>';
}

function send_(subject, html, replyTo) {
  var link = '';
  try {
    var url = ScriptApp.getService().getUrl();
    var key = PropertiesService.getScriptProperties().getProperty('DASH_KEY');
    if (url && key) link = '<p style="color:#667"><a href="' + url + '?key=' + key + '">Open the live feed</a> (private)</p>';
  } catch (x) {}
  var opts = { to: NOTIFY, subject: subject, htmlBody: html + link, name: 'GFC Instant Quote' };
  if (replyTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo)) opts.replyTo = replyTo;
  MailApp.sendEmail(opts);
}

// ---------- dashboard ----------
function doGet(e) {
  var key = PropertiesService.getScriptProperties().getProperty('DASH_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) {
    return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:24px">Not found.</p>');
  }
  var t = HtmlService.createTemplateFromFile('Dashboard');
  t.key = key;
  return t.evaluate().setTitle('Instant Quote live feed')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Called by the dashboard every few seconds. */
function feed(key) {
  if (key !== PropertiesService.getScriptProperties().getProperty('DASH_KEY')) throw new Error('no');
  var ss = book_();
  var act = lastRows_(ss.getSheetByName('Activity'), 1500);
  var quotes = lastRows_(ss.getSheetByName('Quotes'), 40);
  var now = Date.now();
  var sessions = {};
  act.forEach(function (r) {
    var t = new Date(r[0]).getTime(), sid = r[9] || r[8];
    if (now - t > 864e5) return;
    var s = sessions[sid] || (sessions[sid] = { who: r[1], email: r[2], phone: r[3], zip: r[4], src: r[7], first: t, last: t, n: 0, lastEv: '', lastDetail: '', quote: '' });
    s.n++;
    if (t >= s.last) { s.last = t; s.lastEv = r[5]; s.lastDetail = r[6]; }
    if (t < s.first) s.first = t;
    if (r[1] && String(r[1]).indexOf('Visitor ') !== 0) s.who = r[1];
    if (r[2]) s.email = r[2];
    if (r[3]) s.phone = r[3];
    if (r[4]) s.zip = r[4];
    if (r[5] === 'QUOTE SENT') s.quote = r[6];
  });
  var list = Object.keys(sessions).map(function (k) { return sessions[k]; }).sort(function (a, b) { return b.last - a.last; });
  return {
    now: now,
    activeMin: ACTIVE_MIN,
    sessions: list.slice(0, 60),
    events: act.slice(-150).reverse().map(function (r) {
      return { t: new Date(r[0]).getTime(), who: r[1], ev: r[5], d: r[6], src: r[7] };
    }),
    quotes: quotes.reverse().map(function (r) {
      return { t: new Date(r[0]).getTime(), type: r[1], name: r[2], email: r[3], phone: r[4], zip: r[5], city: r[6], total: r[7], priv: r[8], summary: r[10] };
    }),
    sheet: ss.getUrl()
  };
}

// ---------- helpers ----------
function book_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : null;
  if (!ss) {
    ss = SpreadsheetApp.create('GFC Instant Quote - Live Feed (private)');
    props.setProperty('SHEET_ID', ss.getId());
  }
  Object.keys(COLS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(COLS[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, COLS[name].length).setFontWeight('bold');
    }
  });
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  return ss;
}

function append_(sh, rows) {
  if (!rows.length) return;
  // Text typed by visitors must never run as a spreadsheet formula.
  rows = rows.map(function (r) {
    return r.map(function (v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function trim_(sh) {
  var n = sh.getLastRow() - 1;
  if (n > MAX_ACTIVITY_ROWS) sh.deleteRows(2, n - MAX_ACTIVITY_ROWS + 5000);
}

function lastRows_(sh, n) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - n + 1);
  return sh.getRange(start, 1, last - start + 1, sh.getLastColumn()).getValues();
}

function out_(s) { return ContentService.createTextOutput(s); }
function clip_(v, n) { return v == null ? '' : String(v).slice(0, n || 200); }
function num_(v) { var x = Math.round(+v || 0); return isFinite(x) ? x : 0; }
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/**
 * Second Brain: Gmail + Google Calendar → your dashboard, every 10 minutes, on Google's servers.
 * Free, and works while your phone and laptop are off.
 *
 * Setup (5 minutes):
 * 1. Go to https://script.google.com → New project. Delete what's there and paste this whole file.
 * 2. ⚙️ Project Settings → Script properties → add:
 *      SB_URL   = https://second-brain-lac-tau.vercel.app/api/ingest/google
 *      SB_TOKEN = the Gmail + Calendar key (dashboard → Me page → Live connections)
 * 3. Back in the editor, pick "sync" at the top and press Run. Approve the access Google asks for.
 * 4. ⏰ Triggers → Add trigger → function "sync", event source "Time-driven", "Minutes timer", "Every 10 minutes".
 *
 * What it sends: sender, subject and the first 200 characters of inbox emails from the last 2 days
 * (promotions and social skipped), and your calendar events for the next 7 days.
 */
function sync() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SB_URL');
  var token = props.getProperty('SB_TOKEN');
  if (!url || !token) throw new Error('Add SB_URL and SB_TOKEN in Project Settings → Script properties');

  var threads = GmailApp.search('in:inbox -category:promotions -category:social -category:forums newer_than:2d', 0, 50);
  var emails = threads.map(function (t) {
    var msgs = t.getMessages();
    var m = msgs[msgs.length - 1];
    return {
      id: m.getId(),
      thread_id: t.getId(),
      from: m.getFrom(),
      subject: m.getSubject(),
      snippet: m.getPlainBody().replace(/\s+/g, ' ').slice(0, 200),
      received_at: m.getDate().toISOString(),
      unread: t.isUnread(),
      starred: t.hasStarredMessages(),
    };
  });

  var now = new Date();
  var end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  var events = CalendarApp.getDefaultCalendar().getEvents(now, end).map(function (e) {
    return {
      id: e.getId() + '|' + e.getStartTime().toISOString(), // repeating events share an id
      title: e.getTitle(),
      starts_at: e.getStartTime().toISOString(),
      ends_at: e.getEndTime().toISOString(),
      all_day: e.isAllDayEvent(),
      location: e.getLocation(),
    };
  });

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-token': token },
    payload: JSON.stringify({ emails: emails, events: events }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Dashboard said ' + res.getResponseCode() + ': ' + res.getContentText());
  Logger.log(res.getContentText());
}

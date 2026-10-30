import datetime as dt, importlib.util, pathlib, unittest
spec=importlib.util.spec_from_file_location('collector',pathlib.Path(__file__).with_name('collect-calendar.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class CalendarTest(unittest.TestCase):
 def event(self,start,extra=''):
  return c.ics_events('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:stable\nDTSTART'+start+'\nSUMMARY:Consumer Price\n Index\n'+extra+'END:VEVENT\nEND:VCALENDAR','America/New_York')[0]
 def test_unfold_and_timezone(self):
  e=self.event(';TZID=US-Eastern:20261106T083000');self.assertEqual(e['title'],'Consumer PriceIndex');self.assertEqual(e['at'],'2026-11-06T13:30:00+00:00')
 def test_explicit_datetime_not_date_only(self):
  self.assertEqual(self.event(';VALUE=DATE-TIME:20261030T133000Z')['at'],'2026-10-30T13:30:00+00:00')
 def test_dst(self):
  self.assertEqual(self.event(';TZID=US-Eastern:20261001T083000')['at'],'2026-10-01T12:30:00+00:00')
  with self.assertRaises(ValueError):self.event(';TZID=America/New_York:20260308T023000')
 def test_date_only_and_cancel(self):
  e=self.event(';VALUE=DATE:20261030','STATUS:CANCELLED\n');self.assertIsNone(e['at']);self.assertEqual(e['status'],'cancelled')
 def test_recurring_not_silently_ignored(self):
  with self.assertRaises(ValueError):self.event(':20261030T083000Z','RRULE:FREQ=MONTHLY\n')
 def test_tehran_day_rollover(self):
  e=self.event(':20261030T230000Z');self.assertEqual(e['date'],'2026-10-31')
 def test_japan_no_invented_hours(self):
  rows=c.parse_jp('<table class="datatable"><tr><td>December</td><td>January 29, 2027</td></tr><tr><td>January</td><td>March 2</td></tr></table>','https://www.stat.go.jp/','CPI');self.assertEqual(rows[1]['date'],'2027-03-02');self.assertIsNone(rows[0]['at'])
 def test_error_retains_source_status(self):
  old=c.fetch;c.fetch=lambda u:(_ for _ in ()).throw(RuntimeError('blocked'))
  try:
   rows,state=c.collect('bls',dt.date(2026,10,30));self.assertEqual(rows,[]);self.assertEqual(state['status'],'error')
  finally:c.fetch=old
if __name__=='__main__':unittest.main()

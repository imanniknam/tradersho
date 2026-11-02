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

# Provider adapter tests are independent of the network and exercise economic semantics.
persian_spec=importlib.util.spec_from_file_location('persian',pathlib.Path(__file__).with_name('collect-persianfx.py'));p=importlib.util.module_from_spec(persian_spec);persian_spec.loader.exec_module(p)
class PersianCalendarTest(unittest.TestCase):
 def row(self,**extra):
  return {'id':1,'date':'2026-11-02','event_name':'ISM Manufacturing','event_name_fa':'شاخص تولید','currency':'USD','time':'18:30:00','impact':'high','status':'waiting','actual':None,'forecast':'51.2','previous':'51.0',**extra}
 def parse(self,row):return p.parse_day({'status':'success','date':'2026-11-02','count':1,'events':[row]},'2026-11-02')
 def test_amount_units_null_zero_and_sign(self):
  for raw,expected in [('0%',{'value':'0','unit':'percent'}),('-12K',{'value':'-12','unit':'thousand'}),('€5.05B',{'value':'5.05','unit':'billion','currency':'EUR'}),('1,234.50',{'value':'1234.50','unit':'number'}),('−۲٫۵',None)]:
   if expected is None:
    with self.assertRaises(ValueError):p.amount(raw)
   else:self.assertEqual(p.amount(raw),expected)
  self.assertIsNone(p.amount(None));self.assertEqual(p.amount('0')['value'],'0')
  for raw in ['12,34','NaN','1e6','3 million','5K%','1.2.3',True]:
   with self.assertRaises(ValueError):p.amount(raw)
 def test_composite_auction_values_are_not_a_decimal(self):
  self.assertEqual(p.amount('3.1|3.8'),{'components':[{'value':'3.1','unit':'number'},{'value':'3.8','unit':'number'}]})
 def test_tehran_timestamp_and_revisions(self):
  e=self.parse(self.row(revised='50.9'))[0];self.assertEqual(e['at'],'2026-11-02T15:00:00+00:00');self.assertEqual(e['previous']['value'],'51.0');self.assertEqual(e['revised']['value'],'50.9');self.assertEqual(e['impact'],'high')
 def test_all_day_tentative_no_fabricated_midnight(self):
  e=self.parse(self.row(time_model_name='کل\u200cروز',impact='none'))[0];self.assertTrue(e['allDay']);self.assertIsNone(e['at']);self.assertIsNone(e['impact'])
  e=self.parse(self.row(time_model_name='نامشخص'))[0];self.assertEqual(e['timeStatus'],'tentative');self.assertIsNone(e['at'])
 def test_wrong_date_and_schema_rejected(self):
  for row in [self.row(date='2026-11-03'),self.row(impact='guess'),self.row(time='25:01:00')]:
   with self.assertRaises(ValueError):self.parse(row)
 def test_nonforex_excluded(self):self.assertEqual(self.parse(self.row(currency='BML',market_forex=0)),[])
 def test_partial_window_failure_keeps_cache(self):
  old=p.fetch_day;p.fetch_day=lambda d:(_ for _ in ()).throw(RuntimeError('blocked'))
  try:
   b=p.collect(dt.date(2026,11,2));self.assertEqual(b['events'],[]);self.assertEqual(b['sources'][0]['status'],'error')
  finally:p.fetch_day=old

if __name__=='__main__':unittest.main()

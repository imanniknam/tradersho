#!/usr/bin/env python3
"""Free official release schedules. No inferred release times, forecasts or impact.
Run --output /tmp/calendar.json for a read-only collection; without --output POSTs
using CALENDAR_PANEL_URL / CALENDAR_INGEST_TOKEN. All fetches verify TLS.
"""
import argparse, calendar, concurrent.futures, datetime as dt, html, json, os, re, subprocess, sys
from html.parser import HTMLParser
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
UTC=dt.timezone.utc
SOURCES={
 'bea':('https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics','America/New_York'),
 'census':('https://www.census.gov/economic-indicators/calendar-listview.html','America/New_York'),
 'bls':('https://www.bls.gov/schedule/news_release/bls.ics','America/New_York'),
 'eurostat':('https://ec.europa.eu/eurostat/o/calendars/eventsIcal?theme=0&category=2','Europe/Luxembourg'),
 'ons':('https://www.ons.gov.uk/calendar/releasecalendar?release-type=type-upcoming','Europe/London'),
 'nz':('https://www.stats.govt.nz/release-calendar/calendar-export','Pacific/Auckland'),
 'ine':('https://www.ine.es/dynt3/Calendario/en/calendario.ics','Europe/Madrid'),
 'statcan':('https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-eng.json','America/Toronto'),
 'abs':('https://www.abs.gov.au/release-calendar/future-releases','Australia/Sydney'),
 'fed':('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm','America/New_York'),
 'ecb':('https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html','Europe/Berlin'),
 'rba':('https://www.rba.gov.au/schedules-events/board-meeting-schedules.html','Australia/Sydney'),
 'jp':('https://www.stat.go.jp/english/data/roudou/1543.html','Asia/Tokyo'),
}
PUBLIC_URLS={'bea':'https://www.bea.gov/news/schedule','bls':'https://www.bls.gov/schedule/','eurostat':'https://ec.europa.eu/eurostat/web/main/news/release-calendar','ons':'https://www.ons.gov.uk/releasecalendar','nz':'https://www.stats.govt.nz/release-calendar/','ine':'https://www.ine.es/en/index.htm'}
LABELS=[
 ('consumer price','شاخص قیمت مصرف‌کننده'),('cpi','شاخص قیمت مصرف‌کننده'),('inflation','تورم'),
 ('producer price','شاخص قیمت تولیدکننده'),('employment situation','وضعیت اشتغال آمریکا'),
 ('unemployment','بیکاری'),('labour force','نیروی کار'),('labor force','نیروی کار'),
 ('labour market','بازار کار'),('labor market','بازار کار'),('job openings','فرصت‌های شغلی و گردش نیروی کار'),
 ('employment','اشتغال'),('gross domestic product','تولید ناخالص داخلی'),('gdp','تولید ناخالص داخلی'),
 ('national accounts','حساب‌های ملی'),('retail','خرده‌فروشی'),('industrial production','تولید صنعتی'),
 ('industrial output','تولید صنعتی'),('industrial turnover','گردش مالی صنعت'),('production','تولید'),
 ('balance of payments','تراز پرداخت‌ها'),('trade','تجارت خارجی'),('imports','واردات'),('exports','صادرات'),
 ('building','ساخت‌وساز'),('construction','ساخت‌وساز'),('housing','مسکن'),('house price','قیمت مسکن'),
 ('services','بخش خدمات'),('earnings','درآمد و دستمزد'),('wages','دستمزدها'),('productivity','بهره‌وری'),
 ('interest','نرخ بهره'),('business','کسب‌وکار'),('confidence','اعتماد اقتصادی'),('government','بخش دولتی'),
 ('tourism','گردشگری'),('population','جمعیت'),('income','درآمد'),('expenditure','مخارج'),
 ('investment','سرمایه‌گذاری'),('price','قیمت‌ها'),('sales','فروش'),('financial','آمار مالی'),
 ('transport','حمل‌ونقل'),('energy','انرژی'),('fomc','نشست سیاست پولی فدرال رزرو'),
 ('monetary policy','نشست سیاست پولی'),('international accounts','حساب‌های بین‌المللی')]
def translate(title):
 low=title.lower()
 for word,label in LABELS:
  if re.search(r'\b'+re.escape(word)+r'\b',low):return label,True
 return title,False

def fetch(url):
 p=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','35','--max-filesize','4500000','--proto','=https','--proto-redir','=https','-A','TradershoCalendar/1.0 (+https://my.tradersho.com)',url],capture_output=True)
 if p.returncode:raise RuntimeError('timeout' if p.returncode==28 else 'blocked' if b'403' in p.stderr else 'unavailable')
 return p.stdout.decode('utf-8-sig')

def unescape(s):return re.sub(r'\\([nN,;\\])',lambda m:'\n' if m[1].lower()=='n' else m[1],s)
def ics_events(text,default_zone):
 if 'BEGIN:VCALENDAR' not in text:raise ValueError('not calendar')
 lines=re.sub(r'\r?\n[ \t]','',text).splitlines(); rows=[]; event=None; depth=0
 for line in lines:
  if line=='BEGIN:VEVENT':event={};depth=1;continue
  if event is None:continue
  if line.startswith('BEGIN:'):depth+=1;continue
  if line=='END:VEVENT':
   if 'DTSTART' not in event or 'SUMMARY' not in event:raise ValueError('event missing fields')
   if 'RRULE' in event:raise ValueError('recurrence needs expansion')
   rows.append(event);event=None;continue
  if line.startswith('END:'):depth-=1;continue
  if depth!=1 or ':' not in line:continue
  header,value=line.split(':',1);key=header.split(';')[0];event[key]=(header,unescape(value))
 result=[]
 for row in rows:
  header,raw=row['DTSTART']; date=dt.datetime.strptime(raw[:8],'%Y%m%d').date(); at=None
  if not re.search(r'(?:^|;)VALUE=DATE(?:;|$)',header) and len(raw)>8:
   zone=re.search(r'TZID=([^;:]+)',header);z=(zone[1].strip('"') if zone else default_zone)
   z={'US-Eastern':'America/New_York'}.get(z,z)
   local=dt.datetime.strptime(raw.rstrip('Z'),'%Y%m%dT%H%M%S').replace(tzinfo=UTC if raw.endswith('Z') else ZoneInfo(z))
   if local.astimezone(UTC).astimezone(local.tzinfo).replace(tzinfo=None)!=local.replace(tzinfo=None):raise ValueError('nonexistent local time')
   at=local.astimezone(UTC).isoformat();date=local.astimezone(ZoneInfo('Asia/Tehran')).date()
  result.append({'title':row['SUMMARY'][1],'key':row.get('UID',('',raw+' '+row['SUMMARY'][1]))[1], 'date':date.isoformat(),'at':at,'status':'cancelled' if row.get('STATUS',('',''))[1].upper()=='CANCELLED' else 'scheduled','url':row.get('URL',('',None))[1]})
 return result

class Node:
 def __init__(self,tag='',attrs=()):self.tag=tag;self.attrs=dict(attrs);self.children=[]
 def text(self):return re.sub(r'\s+',' ',' '.join(c if isinstance(c,str) else c.text() for c in self.children)).strip()
 def find(self,tag=None,cls=None):
  out=[]
  for c in self.children:
   if isinstance(c,Node):
    if (not tag or c.tag==tag) and (not cls or cls in c.attrs.get('class','').split()):out.append(c)
    out.extend(c.find(tag,cls))
  return out
class Tree(HTMLParser):
 def __init__(self,s):
  super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root];self.feed(s)
 def handle_starttag(self,tag,attrs):
  n=Node(tag,attrs);self.stack[-1].children.append(n)
  if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(n)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==tag:self.stack=self.stack[:i];break
 def handle_data(self,s):self.stack[-1].children.append(s)

def dated(date,title,key=None,url=None):return {'date':date.isoformat(),'title':title,'key':key or title+' '+date.isoformat(),'at':None,'status':'scheduled','url':url}
def parse_fed(text):
 root=Tree(text).root;rows=[]
 for panel in root.find(cls='panel'):
  h=panel.find('h4'); year=re.search(r'(20\d{2}) FOMC Meetings',h[0].text()) if h else None
  if not year:continue
  for meeting in panel.find(cls='fomc-meeting'):
   month=meeting.find(cls='fomc-meeting__month');days=meeting.find(cls='fomc-meeting__date')
   if not month or not days:continue
   try:m=list(calendar.month_name).index(month[0].text())
   except ValueError:continue
   # Source ranges preserved in title; date is final meeting day, never assumed decision time.
   ds=re.findall(r'\d+',days[0].text());date=dt.date(int(year[1]),m,int(ds[-1]))
   rows.append(dated(date,'FOMC monetary policy meeting ('+month[0].text()+' '+days[0].text()+')'))
 if not rows:raise ValueError('no FOMC meetings')
 return rows

def parse_ecb(text):
 root=Tree(text).root;rows=[]
 for dl in root.find('dl'):
  terms=dl.find('dt');defs=dl.find('dd')
  if len(terms)!=len(defs):continue
  for term,definition in zip(terms,defs):
   if 'monetary policy meeting' not in definition.text() or 'non-monetary' in definition.text():continue
   date=dt.datetime.strptime(term.text(),'%d/%m/%Y').date();rows.append(dated(date,definition.text()))
 if not rows:raise ValueError('no ECB meetings')
 return rows

def parse_rba(text):
 rows=[]
 for table in Tree(text).root.find('table'):
  captions=table.find('caption');year=re.search(r'Board meeting schedules (20\d{2})',captions[0].text()) if captions else None
  if not year:continue
  for tr in table.find('tr'):
   cells=tr.find('td')
   if not cells or not cells[0].text():continue
   s=cells[0].text();match=re.search(r'(\d+)(?:[–-](\d+))?\s+(\w+)',s)
   if not match:raise ValueError('RBA date format')
   month=list(calendar.month_name).index(match[3]);day=int(match[2] or match[1]);rows.append(dated(dt.date(int(year[1]),month,day),'RBA Monetary Policy Board meeting ('+s+')'))
 if not rows:raise ValueError('no RBA meetings')
 return rows

def parse_abs(text,url):
 root=Tree(text).root; rows=[]
 for n in root.find(cls='exportable-element-wrapper'):
  times=n.find('time');titles=n.find(cls='event-name')
  if not times or not titles:continue
  at=dt.datetime.fromisoformat(times[0].attrs['datetime'].replace('Z','+00:00'));period=n.find(cls='reference-period-value');title=titles[0].text();ref=period[0].text() if period else ''
  rows.append({'date':at.astimezone(ZoneInfo('Asia/Tehran')).date().isoformat(),'at':at.isoformat(),'title':title+(': '+ref if ref else ''),'key':title+' '+ref,'status':'scheduled','url':url,'referencePeriod':ref})
 return rows

def parse_jp(text,url,title,column=0):
 rows=[]
 for table in Tree(text).root.find('table',cls='datatable'):
  year=None
  for tr in table.find('tr'):
   cells=tr.find('td')
   if len(cells)<column+2:continue
   # Basic tabulation only: column 2. Year appears explicitly in Jan/rollover rows.
   raw=cells[column+1].text();match=re.fullmatch(r'([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(20\d{2}))?',raw)
   if not match:continue
   if match[3]:year=int(match[3])
   if year is None:raise ValueError('missing JP release year')
   month=list(calendar.month_name).index(match[1]);date=dt.date(year,month,int(match[2]));ref=cells[column].text();rows.append(dated(date,title+': '+ref,url=url))
 if not rows:raise ValueError('no JP releases')
 return rows

def collect(provider,today):
 url,zone=SOURCES[provider];lo=today-dt.timedelta(days=45);hi=today+dt.timedelta(days=180)
 try:
  if provider=='abs':
   rows=[]
   for offset in range(6):
    month=today.year*12+today.month-1+offset;y,m=divmod(month,12);u=url+'/'+f'{y}{m+1:02d}';rows+=parse_abs(fetch(u),u)
   lo=today
   if not rows:raise ValueError('no ABS releases parsed')
  else:
   text=fetch(url)
   if provider in {'bls','eurostat','ons','nz','ine','bea'}:
    rows=ics_events(text,zone)
    if not rows:raise ValueError('empty ICS')
    if provider=='ons':
     for row in rows:
      if row['key'].startswith('/releases/'):row['url']=urljoin('https://www.ons.gov.uk',row['key'])
    if provider in {'ons','nz'}:lo=today
   elif provider=='statcan':
    raw=json.loads(text);rows=[dated(dt.date.fromisoformat(r['date'][:10]),r['title']+': '+r.get('description',''),r['title']+' '+r.get('description',''),urljoin('https://www150.statcan.gc.ca',r['url']) if r.get('url') else url) for r in raw]
   elif provider=='census':
    pages=[text]
    for a in Tree(text).root.find('a'):
     if a.attrs.get('href','').endswith(f'calendar-listview-{today.year}.html'):pages.append(fetch(urljoin(url,a.attrs['href'])));break
    rows=[]
    for page in pages:
     for table in Tree(page).root.find('table'):
      for tr in table.find('tr'):
       cells=tr.find('td')
       if len(cells)<4:continue
       title,day,hour,ref=[c.text() for c in cells[:4]]
       if not title or not day or not hour or day.lower() in {'suspended','tbd','tba'}:continue
       local=dt.datetime.strptime(day+' '+hour,'%B %d, %Y %I:%M %p').replace(tzinfo=ZoneInfo('America/New_York'))
       rows.append({'date':local.astimezone(ZoneInfo('Asia/Tehran')).date().isoformat(),'at':local.astimezone(UTC).isoformat(),'title':title+': '+ref,'key':title+' '+ref,'status':'scheduled','url':url,'referencePeriod':ref})
    if not rows:raise ValueError('no Census releases')
   elif provider=='fed':rows=parse_fed(text)
   elif provider=='ecb':rows=parse_ecb(text)
   elif provider=='rba':rows=parse_rba(text)
   elif provider=='jp':
    rows=parse_jp(text,url,'Japan Labour Force Survey')
    cpi='https://www.stat.go.jp/english/data/cpi/1582.html';cpitext=fetch(cpi)
    rows+=parse_jp(cpitext,cpi,'Japan Consumer Price Index')
    rows+=parse_jp(cpitext,cpi,'Tokyo preliminary Consumer Price Index',column=2)
  if rows:hi=min(hi,max(dt.date.fromisoformat(r['date']) for r in rows))
  if hi<lo:raise ValueError('expired source horizon')
  result={}
  for r in rows:
   if not lo.isoformat()<=r['date']<=hi.isoformat():continue
   title,translated=translate(r['title'])
   if provider=='eurostat':r['key']=r['title']+' '+r['date']
   result[r['key']]={'provider':provider,'key':r['key'],'date':r['date'],'at':r['at'],'timeStatus':'known' if r['at'] else 'date_only','status':r['status'],'title':title,'originalTitle':r['title'],'translated':translated,'referencePeriod':r.get('referencePeriod',''),'sourceUrl':r['url'] or PUBLIC_URLS.get(provider,url),'impact':None,'actual':None,'forecast':None,'previous':None}
  events=list(result.values());return events,{'provider':provider,'status':'ok' if events else 'empty','coverageFrom':lo.isoformat(),'coverageTo':hi.isoformat()}
 except Exception as e:
  code=str(e) if str(e) in {'timeout','blocked','unavailable'} else 'parse';print(provider+': '+code,file=sys.stderr)
  return [],{'provider':provider,'status':'error','error':code,'coverageFrom':lo.isoformat(),'coverageTo':hi.isoformat()}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output');args=parser.parse_args();now=dt.datetime.now(UTC);today=now.astimezone(ZoneInfo('Asia/Tehran')).date()
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:results=list(executor.map(lambda p:collect(p,today),SOURCES))
 payload={'generatedAt':now.isoformat(),'events':[e for rows,_ in results for e in rows],'sources':[s for _,s in results]}
 for s in payload['sources']:print(s['provider'],s['status'],sum(e['provider']==s['provider'] for e in payload['events']),s['coverageTo'])
 encoded=json.dumps(payload,ensure_ascii=False).encode()
 if args.output:
  with open(args.output,'wb') as f:f.write(encoded)
 else:
  base=os.environ['CALENDAR_PANEL_URL'];token=os.environ['CALENDAR_INGEST_TOKEN']
  if not base.startswith('https://') or len(token)<32:raise ValueError('secure ingest configuration required')
  req=Request(base.rstrip('/')+'/api/integrations/calendar',data=encoded,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
  with urlopen(req,timeout=120) as response:print('Ingest:',response.status,response.read(200).decode())
 if all(s['status']=='error' for s in payload['sources']):raise SystemExit('All sources unavailable; cached records retained')
if __name__=='__main__':main()

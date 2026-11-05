#!/usr/bin/env python3
"""Public PersianFX API -> authenticated shared calendar cache. No per-user upstream calls."""
import argparse, datetime as dt, json, os, re, subprocess, sys
from zoneinfo import ZoneInfo
from urllib.parse import urlencode
from urllib.request import Request, urlopen
UTC=dt.timezone.utc
TEHRAN=ZoneInfo('Asia/Tehran')
ENDPOINT='https://api.persianfx.com/api.php'
COUNTRIES={'USD':'US','EUR':'EU','GBP':'GB','JPY':'JP','CHF':'CH','CAD':'CA','AUD':'AU','NZD':'NZ','CNY':'CN','SEK':'SE','NOK':'NO','ZAR':'ZA','TRY':'TR','MXN':'MX','INR':'IN','BRL':'BR','KRW':'KR','SGD':'SG','HKD':'HK'}
CURRENCIES={'$':'USD','€':'EUR','£':'GBP','¥':'JPY'}
UNITS={'':'number','%':'percent','K':'thousand','M':'million','B':'billion','T':'trillion'}
def amount(raw,allow_votes=False):
 if raw is None or str(raw).strip() in {'','-','—','N/A','n/a'}:return None
 if not isinstance(raw,(str,int,float)) or isinstance(raw,bool):raise ValueError('invalid value')
 if allow_votes and isinstance(raw,str) and re.fullmatch(r'\d{1,3}-\d{1,3}-\d{1,3}',raw.strip()):return {'components':[{'value':n,'unit':'number'} for n in raw.strip().split('-')],'separator':'-'}
 if isinstance(raw,str) and '|' in raw:
  parts=raw.split('|')
  if not 2<=len(parts)<=3:raise ValueError('invalid composite value')
  values=[amount(part) for part in parts]
  if any(v is None or 'components' in v for v in values):raise ValueError('invalid composite parts')
  return {'components':values}
 s=str(raw).strip().translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩−٪','01234567890123456789-%'))
 # Explicit, anchored grammar: scale comes only from the supplied suffix, not title/translation.
 m=re.fullmatch(r'(?:(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|CNY|[$€£¥])\s*)?([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,10})?)\s*([%KMBT])?',s,re.I)
 if not m:raise ValueError('unrecognized economic amount')
 value=m[2].replace(',','')
 if len(value.lstrip('+-').split('.')[0])>30:raise ValueError('amount too large')
 out={'value':value,'unit':UNITS[(m[3] or '').upper()]}
 if m[1]:out['currency']=CURRENCIES.get(m[1],m[1].upper())
 return out

def parse_day(data,day):
 if not isinstance(data,dict) or data.get('status')!='success' or data.get('date')!=day or not isinstance(data.get('events'),list) or data.get('count')!=len(data['events']):raise ValueError('invalid snapshot')
 result=[];seen=set()
 for row in data['events']:
  if row.get('currency') not in COUNTRIES or row.get('market_forex',1)!=1:continue
  if row.get('date')!=day:raise ValueError('wrong event date')
  key=str(row.get('id',''));original=row.get('event_name');title=row.get('event_name_fa') or original
  if not key.isdigit() or key in seen or not isinstance(original,str) or not original.strip() or not isinstance(title,str):raise ValueError('invalid identity')
  seen.add(key)
  rawtime=row.get('time');model=row.get('time_model_name');at=None;timing='date_only'
  if model in {'نامشخص','Tentative','tentative'}:timing='tentative'
  elif model in {'کل\u200cروز','کل روز','All Day','all_day'}:timing='date_only'
  elif rawtime is not None:
   if not re.fullmatch(r'\d{2}:\d{2}:\d{2}',rawtime):raise ValueError('invalid time')
   local=dt.datetime.fromisoformat(day+'T'+rawtime).replace(tzinfo=TEHRAN)
   at=local.astimezone(UTC).isoformat();timing='known'
  votes=original.endswith('Bank Rate Votes');numeric=lambda key:amount(row.get(key),allow_votes=votes)
  actual=numeric('actual');status=row.get('status')
  if status not in {'published','waiting','cancelled'}:raise ValueError('unknown event status')
  impact={None:None,'none':None,'low':'low','mid':'medium','high':'high'}.get(row.get('impact'),'invalid')
  if impact=='invalid':raise ValueError('unknown importance')
  result.append({'provider':'persianfx','key':key,'date':day,'at':at,'timeStatus':timing,'allDay':model in {'کل‌روز','کل روز','All Day','all_day'},'status':'cancelled' if status=='cancelled' else 'released' if status=='published' else 'scheduled','title':title,'originalTitle':original,'translated':title!=original,'country':COUNTRIES[row['currency']],'currency':row['currency'],'impact':impact,'actual':actual,'forecast':numeric('forecast'),'previous':numeric('previous'),'revised':numeric('revised'),'sourceUrl':'https://persianfx.com/','providerUpdatedAt':row.get('updated_at')})
 return result

def fetch_day(day):
 p=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','25','--max-filesize','4500000','--proto','=https','--proto-redir','=https','-A','TradershoCalendar/1.0 (+https://my.tradersho.com)',ENDPOINT+'?'+urlencode({'date':day})],capture_output=True)
 if p.returncode:raise RuntimeError('timeout' if p.returncode==28 else 'blocked' if b'403' in p.stderr else 'unavailable')
 return json.loads(p.stdout.decode('utf-8-sig'))

def collect(today,past=1,future=14):
 started=dt.datetime.now(UTC).isoformat();lo=today-dt.timedelta(days=past);hi=today+dt.timedelta(days=future);events=[]
 try:
  for n in range((hi-lo).days+1):
   day=(lo+dt.timedelta(days=n)).isoformat();events.extend(parse_day(fetch_day(day),day))
  state={'provider':'persianfx','status':'ok' if events else 'empty','coverageFrom':lo.isoformat(),'coverageTo':hi.isoformat()}
 except Exception as e:
  code=str(e) if str(e) in {'timeout','blocked','unavailable'} else 'parse';print('persianfx: '+code,file=sys.stderr)
  # Atomic window: a failed day never erases cached events from that day.
  events=[];state={'provider':'persianfx','status':'error','error':code,'coverageFrom':lo.isoformat(),'coverageTo':hi.isoformat()}
 return {'generatedAt':started,'sources':[state],'events':events}

def main():
 p=argparse.ArgumentParser();p.add_argument('--output');p.add_argument('--past-days',type=int,default=1);p.add_argument('--future-days',type=int,default=14);a=p.parse_args()
 if not 0<=a.past_days<=45 or not 0<=a.future_days<=90:p.error('unsupported collection range')
 batch=collect(dt.datetime.now(TEHRAN).date(),a.past_days,a.future_days);encoded=json.dumps(batch,ensure_ascii=False).encode()
 print('PersianFX:',batch['sources'][0]['status'],len(batch['events']),'events')
 if a.output:
  with open(a.output,'wb') as f:f.write(encoded)
 else:
  base=os.environ['CALENDAR_PANEL_URL'];token=os.environ['CALENDAR_INGEST_TOKEN']
  if not base.startswith('https://') or len(token)<32:raise ValueError('secure ingest configuration required')
  request=Request(base.rstrip('/')+'/api/integrations/calendar',data=encoded,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
  with urlopen(request,timeout=120) as r:print('Ingest:',r.status,r.read(200).decode())
 if batch['sources'][0]['status']=='error':raise SystemExit('Provider unavailable; previous cache retained')
if __name__=='__main__':main()

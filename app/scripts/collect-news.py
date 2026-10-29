#!/usr/bin/env python3
"""Collect public headlines only; no article scraping, cookies or user data."""
import concurrent.futures,datetime,email.utils,hashlib,html,json,os,re,time,urllib.error,urllib.parse,urllib.request,xml.etree.ElementTree as ET
UA='TradershoNews/1.0 (+https://my.tradersho.com; public RSS/news reader)'
NOW=datetime.datetime.now(datetime.timezone.utc)
def iso(value):return value.astimezone(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def text(value):return re.sub(r'<[^>]*>',' ',html.unescape(value or '')).strip()[:500]
def valid_url(value):
 try:
  u=urllib.parse.urlsplit(value)
  return u.scheme in ('http','https') and u.hostname and '.' in u.hostname and not u.username and not u.password and not u.hostname.endswith(('.local','.test','.internal'))
 except ValueError:return False
def http(url,method='GET',data=None,token=None,timeout=30):
 headers={'User-Agent':UA,'Accept':'application/rss+xml, application/xml, application/json, text/xml;q=0.9'}
 if token:headers['Authorization']='Bearer '+token
 if data is not None:headers['Content-Type']='application/json';data=json.dumps(data,ensure_ascii=False).encode()
 with urllib.request.urlopen(urllib.request.Request(url,data=data,method=method,headers=headers),timeout=timeout) as response:
  content=response.read(2500001)
  if len(content)>2500000:raise ValueError('Response too large')
  return content

def category(title):
 s=title.lower()
 if re.search(r'gold|xau|طلا',s):return 'gold'
 if re.search(r'forex|eur/usd|gbp/usd|exchange rate|فارکس',s):return 'forex'
 return 'macro'

def rss_rows(url,provider):
 raw=http(url);root=ET.fromstring(raw)
 rows=[]
 for item in root.findall('.//item')[:20]:
  title=text(item.findtext('title'))
  link=(item.findtext('link') or '').strip()
  if not title or not valid_url(link):continue
  date=item.findtext('pubDate')
  try:date=iso(email.utils.parsedate_to_datetime(date)) if date else None
  except (ValueError,TypeError):date=None
  rows.append({'provider':provider,'url':link,'originalTitle':title,'publishedAt':date,'detectedAt':iso(NOW),'category':category(title),'language':'en'})
 return rows

def collect(provider):
 try:
  if provider=='gdelt':
   # Short time window and one request per run; 429 is respected, not retried.
   url='https://api.gdeltproject.org/api/v2/doc/doc?'+urllib.parse.urlencode({'query':'forex','mode':'ArtList','format':'json','maxrecords':30,'timespan':'24h','sort':'DateDesc'})
   data=json.loads(http(url,timeout=40));rows=[]
   for article in data.get('articles',[]):
    lang=article.get('language','').lower()
    if lang not in ('persian','farsi','english'):continue
    title=text(article.get('title'));link=article.get('url','')
    if not valid_url(link) or not title:continue
    try:seen=iso(datetime.datetime.strptime(article['seendate'],'%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc))
    except (KeyError,ValueError):seen=iso(NOW)
    rows.append({'provider':'gdelt','url':link,'originalTitle':title,'publishedAt':None,'detectedAt':seen,'category':category(title),'language':'fa' if lang in ('farsi','persian') else 'en'})
  elif provider=='fed':
   rows=[];errors=[]
   for feed in ['press_monetary.xml','speeches.xml']:
    try:rows+=rss_rows('https://www.federalreserve.gov/feeds/'+feed,'fed')
    except Exception as e:errors.append(e)
   if not rows and errors:raise errors[0]
  else:rows=rss_rows('https://www.bls.gov/feed/bls_latest.rss','bls')
  return rows,{'provider':provider,'status':'ok' if rows else 'empty'}
 except Exception as e:
  code='blocked' if isinstance(e,urllib.error.HTTPError) and e.code==403 else 'quota' if isinstance(e,urllib.error.HTTPError) and e.code==429 else 'timeout' if isinstance(e,TimeoutError) or 'timed out' in str(e).lower() else 'unavailable'
  return [],{'provider':provider,'status':'error','error':code}

def normalized_numbers(value):
 value=value.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٪','01234567890123456789%'))
 return re.findall(r'\d+(?:[.,]\d+)*',value)

def editorial_title(title,provider):
 if provider=='fed':
  if re.search(r'^Federal Reserve issues FOMC statement',title,re.I):return 'انتشار بیانیهٔ کمیتهٔ بازار باز فدرال رزرو'
  if re.search(r'^Minutes of the Federal Open Market Committee',title,re.I):return 'انتشار صورت‌جلسهٔ کمیتهٔ بازار باز فدرال رزرو'
  if re.search(r'^Minutes of the Board.s discount rate meetings',title,re.I):return 'انتشار صورت‌جلسهٔ نشست‌های نرخ تنزیل فدرال رزرو'
  if re.search(r'release economic projections',title,re.I):return 'انتشار پیش‌بینی‌های اقتصادی فدرال رزرو'
 if provider=='bls':
  for pattern,label in [('consumer price','شاخص قیمت مصرف‌کننده'),('producer price','شاخص قیمت تولیدکننده'),('employment situation','وضعیت اشتغال'),('job openings','فرصت‌های شغلی')]:
   if pattern in title.lower():return 'انتشار گزارش '+label+' آمریکا'
 return None

def run():
 base=os.environ.get('NEWS_PANEL_URL','https://my.tradersho.com').rstrip('/');token=os.environ.get('NEWS_INGEST_TOKEN','')
 if not base.startswith('https://') or len(token)<32:raise SystemExit('Configure HTTPS NEWS_PANEL_URL and NEWS_INGEST_TOKEN')
 state=json.loads(http(base+'/api/integrations/news/state',token=token));known={row['id']:row for row in state.get('known',[])};used=int(state.get('translationCharacters',0));sources=[];items=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
  results=list(executor.map(collect,['gdelt','fed','bls']))
 for rows,status in results:items+=rows;sources.append(status)
 unique={}
 for item in items:
  item['url']=urllib.parse.urldefrag(item['url'])[0]
  unique[item['url']]=item
 items=sorted(unique.values(),key=lambda v:v['publishedAt'] or v['detectedAt'],reverse=True)[:75]
 output=[];translation_ok=True
 for item in items:
  original=item['originalTitle'];key=hashlib.sha256((item['url']+('\n'+item['publishedAt'] if item['publishedAt'] else '')).encode()).hexdigest();cached=known.get(key,{})
  fa=None;kind='pending'
  if item['language']=='fa' and re.search('[\u0600-\u06ff]',original):fa=original;kind='native'
  elif cached.get('originalTitle')==original and cached.get('titleFa'):fa=cached['titleFa'];kind=cached['translation']
  else:
   candidate=editorial_title(original,item['provider'])
   if candidate:fa=candidate;kind='editorial'
   elif translation_ok and used+len(original)<=4800 and len(original.encode())<=500:
    used+=len(original)
    try:
     url='https://api.mymemory.translated.net/get?'+urllib.parse.urlencode({'q':original,'langpair':'en|fa'})
     result=json.loads(http(url,timeout=12))
     if result.get('responseStatus')!=200 or result.get('quotaFinished'):translation_ok=False
     else:
      candidate=text(result.get('responseData',{}).get('translatedText'))
      if re.search('[\u0600-\u06ff]',candidate) and normalized_numbers(original)==normalized_numbers(candidate):fa=candidate;kind='machine'
    except Exception:translation_ok=False
    time.sleep(.25)
  output.append({**{k:v for k,v in item.items() if k!='language'},'titleFa':fa,'translation':kind})
 payload={'generatedAt':iso(datetime.datetime.now(datetime.timezone.utc)),'items':output,'sources':sources,'translationCharacters':used}
 result=json.loads(http(base+'/api/integrations/news','POST',payload,token=token))
 print(json.dumps({'accepted':result.get('accepted'),'persian':sum(bool(v['titleFa']) for v in output),'sources':sources,'translationCharacters':used},ensure_ascii=False))
 if not any(v['status']!='error' for v in sources):raise SystemExit('All sources unavailable; last good records preserved')
if __name__=='__main__':run()

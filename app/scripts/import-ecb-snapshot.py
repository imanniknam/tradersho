"""Reproduce the fixed 2025 EUR/USD reference-rate snapshot (no API key).

python3 scripts/import-ecb-snapshot.py --input /path/to/eurofxref-hist.xml --check
Without --input, downloads the fixed official ECB XML feed once.
"""
import argparse
import datetime
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

SOURCE = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml'
TERMS = 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html'
DESTINATION = Path(__file__).resolve().parents[1] / 'server/datasets/ecb-eurusd-2025.json'
parser = argparse.ArgumentParser()
parser.add_argument('--input', type=Path)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if args.input:
    raw = args.input.read_bytes()
else:
    with urllib.request.urlopen(SOURCE, timeout=30) as response:
        raw = response.read(16_000_001)
if len(raw) > 16_000_000:
    raise ValueError('Unexpectedly large ECB feed')
points = []
for day in ET.fromstring(raw).iter():
    date = day.attrib.get('time', '')
    if '2025-01-01' <= date <= '2025-12-31':
        for rate in day:
            if rate.attrib.get('currency') == 'USD':
                points.append({'date': date, 'value': float(rate.attrib['rate'])})
points.sort(key=lambda row: row['date'])
if len(points) < 240 or len({row['date'] for row in points}) != len(points):
    raise ValueError('Missing or duplicate daily observations')
if any(row['value'] <= 0 for row in points):
    raise ValueError('Invalid rate')
if args.check:
    assert json.loads(DESTINATION.read_text())['points'] == points, 'Snapshot differs from source'
    print(f'Verified {len(points)} unchanged ECB daily rates')
else:
    data = dict(id='ecb-eurusd-daily-2025-v1', symbol='EUR/USD', resolution='1D',
                kind='reference_rate', source='European Central Bank', sourceUrl=SOURCE,
                termsUrl=TERMS, downloadedOn=datetime.date.today().isoformat(), points=points)
    DESTINATION.write_text(json.dumps(data, indent=2) + '\n')
    print(f'Wrote {len(points)} daily observations to {DESTINATION}')

import importlib.util,pathlib,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('collector',pathlib.Path(__file__).with_name('collect-news.py'));collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
class CollectorTests(unittest.TestCase):
 def test_rss_preserves_actual_release_time_and_decodes_entities(self):
  xml=b'<rss><channel><item><title>Rate &amp; inflation</title><link>https://www.federalreserve.gov/newsevents/pressreleases/test.htm</link><pubDate>Tue, 27 Oct 2026 18:00:00 GMT</pubDate></item></channel></rss>'
  with patch.object(collector,'http',return_value=xml):row=collector.rss_rows('https://example.org/feed','fed')[0]
  self.assertEqual(row['originalTitle'],'Rate & inflation');self.assertEqual(row['publishedAt'],'2026-10-27T18:00:00.000Z')
 def test_persian_and_arabic_digits_compare_to_original(self):
  self.assertEqual(collector.normalized_numbers('Rate 3.5% in 2026'),collector.normalized_numbers('نرخ ۳.۵٪ در ٢٠٢٦'))
 def test_editorial_fallback_is_an_announcement_not_an_invented_result(self):
  value=collector.editorial_title('Federal Reserve issues FOMC statement','fed')
  self.assertIn('بیانیه',value);self.assertNotRegex(value,r'\d');self.assertIsNone(collector.editorial_title('Unrecognized release','fed'))
 def test_unsafe_links_do_not_enter_the_feed(self):
  for url in ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.org/x','http://news.local/x']:self.assertFalse(collector.valid_url(url))
if __name__=='__main__':unittest.main()

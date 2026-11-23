import importlib.util,json,tempfile,time,unittest,subprocess,os
from pathlib import Path
spec=importlib.util.spec_from_file_location('google_keys',Path(__file__).with_name('google-jwks.py'))
keys=importlib.util.module_from_spec(spec);spec.loader.exec_module(keys)
class SnapshotTest(unittest.TestCase):
 def data(self):
  now=int(time.time()*1000)
  return {'source':keys.SOURCE,'fetchedAt':now,'expiresAt':now+60000,'keys':[{'kty':'RSA','alg':'RS256','use':'sig','kid':'qa','e':'AQAB','n':'A'*342}]}
 def test_reject_bad_keys_and_lifetime(self):
  data=self.data()
  for change in [{'source':'http://attacker.invalid'},{'expiresAt':0},{'expiresAt':data['fetchedAt']+7200001},{'keys':[]},{'keys':[dict(data['keys'][0],d='private')]},{'keys':data['keys']*2}]:
   with self.assertRaises(ValueError):keys.validate_snapshot(dict(data,**change))
 def test_receiver_rejects_arguments_and_unknown_commands(self):
  receiver=Path(__file__).with_name('receive.sh')
  for command in ['google-jwks /tmp/other','google-jwks; id','deploy main','bash']:
   p=subprocess.run(['bash',str(receiver)],env={**os.environ,'SSH_ORIGINAL_COMMAND':command},capture_output=True)
   self.assertEqual(p.returncode,64)
 def test_atomic_fixed_location_and_no_link(self):
  with tempfile.TemporaryDirectory() as root:
   root=Path(root);data=self.data();p=keys.store_snapshot(data,root)
   self.assertEqual(p,root/'google-jwks/jwks.json');self.assertEqual(json.loads(p.read_text()),data);self.assertEqual(p.stat().st_mode&0o777,0o644)
   older=dict(data,fetchedAt=data['fetchedAt']-1)
   with self.assertRaises(ValueError):keys.store_snapshot(older,root)
  with tempfile.TemporaryDirectory() as root:
   root=Path(root);(root/'google-jwks').symlink_to('/tmp',target_is_directory=True)
   with self.assertRaises(ValueError):keys.store_snapshot(self.data(),root)
if __name__=='__main__':unittest.main()

import importlib.util, io, json, pathlib, tarfile, tempfile, unittest
spec=importlib.util.spec_from_file_location('validator',pathlib.Path(__file__).with_name('validate-image.py'))
validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
class ImageTests(unittest.TestCase):
    def test_normalization_and_rejection(self):
        sha='a'*40
        with tempfile.TemporaryDirectory() as folder:
            src=pathlib.Path(folder)/'image.gz';dst=pathlib.Path(folder)/'safe.tar'
            def create(tags=None, extra=None, layers=None):
                manifest=[dict(RepoTags=tags or ['tradersho:'+sha],Config='config.json',Layers=layers or ['layer.tar'])]
                entries=[('manifest.json',json.dumps(manifest).encode()),('config.json',b'{}'),('layer.tar',b'layer'),('index.json',b'UNTRUSTED OCI INDEX'),('repositories',b'UNTRUSTED TAGS')]
                with tarfile.open(src,'w:gz') as archive:
                    for name,data in entries+(extra or []):
                        member=tarfile.TarInfo(name);member.size=len(data);archive.addfile(member,io.BytesIO(data))
            create();validator.normalize(src,dst,sha)
            with tarfile.open(dst) as archive:self.assertEqual(set(archive.getnames()),{'manifest.json','config.json','layer.tar'})
            for tags in [['caddy:2-alpine'],['tradersho:'+sha,'postgres:17-alpine'],['tradersho:'+'b'*40]]:
                create(tags=tags)
                with self.assertRaises(ValueError):validator.normalize(src,dst,sha)
            create(extra=[('manifest.json',b'[]')])
            with self.assertRaises(ValueError):validator.normalize(src,dst,sha)
            create(layers=['../../outside'])
            with self.assertRaises(ValueError):validator.normalize(src,dst,sha)
            create(layers=['missing'])
            with self.assertRaises(ValueError):validator.normalize(src,dst,sha)
            create()
            original=validator.MAX_SIZE
            try:
                validator.MAX_SIZE=1
                with self.assertRaises(ValueError):validator.normalize(src,dst,sha)
            finally:validator.MAX_SIZE=original
class BundleTests(unittest.TestCase):
    def test_only_image_is_accepted(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);src=root/'bundle.tar';out=root/'out';out.mkdir()
            def make(names):
                with tarfile.open(src,'w') as archive:
                    for name in names:
                        member=tarfile.TarInfo(name);member.size=3;archive.addfile(member,io.BytesIO(b'img'))
            make(['image.tar.gz']);validator.extract_bundle(src,out)
            self.assertEqual((out/'image.tar.gz').read_bytes(),b'img')
            (out/'image.tar.gz').unlink()
            for names in [[],['deploy.sh'],['image.tar.gz','deploy.sh'],['../image.tar.gz'],['image.tar.gz','image.tar.gz']]:
                make(names)
                with self.assertRaises(ValueError):validator.extract_bundle(src,out)
                self.assertEqual(list(out.iterdir()),[])
            with tarfile.open(src,'w') as archive:
                member=tarfile.TarInfo('image.tar.gz');member.type=tarfile.SYMTYPE;member.linkname='/etc/passwd';archive.addfile(member)
            with self.assertRaises(ValueError):validator.extract_bundle(src,out)
if __name__=='__main__':unittest.main()

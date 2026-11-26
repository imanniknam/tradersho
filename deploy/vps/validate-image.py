"""Normalize a bounded Docker save archive to exactly one allowed application tag.
OCI indexes and legacy repositories metadata from the sender are never loaded.
"""
import json, pathlib, re, sys, tarfile

MAX_SIZE = 3 * 1024**3

def extract_bundle(source, destination):
    with tarfile.open(source, mode='r:') as archive:
        members = []
        for member in archive:
            if members or not member.isfile() or member.name != 'image.tar.gz' or member.size > 1024**3:
                raise ValueError('Invalid release bundle')
            members.append(member)
        if len(members) != 1:
            raise ValueError('Invalid release bundle')
        archive.extractall(destination, filter='data')

def normalize(source, destination, sha):
    if not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Invalid SHA')
    names = set()
    total = 0
    manifest = None
    with tarfile.open(source, 'r:gz') as archive:
        for member in archive:
            total += member.size
            if total > MAX_SIZE or len(names) >= 20000:
                raise ValueError('Image too large')
            if member.name in names:
                raise ValueError('Duplicate archive member')
            names.add(member.name)
            if member.name == 'manifest.json':
                if not member.isfile() or member.size > 65536:
                    raise ValueError('Invalid manifest')
                manifest = json.load(archive.extractfile(member))
    if not isinstance(manifest, list) or len(manifest) != 1 or not isinstance(manifest[0], dict) or manifest[0].get('RepoTags') != ['tradersho:' + sha]:
        raise ValueError('Only the requested application tag is allowed')
    image = manifest[0]
    layers = image.get('Layers')
    if not isinstance(layers, list) or not layers or not all(isinstance(n, str) for n in layers):
        raise ValueError('Invalid layers')
    files = ['manifest.json', image.get('Config'), *layers]
    for name in files:
        if not isinstance(name, str) or not name or name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:
            raise ValueError('Invalid image member path')
    if len(set(files)) != len(files) or not set(files).issubset(names):
        raise ValueError('Missing or conflicting image members')
    remaining = set(files)
    try:
        with tarfile.open(source, 'r:gz') as archive, tarfile.open(destination, 'w') as output:
            for member in archive:
                if member.name not in remaining:
                    continue
                if not member.isfile():
                    raise ValueError('Image member must be a regular file')
                output.addfile(member, archive.extractfile(member))
                remaining.remove(member.name)
        if remaining:
            raise ValueError('Missing image members')
    except BaseException:
        pathlib.Path(destination).unlink(missing_ok=True)
        raise

if __name__ == '__main__':
    operation = {'extract': extract_bundle, 'normalize': normalize}[sys.argv[1]]
    operation(*sys.argv[2:])

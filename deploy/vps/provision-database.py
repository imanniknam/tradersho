"""Operator-only, offline-reviewed provisioning; never called by CI/receive.sh.
Run beside database-roles.sql. Makes no network request and prints no credentials.
Requires the existing DB/schema and a verified backup. Re-running preserves passwords.
"""
import os, pathlib, re, secrets, subprocess, tempfile
root = pathlib.Path('/opt/tradersho')
path = root / '.env'
text = path.read_text()
values = dict(line.split('=', 1) for line in text.splitlines() if '=' in line and not line.startswith('#'))
for name in ('APP_DATABASE_PASSWORD', 'OWNER_DATABASE_PASSWORD'):
    if not values.get(name):
        values[name] = secrets.token_hex(32)
        replacement = name + '=' + values[name]
        if re.search('^' + name + '=.*$', text, re.M):
            text = re.sub('^' + name + '=.*$', replacement, text, flags=re.M)
        else:
            text += '\n' + replacement + '\n'
    if not re.fullmatch('[a-f0-9]{64}', values[name]):
        raise SystemExit('Dedicated database passwords must be 64 lowercase hex characters')
# Save before changing roles, so an interruption never loses a generated password.
if path.is_symlink():
    raise SystemExit('Private environment must be a regular file')
with tempfile.NamedTemporaryFile(mode='w', dir=root, prefix='.env.roles-', delete=False) as out:
    os.fchmod(out.fileno(), 0o600)
    out.write(text)
    out.flush()
    os.fsync(out.fileno())
os.replace(out.name, path)
sql = pathlib.Path(__file__).with_name('database-roles.sql').read_text()
for role, name in [('tradersho_panel', 'APP_DATABASE_PASSWORD'), ('tradersho_owner_mail', 'OWNER_DATABASE_PASSWORD')]:
    sql += "\nALTER ROLE " + role + " PASSWORD '" + values[name] + "';\n"
result = subprocess.run(['docker', 'exec', '-i', 'tradersho-db-1', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-1', '-U', 'tradersho', '-d', 'tradersho'], input=sql, text=True, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
if result.returncode:
    raise SystemExit('Database provisioning failed; credentials remain private. Inspect role/schema state locally before retrying.')
print('Restricted database roles prepared; private credentials preserved.')

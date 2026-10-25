import sys, zipfile, os
apk, dest = sys.argv[1], sys.argv[2]
prefixes = sys.argv[3:]
z = zipfile.ZipFile(apk)
n = 0
for info in z.infolist():
    if any(info.filename.startswith(p) for p in prefixes):
        target = os.path.normpath(os.path.join(dest, info.filename))
        if not target.startswith(os.path.normpath(dest)):
            continue
        if info.filename.endswith('/'):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with z.open(info) as src, open(target, 'wb') as out:
            out.write(src.read())
        n += 1
print("extraidos", n)

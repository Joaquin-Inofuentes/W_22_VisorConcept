"""Herramientas sobre libCore.so (ELF64 aarch64). Uso (python -P, no -I):
  python -P libcore.py <libCore.so> shaders <carpeta_salida>
  python -P libcore.py <libCore.so> simbolos <texto> [<texto> ...]   # AND de subcadenas sobre nombres mangled
  python -P libcore.py <libCore.so> jni                              # metodos JNI por clase
  python -P libcore.py <libCore.so> desensamblar <nombre_mangled_exacto>
  python -P libcore.py <libCore.so> isa                              # instrucciones ARMv8.1+ (riesgo de traduccion)
"""
import sys, os, re, struct, json, collections

def cargar(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'\x7fELF' and data[4] == 2, 'se espera ELF64'
    shoff, = struct.unpack_from('<Q', data, 0x28)
    shentsize, shnum, shstrndx = struct.unpack_from('<HHH', data, 0x3A)
    secs = []
    for i in range(shnum):
        n, t, fl, addr, off, size, link, info, al, es = struct.unpack_from('<IIQQQQIIQQ', data, shoff + i * shentsize)
        secs.append(dict(nidx=n, addr=addr, off=off, size=size))
    base = secs[shstrndx]['off']
    for s in secs:
        s['n'] = data[base + s['nidx']: data.index(b'\0', base + s['nidx'])].decode()
    return data, {s['n']: s for s in secs}, secs

def simbolos(data, by):
    ds, dy = by['.dynstr'], by['.dynsym']
    for i in range(dy['size'] // 24):
        n, info, other, shndx, val, size = struct.unpack_from('<IBBHQQ', data, dy['off'] + i * 24)
        if not n:
            continue
        a = ds['off'] + n
        yield data[a:data.index(b'\0', a)].decode('latin-1'), shndx != 0, info & 0xf, val, size

def main():
    lib, cmd, args = sys.argv[1], sys.argv[2], sys.argv[3:]
    data, by, secs = cargar(lib)
    if cmd == 'shaders':
        out = args[0]; os.makedirs(out, exist_ok=True)
        ro = data[by['.rodata']['off']: by['.rodata']['off'] + by['.rodata']['size']]
        idx = []
        for i, m in enumerate(re.findall(rb'#version [^\x00]*', ro)):
            t = m.decode('utf-8', 'replace')
            tipo = 'vert' if 'gl_Position' in t else 'frag'
            nombre = '%02d_%s.glsl' % (i, tipo)
            open(os.path.join(out, nombre), 'w', encoding='utf-8').write(t)
            idx.append(dict(archivo=nombre, version=t.split('\n', 1)[0], pls='pixel_local' in t,
                            atomicos='imageAtomic' in t, samplers=re.findall(r'uniform \w*sampler2D (\w+)', t),
                            atributos=re.findall(r'in \w+ (a\w+);', t)))
        json.dump(idx, open(os.path.join(out, 'indice.json'), 'w', encoding='utf-8'), indent=1)
        c = collections.Counter(x['version'] for x in idx)
        print('shaders:', len(idx), dict(c), 'PLS:', sum(x['pls'] for x in idx), 'atomicos:', sum(x['atomicos'] for x in idx))
    elif cmd == 'simbolos':
        for n, definido, tipo, val, size in simbolos(data, by):
            if definido and all(a in n for a in args):
                print('%s 0x%x %6d %s' % ('FUNC' if tipo == 2 else 'OBJ ' if tipo == 1 else 'T%d ' % tipo, val, size, n))
    elif cmd == 'jni':
        c = collections.Counter()
        for n, definido, *_ in simbolos(data, by):
            if definido and n.startswith('Java_'):
                c[re.sub(r'_[a-zA-Z0-9]+$', '', n).replace('Java_com_tophatch_concepts_', '')] += 1
        for k, v in c.most_common():
            print(v, k)
        print('total JNI:', sum(c.values()))
    elif cmd == 'desensamblar':
        from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM
        obj = [(val, size) for n, d, t, val, size in simbolos(data, by) if d and n == args[0]]
        if not obj:
            sys.exit('no existe: ' + args[0])
        val, size = obj[0]
        sec = next(s for s in secs if s['addr'] <= val < s['addr'] + s['size'])
        fo = val - sec['addr'] + sec['off']
        for ins in Cs(CS_ARCH_ARM64, CS_MODE_ARM).disasm(data[fo:fo + size], val):
            print('%x: %-8s %s' % (ins.address, ins.mnemonic, ins.op_str))
    elif cmd == 'isa':
        from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM
        t = by['.text']; md = Cs(CS_ARCH_ARM64, CS_MODE_ARM); md.skipdata = True
        vig = ('cas', 'ldadd', 'ldclr', 'ldeor', 'ldset', 'swp', 'sdot', 'udot', 'fcmla', 'ldapr', 'bfdot', 'smmla', 'pac', 'aut', 'bti')
        c = collections.Counter(); total = 0
        for ins in md.disasm_lite(data[t['off']:t['off'] + t['size']], t['addr']):
            total += 1
            if ins[2].startswith(vig):
                c[ins[2]] += 1
        print('instrucciones:', total, dict(c.most_common(20)))
    else:
        sys.exit(__doc__)

if __name__ == '__main__':
    main()

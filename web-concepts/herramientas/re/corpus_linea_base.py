"""Linea base del corpus .concepts (SOLO LECTURA). Uso: python -P corpus_linea_base.py <raiz> [salida.json]
Lee tree.pack, workspace.pack y thumb.jpg de cada .concepts sin extraer nada a disco."""
import sys, os, io, json, zipfile, struct, collections, statistics, time
import msgpack
from PIL import Image

TOOL = {0: 'Eraser', 1: 'BallpointPen', 2: 'FountainPen', 3: 'InverseFountainPen', 4: 'LegacyPencil', 5: 'Airbrush',
        6: 'DottedBrush', 7: 'Text', 8: 'Marker', 9: 'Wire', 10: 'Image', 11: 'Fill', 12: 'Watercolor', 13: 'SoftEraser',
        14: 'SoftPencil', 15: 'HardPencil', 16: 'DynamicPen', 0x1000: 'CustomBrush'}

def hook(code, data):
    if code in (0, 1, 2):
        return ('v2',) + struct.unpack('<2f', data[:8])
    if code == 4:
        return ('rgba',) + struct.unpack('<4f', data)
    if code == 5:
        return ('uuid', data.hex())
    return ('ext', code)

def pct(c, tot):
    return {k: round(100.0 * v / tot, 2) for k, v in c.most_common()}

def main():
    raiz = sys.argv[1]
    salida = sys.argv[2] if len(sys.argv) > 2 else None
    t0 = time.time()
    tools = collections.Counter(); opac = collections.Counter(); presion = collections.Counter()
    ws = collections.defaultdict(collections.Counter); thumbs = collections.Counter(); vps = collections.Counter()
    por_archivo = []; errores = []; n_arch = 0; tam_total = 0; aspecto_ok = 0; con_cam = 0

    def caminar(o, acc):
        if not isinstance(o, list) or not o:
            return
        if isinstance(o[0], int) and len(o) > 1 and isinstance(o[1], list) and o[0] in (7, 8, 13):
            acc['img' if o[0] in (7, 8) else 'txt'] += 1
        if o[0] == 6 and len(o) > 2 and isinstance(o[1], list):
            blobs = [x for x in o if isinstance(x, (bytes, bytearray)) and len(x) >= 32 and len(x) % 16 == 0]
            if blobs:
                b = blobs[0]; n = len(b) // 16
                acc['trazos'] += 1; acc['puntos'] += n
                try:
                    core = o[1][1][1][1]; tid = core[1][1]
                    nombre = TOOL.get(tid, str(tid)) if isinstance(tid, int) else 'CustomBrush(uuid)'
                    tools[nombre] += 1
                    if isinstance(core[3], float):
                        opac[(nombre, round(core[3], 2))] += 1
                except Exception:
                    tools['(cabecera no reconocida)'] += 1; nombre = '?'
                ps = {struct.unpack_from('<H', b, i * 16 + 8)[0] for i in range(n)}
                presion[(nombre, 'constante' if len(ps) == 1 else 'variable')] += 1
                return
        for x in o:
            caminar(x, acc)

    def buscar_camara(o):
        if not isinstance(o, list):
            return None
        if len(o) == 6 and o[0] == 1 and all(isinstance(o[i], tuple) and o[i][0] == 'v2' for i in (1, 2, 3)) and o[1][1] > 100:
            return o
        for x in o:
            r = buscar_camara(x)
            if r:
                return r
        return None

    for dp, dn, fn in os.walk(raiz):
        for f in fn:
            if not f.endswith('.concepts'):
                continue
            p = os.path.join(dp, f); n_arch += 1; tam = os.path.getsize(p); tam_total += tam
            acc = collections.Counter()
            try:
                with zipfile.ZipFile(p) as z:
                    caminar(msgpack.unpackb(z.read('tree.pack'), ext_hook=hook, raw=False, strict_map_key=False), acc)
                    w = msgpack.unpackb(z.read('workspace.pack'), ext_hook=hook, raw=False, strict_map_key=False)
                    js = next((x for x in w if isinstance(x, str) and x.startswith('{')), None)
                    if js:
                        d = json.loads(js)
                        for k in ('tool_mode', 'visibility_mode', 'color_palette'):
                            ws[k][str(d.get(k))] += 1
                        lay = d.get('layers', {})
                        ws['layers(visible,corner)'][str((lay.get('visible'), lay.get('corner')))] += 1
                    if len(w) > 2 and isinstance(w[2], list) and len(w[2]) > 1:
                        ws['paper_type'][str(w[2][1])] += 1
                    im = Image.open(io.BytesIO(z.read('thumb.jpg'))); thumbs[im.size] += 1
                    cam = buscar_camara(w)
                    if cam:
                        con_cam += 1; vw, vh = cam[1][1], cam[1][2]; vps[(round(vw), round(vh))] += 1
                        if abs(im.size[0] / im.size[1] - vw / vh) < 0.02:
                            aspecto_ok += 1
            except Exception as e:
                errores.append((f, type(e).__name__)); continue
            por_archivo.append((acc['trazos'], acc['puntos'], acc['img'], acc['txt'], tam, f))

    tr = sorted(x[0] for x in por_archivo)
    q = lambda a, k: a[min(len(a) - 1, int(k * len(a)))]
    tot_tr = sum(tr)
    res = {
        'archivos': n_arch, 'GB': round(tam_total / 1e9, 2), 'parsean': len(por_archivo), 'errores': errores[:10],
        'trazos': tot_tr, 'puntos': sum(x[1] for x in por_archivo),
        'herramientas_%': pct(tools, tot_tr),
        'opacidad_por_herramienta': {'%s=%s' % k: v for k, v in opac.most_common(12)},
        'presion': {'%s/%s' % k: v for k, v in presion.most_common(12)},
        'trazos_por_archivo': {'p50': q(tr, .5), 'p95': q(tr, .95), 'max': tr[-1] if tr else 0,
                               'max_archivo': max(por_archivo)[5] if por_archivo else None},
        'max_puntos_archivo': max(x[1] for x in por_archivo) if por_archivo else 0,
        'max_imagenes_colocadas': max((x[2], x[5]) for x in por_archivo) if por_archivo else None,
        'textos': sum(x[3] for x in por_archivo),
        'mayor_archivo_MB': round(max(x[4] for x in por_archivo) / 1e6, 1) if por_archivo else 0,
        'workspace': {k: dict(v.most_common(6)) for k, v in ws.items()},
        'thumb_tamanos': {'%dx%d' % k: v for k, v in thumbs.most_common(5)},
        'viewports_dp': {'%dx%d' % k: v for k, v in vps.most_common(5)},
        'archivos_con_camara': con_cam, 'thumb_aspecto_igual_viewport': aspecto_ok,
        'segundos': round(time.time() - t0, 1),
    }
    txt = json.dumps(res, ensure_ascii=True, indent=1)
    print(txt)
    if salida:
        open(salida, 'w', encoding='utf-8').write(txt)

if __name__ == '__main__':
    main()

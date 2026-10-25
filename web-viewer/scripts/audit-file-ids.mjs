// Audita cada file_id de drive_folder_cache pegandole al proxy con Range de 1
// byte (no descarga el archivo completo). Reporta cuales fallan.
const BBW_URL = "https://babelbim-worker.datafiles.workers.dev/v1/bim";
const ANON =
  "bbw_pub_23ac1e410efd14afd380458d3e78959c2bf22b0b87b1172d";

const files = JSON.parse(process.argv[2] ? await (await import("node:fs")).promises.readFile(process.argv[2], "utf8") : "[]");

const results = [];
for (const f of files) {
  const url = `${BBW_URL}/functions/v1/concepts-drive?action=download&fileId=${encodeURIComponent(f.file_id)}&range=0-0`;
  try {
    const res = await fetch(url, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const ok = res.status === 206 || res.status === 200;
    let detalle = "";
    if (!ok) {
      try {
        const body = await res.json();
        detalle = body?.error || "";
      } catch {}
    }
    results.push({ ...f, status: res.status, ok, detalle });
  } catch (e) {
    results.push({ ...f, status: 0, ok: false, detalle: String(e) });
  }
  await new Promise((r) => setTimeout(r, 120));
}

const fallidos = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, fallidos: fallidos.length, detalle_fallidos: fallidos }, null, 2));

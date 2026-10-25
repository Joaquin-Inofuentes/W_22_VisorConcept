// Config publica del viewer. El token publico del cliente `concept` esta pensado para
// usarse en el cliente (el BabelBimWorker decide por cliente que rutas y tablas puede tocar).
export const BBW_URL = "https://babelbim-worker.datafiles.workers.dev/v1/bim"; // BabelBimWorker (Cloudflare), no otro proveedor
export const BBW_TOKEN = "bbw_pub_23ac1e410efd14afd380458d3e78959c2bf22b0b87b1172d"; // token público del cliente concept en el Worker
export const FUNCTIONS_URL = `${BBW_URL}/functions/v1`;

// Carpeta publica de Google Drive con archivos .concepts de ejemplo.
export const DRIVE_FOLDER_ID = "1lAlcv9-g6HmWVKkYMcrQQWBD3ew15i5Q";

// Las tarjetas de la galeria muestran la miniatura a ~150 px de lado, asi
// que guardarlas de 32x32 (como se hacia antes) las mostraba estiradas y
// borrosas. 192 se ve nitido y sigue pesando poco (~10 KB por dibujo).
export const THUMBNAIL_SIZE = 192;

// Dibujo de referencia para probar el peor caso: es el .concepts mas pesado
// de toda la carpeta (262,9 MB, 96 PDFs adjuntos). Se abre con ?demo en la
// URL. No se versiona una copia local a proposito: 262 MB no van ni al repo
// ni al bundle — se baja del mismo Drive que el resto, que ademas es el
// camino real del usuario y por lo tanto el unico test que vale.
export const DEMO_FILE_ID = "1pVbj5TLmvTJyrlMathSKrP0jaBVoWzQf";
export const DEMO_FILE_NAME = "RO 3er y 4to..concepts";

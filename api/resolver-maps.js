// Resolve link curto do Google Maps (maps.app.goo.gl, goo.gl/maps) seguindo o redirect
// no servidor — o navegador nao pode fazer isso direto (CORS bloqueia fetch cross-origin
// pra dominio do Google a partir do painel). So depois de resolvido pra URL completa e
// que da pra tirar latitude/longitude por regex.
function extrairCoordenadas(texto) {
  if (!texto) return null;
  let m = texto.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: m[1], lng: m[2] };
  m = texto.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: m[1], lng: m[2] };
  m = texto.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: m[1], lng: m[2] };
  return null;
}

export default async function handler(req, res) {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  if (!url) return res.status(400).json({ error: 'url obrigatoria' });

  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuiaPortoBot/1.0)' }
    });
    const finalUrl = resp.url || url;
    let coords = extrairCoordenadas(finalUrl);
    if (!coords) {
      const corpo = await resp.text().catch(() => '');
      coords = extrairCoordenadas(corpo);
    }
    if (!coords) return res.status(404).json({ error: 'coordenadas nao encontradas nesse link', finalUrl });
    return res.status(200).json({ ...coords, finalUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

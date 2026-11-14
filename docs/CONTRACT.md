# MarsWalk · Ortak Sözleşme

Bu dosya üç iş kolunun birbirini beklemeden çalışabilmesi için gereken her şeyi tanımlar: kim hangi
klasöre dokunur, veriler hangi biçimde durur, iki ekran birbirine ne verir. Üç kişi de (ve üçünün
Claude'u da) işe başlamadan önce bu dosyayı okur.

**Sözleşme sorumlusu:** Samet. Bu dosyadaki herhangi bir şeyi değiştirmek gerekiyorsa önce ona yazın.

## 1. Kim hangi dosyaya dokunur

Çakışmasız birleştirmenin tek kuralı: **herkes yalnızca kendi klasörlerindeki dosyaları değiştirir.**

| İş kolu | Branch | Sahibi olduğu yollar |
| --- | --- | --- |
| A · Veri | `feature/data` | `pipeline/**`, `app_data/**`, `requirements.txt`, `data/**` |
| B · Planlama ekranı | `feature/plan` | `plan/**` |
| C · Yürüyüş ekranı | `feature/walk` | `walk/**`; pazar 12:00'den sonra `README.md` |
| Donmuş (kimse tek başına değiştirmez) | — | `shared/**`, `tools/**`, `index.html`, `docs/CONTRACT.md`, `docs/tasks/**`, `CLAUDE.md`, `.gitignore`, `.nojekyll` |

Pull Request açmadan önce şu komut yalnızca kendi yollarınızı listelemeli:

```bash
git fetch origin
git diff --name-only origin/main...HEAD
```

Listede size ait olmayan bir yol varsa o dosyadaki değişikliği geri alın (`git checkout origin/main -- <yol>`).

### Donmuş bir dosyada değişiklik gerekirse

1. Kendi branch'inizde değiştirmeyin.
2. Gruba yazın: neyi, neden değiştirmek istiyorsunuz.
3. Samet değişikliği `main`'e tek başına, küçük bir commit olarak ekler (`contract: ...`).
4. Herkes `git pull origin main` yapar, sonra devam eder.

## 2. Koordinat sistemi

Uygulamanın her yerinde tek bir koordinat sistemi var: **yerel metre.**

- `x` = doğuya doğru metre, `y` = kuzeye doğru metre.
- `(0, 0)` = alanın **güneybatı** köşesi.
- Izgara: **satır 0 kuzey kenar**, sütun 0 batı kenar. Hücre numarası = `satır * cols + sütun`.
- Leaflet haritası `L.CRS.Simple` kullanır: `latlng = [y, x]`. Bütün katmanların sınırı `[[0, 0], [height_m, width_m]]`.
- Gerçek Mars enlem/boylamı yalnızca ekranda göstermek içindir (`xyToGeo`). Hesaplar hep yerel metreyle yapılır.

Izgara boyutunu, hücre boyutunu ve dosya adlarını **koda sabit yazmayın**; hep `grid.json`'dan okuyun.
Deneme verisi 500 × 500 hücre, gerçek veri yaklaşık 1000 × 1000 hücre olacak.

## 3. `app_data/` dosyaları (A üretir, B ve C yalnızca okur)

Şu an klasörde **deneme (mock) verisi** var. A iş kolu aynı adlarla gerçek veriyi koyduğunda B ve C'nin
kodu değişmeden çalışmalı.

| Dosya | Biçim | İçerik |
| --- | --- | --- |
| `grid.json` | JSON | Izgaranın kimliği; aşağıda |
| `risk.bin` | `uint8`, `rows × cols` bayt, satır satır | `0–100` tahmini risk · `254` veri yok · `255` geçilmez |
| `slope.bin` | `uint8`, aynı boyut | Eğim, derece (`0–90`) · `255` veri yok |
| `elevation.bin` | `float32` little-endian, aynı boyut | Yükseklik, metre · `NaN` veri yok |
| `ortho.png` / `.jpg` | Görsel, en uzun kenar ≤ 4096 px | Uydu görüntüsü (planlama ekranı) |
| `ortho_small.png` / `.jpg` | Görsel, en uzun kenar ≤ 2048 px | Aynı görüntünün küçük hali (telefon) |
| `slope.png`, `risk.png` | RGBA PNG, ızgarayla aynı en-boy oranı | Renkli, yarı saydam katman görselleri |
| `stops.json` | JSON | Habitat ve bilim durakları |
| `curiosity_path.json` | JSON | Curiosity'nin alan içindeki gerçek yolu |
| `conditions.json` | JSON | Son ölçülen radyasyon ve hava değerleri |
| `photos/` | JPG | Duraklara ait Curiosity fotoğrafları |
| `mock_route.json` | JSON | Deneme rotası (yalnızca `tools/make_mock_route.mjs` üretir) |

Görsellerin gerçek dosya adları `grid.json` içindeki `files` alanından okunur; uzantı `.png` ya da `.jpg` olabilir.

### `grid.json`

```json
{
  "version": 1,
  "mock": true,
  "name": "MOCK terrain (not Mars data)",
  "cell_size_m": 2,
  "cols": 500,
  "rows": 500,
  "width_m": 1000,
  "height_m": 1000,
  "georef": { "sw_lat": null, "sw_lon": null, "radius_m": 3396190 },
  "files": {
    "risk": "risk.bin", "slope": "slope.bin", "elevation": "elevation.bin",
    "ortho": "ortho.png", "ortho_small": "ortho_small.png",
    "slope_img": "slope.png", "risk_img": "risk.png",
    "stops": "stops.json", "curiosity_path": "curiosity_path.json", "conditions": "conditions.json"
  },
  "risk_model": { "slope_limit_deg": 30, "description": "..." },
  "sources": [
    { "layer": "Elevation and slope", "mission": "...", "instrument": "...", "product_id": "...",
      "resolution_m": 1, "url": "https://...", "cannot_see": "what this data cannot resolve" }
  ],
  "generated": "2026-11-14T13:00:00+00:00"
}
```

- `mock`: rasterler gerçek NASA verisinden geldiğinde `false` olur. Arayüz `true` iken "DEMO TERRAIN" etiketi gösterir.
- `georef.sw_lat`, `sw_lon`: güneybatı köşenin gerçek Mars enlem ve boylamı (derece, doğu boylamı). Gerçek veride zorunlu.
- `sources`: veri güven panelini besler. Gerçek veride her alan dolu olmalı; `cannot_see` o verinin neyi göremediğini bir cümleyle söyler.
- `risk_model`: riskin nasıl hesaplandığı; arayüzde aynen gösterilir.

### `stops.json`

```json
{
  "mock": true,
  "habitat": { "id": "habitat", "name": "Habitat (hypothetical)", "x": 120, "y": 140 },
  "stops": [
    { "id": "s1", "name": "Ridge junction", "type": "science", "x": 380, "y": 420,
      "description": "Three ridges meet: sample the ridge crest.",
      "photo": { "file": "photos/s1.jpg", "sol": 4600, "instrument": "Navcam", "credit": "NASA/JPL-Caltech" } }
  ]
}
```

`photo` yoksa `null`. Habitat ve duraklar geçilebilir hücrelerde olmalı.

### `curiosity_path.json`

```json
{ "mock": true, "points": [ { "x": 100.0, "y": 120.0, "sol": 4534 } ] }
```

### `conditions.json`

```json
{
  "mock": true,
  "note": "Last archived measurements, not real time.",
  "items": [
    { "id": "radiation", "label": "Surface radiation dose rate", "value": 0.67, "unit": "mSv/day",
      "measured": "Sol NNNN (YYYY-MM-DD)", "instrument": "MSL RAD", "source_url": "https://..." }
  ]
}
```

Arayüz `items` listesini olduğu gibi satır satır gösterir; `id` değerlerine göre özel kod yazılmaz.

### Doğrulama

A iş kolu her veri PR'ından önce çalıştırır; hata varsa PR açılmaz:

```bash
python tools/validate_app_data.py
```

## 4. Rota nesnesi (B üretir, C okur)

Planlama ekranı seçilen rotayı `shared/route.js` içindeki `buildRoute()` ile kurar ve `saveRoute()` ile
kaydeder. Yürüyüş ekranı `loadRoute()` ile okur. İki ekran arasındaki **tek** bağ budur.

```json
{
  "version": 1,
  "mock": true,
  "grid_name": "MOCK terrain (not Mars data)",
  "name": "Lowest estimated risk",
  "kind": "low_risk",
  "weight": 8,
  "created": "2026-11-14T13:00:00.000Z",
  "points": [ { "x": 121, "y": 141, "elev": -4088.2, "slope": 3, "risk": 10, "dist": 0, "time": 0 } ],
  "stops": [ { "id": "s1", "name": "Ridge junction", "x": 380, "y": 420, "point_index": 151 } ],
  "totals": { "distance_m": 1028, "walk_s": 1480, "work_s": 3600, "return_s": 1790,
              "max_slope_deg": 27, "ascent_m": 31, "descent_m": 12, "mean_risk": 9.5, "nodata_cells": 0 }
}
```

- `points`: habitattan son durağa kadar yol. İlk nokta habitat. `dist` ve `time` baştan itibaren birikimli (metre, saniye).
- `elev`, `slope`, `risk`: o hücrede veri yoksa `null`.
- Dönüş yolu ayrıca saklanmaz: dönüş, aynı yolun tersidir ve `returnTimeS(route, i)` ile hesaplanır.
- `kind`: `"shortest"` ya da `"low_risk"`.
- Yürüyüş ekranı kayıtlı rota bulamazsa `loadMockRoute()` ile deneme rotasını açar ve "DEMO ROUTE" etiketi gösterir.

## 5. Ortak modüller (`shared/`, donmuş)

| Modül | Dışa verdikleri |
| --- | --- |
| `shared/data.js` | `loadGrid(base)`, `fileUrl(grid, key)`, `loadJson(grid, key)`, `cellIndex`, `indexToCell`, `cellCenter`, `xyToCell`, `xyToLatLng`, `latLngToXy`, `mapBounds`, `xyToGeo`, `isPassable`, `riskForCost`, sabitler `RISK_NODATA`, `RISK_IMPASSABLE`, `SLOPE_NODATA` |
| `shared/walk-model.js` | `ASSUMPTIONS`, `speedMps(grade)`, `stepTimeS(distM, dzM)`, `formatDuration(seconds)` |
| `shared/route.js` | `buildRoute(grid, cells, opts)`, `saveRoute`, `loadRoute`, `loadMockRoute`, `returnTimeS(route, fromIndex)`, `totalEvaS(route)`, `nearestPointIndex`, `ROUTE_KEY` |
| `shared/vendor/leaflet/` | Leaflet 1.9.4 (harita kütüphanesi). İnternetten yüklemeyin, buradan kullanın. |

Kullanım (`plan/` ya da `walk/` içinden):

```html
<link rel="stylesheet" href="../shared/vendor/leaflet/leaflet.css">
<script src="../shared/vendor/leaflet/leaflet.js"></script>
<script type="module">
  import { loadGrid } from '../shared/data.js';
  const grid = await loadGrid('../app_data/');
</script>
```

Kurallar:

- Süre, hız ve dönüş hesabı **yalnızca** `shared/walk-model.js` ve `shared/route.js` üzerinden yapılır. Böylece iki ekran aynı sayıyı gösterir.
- Veri olmayan hücre güvenli sayılmaz: maliyet hesabında `riskForCost()` kullanın (veri yoksa 100 döner).
- Dışarıdan (CDN) kütüphane, yazı tipi ya da görsel çağırmayın. Uygulama internetsiz açılabilmeli. Yeni bir kütüphane gerekiyorsa kendi klasörünüze kopyalayın.

## 6. Varsayımlar

`shared/walk-model.js` içindeki sayılar NASA ölçümü değil, bizim varsayımımızdır. Arayüzde "assumption" olarak gösterilir.

| Sabit | Değer | Anlamı |
| --- | --- | --- |
| `SUIT_SPEED_FACTOR` | 0,5 | Giysili yürüyüş hızı, giysisiz yürüyüş hızının (Tobler fonksiyonu) yarısı |
| `RETURN_FACTOR` | 1,2 | Dönüş, yorgunluk ve taşınan örnekler yüzünden %20 daha yavaş |
| `EVA_LIMIT_S` | 6 saat | Tek bir yürüyüş için planlama sınırı |
| `STOP_WORK_S` | 20 dakika | Her bilim durağında çalışma süresi |
| `slope_limit_deg` (`grid.json`) | 30° | Bu eğim ve üzeri geçilmez sayılır |

## 7. Dil ve dürüstlük kuralları

- Arayüzdeki bütün metinler **İngilizce**. Kod içi adlar ve yorumlar İngilizce. Ekip belgeleri Türkçe.
- "Safe route" yazılmaz; **"lowest estimated risk"** yazılır.
- "Live" ya da "real-time" yazılmaz; **"last measured"** ve ölçüm tarihi yazılır.
- Habitat ve astronot konumu **"hypothetical"** / **"simulated"** olarak etiketlenir.
- Deneme verisi açıkken ekranda "DEMO TERRAIN" ya da "DEMO ROUTE" görünür.

## 8. Git akışı

```bash
git checkout main && git pull origin main
git checkout -b feature/<data|plan|walk>
# ... çalış, sık sık commit at ...
git fetch origin && git merge origin/main      # PR'dan önce main'i içeri al
git diff --name-only origin/main...HEAD         # yalnızca kendi yolların görünmeli
git push -u origin feature/<...>
```

- `main`'e doğrudan push yok; her şey Pull Request ile girer. `git push --force` yok.
- PR'lar küçük olsun ve çalışan bir adımı içersin; "gün sonunda tek dev PR" yapmayın.
- Başkasının PR'ı birleşince `git pull origin main` (ya da `git merge origin/main`) yapın.

## 9. Yerelde çalıştırma ve testler

Sayfalar modül kullandığı için dosyaya çift tıklayarak açılmaz; küçük bir sunucu gerekir. Repo kökünde:

```bash
python -m http.server 8000
```

Sonra tarayıcıda: `http://localhost:8000/` (giriş), `/plan/`, `/walk/`.

```bash
node tools/test_shared.mjs          # ortak modüller + rota hesabı
python tools/validate_app_data.py   # app_data sözleşmeye uyuyor mu
```

## 10. Zaman kapıları

| Ne zaman | Ne olmalı |
| --- | --- |
| Cumartesi gece | A: gerçek yükseklikten eğim ve risk `app_data/` içinde · B: iki nokta arasında rota çiziliyor · C: yürüyüş ekranı telefonda açılıyor |
| Pazar 10:00 | Çekirdek donar: üç PR da `main`'de, baştan sona prova yapılır |
| Pazar 13:00 | Özellik donar: yeni özellik eklenmez |
| Pazar 15:30 | Teslim (son saat 17:00) |

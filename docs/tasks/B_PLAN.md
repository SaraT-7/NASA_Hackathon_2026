# İş kolu B · Planlama ekranı

**Branch:** `feature/plan` · **Sahibi olduğun yollar:** `plan/**`

Önce `docs/CONTRACT.md` dosyasını oku. Bu dosya senin iş sıranı verir; biçimlerin tanımı sözleşmededir.

## Görevin

Habitattaki ekibin bilgisayarda kullandığı planlama ekranını yapmak: katmanlı harita, durak seçimi,
iki alternatif rota, rota özeti ve "yürüyüşe gönder". Ekran `plan/index.html` adresinde açılır.

`plan/` içinde çalışan bir başlangıç sayfası var: haritayı, iki katmanı, habitatı ve durakları gösteriyor. Oradan devam et.

## Dokunma

`walk/`, `shared/`, `app_data/`, `pipeline/`, `tools/`, `index.html`, `docs/`. `shared/` içinde bir eksik görürsen
kendi klasöründe çözmeye çalışma; gruba yaz (sözleşme, bölüm 1).

## Kurulum

```bash
git checkout main && git pull origin main
git checkout -b feature/plan
python -m http.server 8000        # repo kökünde; sonra http://localhost:8000/plan/
node tools/test_shared.mjs        # "shared modules OK" vermeli
```

## Değişmez kurallar

- Izgara boyutu, hücre boyutu, dosya adı koda sabit yazılmaz; hepsi `grid` nesnesinden okunur. Deneme verisi 500 × 500, gerçek veri ~1000 × 1000 hücre.
- Süre ve mesafe hesabını kendin yazma: rota nesnesini `buildRoute()` kurar, sayıları o verir.
- Geçilmez hücreden (`isPassable` false) rota geçmez. Maliyette `riskForCost()` kullan.
- Dışarıdan (CDN) hiçbir şey yükleme. Leaflet `../shared/vendor/leaflet/` içinde.
- Arayüz metinleri İngilizce. "Safe" yazma; "lowest estimated risk" yaz.

## İş sırası

Her adımın sonunda sayfa çalışır durumda olsun ve bir commit at.

### 1. Rota arama (`plan/astar.js`)

- `findPath(grid, startIndex, goalIndex, weight)` → hücre numaraları dizisi ya da `null`.
- 8 komşulu A*. Adım maliyeti = `mesafe × (1 + weight × riskForCost / 100)`. Sezgisel: hedefe düz mesafe.
- Referans uygulama `tools/make_mock_route.mjs` içinde var; `plan/astar.js` dosyasına uyarlayabilirsin (o dosyayı değiştirme, kopyala).
- 1000 × 1000 ızgarada arayüz donuyorsa aramayı bir Web Worker'a taşı.

### 2. Durak seçimi ve rota çizimi

- Başlangıç her zaman habitat. Duraklar `stops.json` listesinden seçilir (liste + haritadaki işaretler). Seçim sırası ziyaret sırasıdır.
- Haritaya tıklayarak özel bir durak eklemek isteğe bağlı; önce liste çalışsın.
- Seçim değişince iki rota hesapla: `weight = 0` ("Shortest") ve `weight = 8` ("Lowest estimated risk"). Çok duraklı rota, bacakların uç uca eklenmesidir.
- Her rotayı `buildRoute(grid, cells, { name, kind, weight, stops })` ile kur; haritada farklı renkte çizgi olarak göster.
- Durağa yol yoksa (`null`) kullanıcıya açıkça söyle: "No passable route to <stop>".

### 3. Rota kartları ve karşılaştırma

İki rota yan yana iki kart. Her kartta, `route.totals` üzerinden:

- mesafe (m), yürüyüş süresi, toplam Marswalk süresi (`totalEvaS`, `formatDuration`)
- en dik eğim, toplam çıkış, ortalama risk, verisi olmayan hücre sayısı
- bir cümlelik gerekçe: örn. "410 m longer, avoids 3 steep ridge crossings"
- toplam süre `ASSUMPTIONS.EVA_LIMIT_S` değerini aşıyorsa kırmızı uyarı

Karta tıklayınca o rota "seçili" olur.

### 4. Yükseklik profili

Seçili rota için `points[].dist` – `points[].elev` grafiği (SVG ya da canvas; kütüphane yok). Durakların yeri grafikte işaretli.

### 5. Koşullar ve veri güven paneli

- "Last measured conditions": `loadJson(grid, 'conditions')` içindeki `items` satır satır; her satırda değer, birim, ölçüm günü, cihaz.
- "Data and limits": `grid.meta.sources` (katman, görev, cihaz, çözünürlük, `cannot_see`), `grid.meta.risk_model` ve `ASSUMPTIONS` sabitleri. Açılır kapanır bir panel olabilir.
- `grid.meta.mock` true ise görünür bir "DEMO TERRAIN" etiketi.

### 6. Yürüyüşe gönder

"Start walk" düğmesi: `saveRoute(seciliRota)` çağır, sonra `../walk/` adresine git. Yürüyüş ekranı gerisini halleder.

### 7. Düzen

- Ortada büyük harita; solda katmanlar ve durak listesi; sağda rota kartları; altta yükseklik profili.
- Görsel referans: `docs/prototype/argon_prototype.html` (ekibin ilk arayüz taslağı). Oradan görünüm fikri al; içindeki sahte sayıları ve hazır çizilmiş rotaları taşıma.
- 1280 × 720 ekranda kaydırmadan kullanılabilmeli (demo videosu bu boyutta çekilecek).

## Bitti sayılır

- [ ] Deneme verisinde: iki durak seçince iki farklı rota çiziliyor, hiçbiri geçilmez hücreden geçmiyor
- [ ] "Shortest" rotası daha kısa, "Lowest estimated risk" rotasının ortalama riski daha düşük
- [ ] Kartlardaki süreler `node tools/test_shared.mjs` ile aynı hesaptan geliyor (`buildRoute`)
- [ ] Yükseklik profili ve iki panel doluyor
- [ ] "Start walk" sonrası `/walk/` sayfası "DEMO ROUTE" yerine seçilen rotayı gösteriyor
- [ ] A'nın gerçek verisi `main`'e girdikten sonra kodda hiçbir değişiklik yapmadan çalışıyor
- [ ] Tarayıcı konsolunda hata yok; PR yalnızca `plan/` yollarını içeriyor

## Çekirdekten sonra (pazar 10:00 – 13:00, sırayla)

1. Curiosity'nin gerçek yolunu katman olarak göster (`curiosity_path`) ve rotamızla ne kadar örtüştüğünü ölç.
2. "Report new obstacle" düğmesi: haritada işaretlenen hücreler geçilmez olur, rota yeniden hesaplanır.

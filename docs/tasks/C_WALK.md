# İş kolu C · Yürüyüş ekranı ve sunum

**Branch:** `feature/walk` · **Sahibi olduğun yollar:** `walk/**`; pazar 12:00'den sonra `README.md`

Önce `docs/CONTRACT.md` dosyasını oku. Bu dosya senin iş sıranı verir; biçimlerin tanımı sözleşmededir.

## Görevin

Astronotun yürürken telefonda baktığı ekranı yapmak: sıradaki durak, kalan mesafe, en geç dönüş anı ve
yürüyüşü canlandıran bir düğme. Ekran `walk/index.html` adresinde açılır. Pazar öğleden sonra demo ve proje sayfası da sende.

`walk/` içinde çalışan bir başlangıç sayfası var: rotayı yüklüyor ve üç sayı gösteriyor. Oradan devam et.

## Dokunma

`plan/`, `shared/`, `app_data/`, `pipeline/`, `tools/`, `index.html`, `docs/`. `shared/` içinde bir eksik görürsen
kendi klasöründe çözmeye çalışma; gruba yaz (sözleşme, bölüm 1).

## Kurulum

```bash
git checkout main && git pull origin main
git checkout -b feature/walk
python -m http.server 8000        # repo kökünde; sonra http://localhost:8000/walk/
```

Telefonda denemek için: bilgisayar ve telefon aynı Wi-Fi'da olsun, telefonda `http://<bilgisayarın-IP-adresi>:8000/walk/` aç.
Tarayıcının geliştirici araçlarındaki telefon görünümü (390 × 844) de günlük çalışma için yeterli.

## Değişmez kurallar

- Planlama ekranını bekleme: kayıtlı rota yoksa `loadMockRoute()` deneme rotasını verir. B'nin işi bitince `loadRoute()` gerçek rotayı döndürür; senin kodun değişmez.
- Süre ve dönüş hesabını kendin yazma: `returnTimeS`, `totalEvaS`, `ASSUMPTIONS`, `formatDuration` kullan. Planlama ekranıyla aynı sayıyı göstermek zorundasın.
- Rota uzunluğu, durak sayısı, alan boyutu koda sabit yazılmaz; hepsi rota nesnesinden okunur.
- Eldivenli kullanım: ekranda en fazla **üç büyük düğme**, hiçbir yerde yazı girişi yok, dokunma hedefleri en az 64 px.
- Dışarıdan (CDN) hiçbir şey yükleme. Arayüz metinleri İngilizce.
- Astronotun konumu gerçek değil, canlandırma. Ekranda "SIMULATED POSITION" etiketi görünür.

## İş sırası

Her adımın sonunda sayfa çalışır durumda olsun ve bir commit at.

### 1. Yürüyüş durumu (`walk/state.js`)

Ekrandan bağımsız, saf bir durum modülü yaz; arayüz yalnızca bunu okur. Sonradan eklenecek özellikler (konum doğrulama gibi) buraya bağlanacak.

- Durum: `phase` (`ready` | `walking` | `at_stop` | `returning` | `done`), `pointIndex` (rota üzerindeki konum), `elapsedS`, `nextStop`.
- `tick(dtS)`: canlandırma süresini ilerletir. `walking` iken konum, `route.points[].time` değerlerine göre ilerler. `returning` iken aynı yol tersine, `RETURN_FACTOR` ile yürünür.
- Durağa varınca `at_stop` olur ve bekler; astronot "Done here" deyince `STOP_WORK_S` süresi eklenir ve sıradaki durağa yürünür.
- Son duraktan sonra, ya da astronot "Turn back" deyince `returning` başlar; habitata varınca `done`.

### 2. Ana göstergeler

Büyük yazıyla, tek bakışta:

- **Next stop:** adı ve oraya kalan mesafe (m). Dönüşte "Habitat".
- **Elapsed:** geçen süre.
- **Turn back in:** dönmeye başlamak için kalan süre = `EVA_LIMIT_S − elapsedS − returnTimeS(route, pointIndex)`.
- **Durum rengi:** kalan süre 30 dakikadan fazlaysa yeşil ("GO"), 0–30 dakika sarı ("TURN BACK SOON"), eksiye düştüyse kırmızı ("TURN BACK NOW"). Eşikler `walk/` içinde sabit olarak dursun.

### 3. Düğmeler (en fazla üç)

- **Start / Pause**
- Duruma göre değişen ana düğme: durakta "Done here"
- **Turn back**

### 4. Canlandırma hızı

Demo için hız seçimi (×1, ×30, ×120). Küçük, köşede; üç ana düğmeden sayılmaz ve "demo control" olarak etiketlenir.

### 5. Küçük harita

Ekranın üst yarısında Leaflet haritası (`L.CRS.Simple`): `fileUrl(grid, 'ortho_small')` görseli, rota çizgisi, duraklar, habitat ve astronotun konumu. Konum ilerledikçe harita onu takip eder. Kurulum için `plan/plan.js` başlangıç dosyasına bakabilirsin (kopyala, o dosyayı değiştirme).

### 6. Durak kartı

`at_stop` iken: durağın adı, açıklaması ve varsa fotoğrafı (`stops.json` içindeki `photo`; yoksa kart fotoğrafsız görünür).
Rota nesnesindeki durak `id` değeriyle `loadJson(grid, 'stops')` içinden eşleştir.

### 7. Telefon kontrolü

390 × 844 ekranda kaydırma olmadan her şey görünmeli. Gerçek bir telefonda aç ve güneş altında okunuyor mu diye bak (yüksek kontrast).

## Bitti sayılır

- [ ] Deneme rotasıyla: Start → duraklar → dönüş → habitat akışı baştan sona yürüyor
- [ ] Kalan mesafe durağa varınca 0 oluyor; "Turn back in" süresi yürüdükçe azalıyor
- [ ] Hız ×120 iken de duraklar atlanmıyor
- [ ] "Turn back" her aşamada çalışıyor ve habitata götürüyor
- [ ] Planlama ekranından "Start walk" ile gelindiğinde seçilen rota yükleniyor, "DEMO ROUTE" etiketi kayboluyor
- [ ] Ekranda en fazla üç ana düğme var, yazı girişi yok
- [ ] Tarayıcı konsolunda hata yok; PR yalnızca `walk/` yollarını içeriyor

## Pazar 12:00'den sonra: demo ve proje sayfası

- Güncel Project Submission Guide'dan demo sınırını teyit et (okuduğumuz 2025 sürümünde: en fazla 30 saniye video, İngilizce altyazılı; ya da en fazla 7 slayt).
- Demo akışı: iki durak seç → iki rotayı karşılaştır → "Start walk" → telefonda yürüyüş → dönüş uyarısı.
- Proje sayfası (İngilizce): özet, detaylı açıklama, NASA verileri (`grid.json` içindeki `sources` listesinden), diğer araçlar, yapay zeka beyanı (Claude; ilk arayüz taslağı için Argon).
- `README.md`: proje nedir, nasıl çalıştırılır, veri kaynakları, varsayımlar ve sınırlar.
- Bütün linkleri gizli sekmede, giriş yapmadan aç. **Teslim: pazar 15:30** (son saat 17:00).

## Çekirdekten sonra (pazar 10:00 – 12:00, sırayla)

1. İnternetsiz çalışma: `walk/` için service worker ve manifest (telefonda uçak modunda açılmalı).
2. Gerçek hıza göre güncellenen dönüş anı: astronot plandan yavaşsa "Turn back in" buna göre kısalır.

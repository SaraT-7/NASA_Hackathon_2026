# MarsWalk · Veri kaynakları ve türetmeler

Uygulamadaki her sayının, her katmanın ve her filtrenin nereden geldiğinin tek listesi. Sunumda, proje sayfasının
"NASA Data" alanında ve jüri sorularında buradan cevap veriyoruz. **Yeni bir katman ya da varsayım eklenince bu
dosyaya da satır eklenir** (sorumlu: A iş kolu, Samet).

Her öğe üç türden biridir:

- **Ölçüm:** NASA'nın ya da ortağının yayımladığı veri; olduğu gibi kullanıyoruz (yalnız kesip yeniden örnekliyoruz).
- **Türetilmiş:** Ölçümden, bizim yazdığımız bir hesapla elde edildi. Yöntem bizim, girdi NASA'nın.
- **Varsayım:** Bizim seçtiğimiz bir sayı ya da konum; kaynağı varsa yazılı. Arayüzde "assumption" / "hypothetical" olarak görünür.

## 1. Özet

| # | Ne | Tür | Kaynak | Kodda |
| --- | --- | --- | --- | --- |
| 1 | Yükseklik modeli | Ölçüm | USGS MSL Gale Merged DEM 1 m v3 (MRO HiRISE stereo) | `pipeline/01_cut_dem.py` |
| 2 | Eğim | Türetilmiş | 1'den | `pipeline/03_export_app_data.py` |
| 3 | 20° geçilmezlik sınırı | Varsayım (NASA gereksinimi) | NASA EVA-EXP-0075 | `pipeline/config.py` |
| 4 | Birleşik risk formülü | Türetilmiş (yöntem bizim) | 2, 3 ve katmanlar | `pipeline/06_layers.py`, `shared/data.js` |
| 5 | Katman: Curiosity'nin sürüş izi | Ölçüm + varsayım (şerit genişliği, ağırlık) | NASA/JPL MSL traverse (MMGIS) | `06_layers.py` → `layer_curiosity` |
| 6 | Katman: İletişim gölgesi | Türetilmiş + varsayım (habitat yeri, anten boyları, ağırlık) | 1'den görüş hattı hesabı | `06_layers.py` → `layer_comm` |
| 7 | Katman: Boxwork sırtları | Türetilmiş + varsayım | HiRISE görüntüsünden kural tabanlı tespit | hazırlanıyor (henüz `main`'de değil) |
| 8 | Uydu görüntüsü | Ölçüm | USGS/JPL MSL Gale HiRISE renkli mozaik | `pipeline/02_cut_ortho.py` |
| 9 | Bilim durakları | Ölçüm (rover konumları) | NASA/JPL MSL waypoints (MMGIS) | `03_export_app_data.py` |
| 10 | Habitat | Varsayım | Alanın en düz yakın noktası | `03_export_app_data.py` |
| 11 | Durak fotoğrafları | Ölçüm | Curiosity Navcam ham görüntüleri | `pipeline/05_stop_photos.py` |
| 12 | Radyasyon | Ölçüm (son arşivlenen) | MSL RAD, NASA PDS | `pipeline/04_conditions.py` |
| 13 | Hava (sıcaklık, basınç, UV) | Ölçüm (son yayımlanan) | MSL REMS hava raporu | `pipeline/04_conditions.py` |
| 14 | Yürüme hızı ve eğimde değişimi | Varsayım (NASA + Tobler) | NTRS 20210026296; Tobler yürüyüş fonksiyonu | `shared/walk-model.js` |
| 15 | 6 saat yürüyüş sınırı | Varsayım (NASA) | NASA EVA-EXP-0075 | `shared/walk-model.js` |
| 16 | Dönüşte %20 güvenlik payı | Varsayım (bizim) | — | `shared/walk-model.js` |
| 17 | Durakta 20 dk çalışma | Varsayım (bizim) | — | `shared/walk-model.js` |
| 18 | Oksijen göstergesi | Türetilmiş (15'ten) | Sensör yok; 6 saatlik bütçe yüzdeye çevrildi | `walk/oxygen.js` |
| 19 | Rota arama | Yöntem | A* (8 komşu), maliyet = mesafe × (1 + ağırlık × risk / 100) | `plan/astar.js` |

## 2. Ayrıntı

### 1 · Yükseklik modeli (ölçüm)

- **Ürün:** Mars MSL Gale Merged DEM 1 m v3, USGS Astrogeology (Parker ve Calef). https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
- **Nasıl üretilmiş:** NASA Mars Reconnaissance Orbiter, HiRISE kamerasının stereo görüntü çiftleri; HiRISE stereo olmayan yerler CTX ve HRSC ile doldurulmuş, MGS MOLA lazer altimetresine bağlanmış.
- **Bizim yaptığımız:** 3,6 GB'lık mozaikten yalnız 2 × 2 km'lik alanı kestik (güneybatı köşe 4,82° G, 137,36° D). Uygulamada 2 m'lik hücrelere ortalama alarak indirdik. Alanda 500 m yükseklik farkı var.
- **Göremedikleri:** Birkaç metreden küçük şekiller. Tek tek kayalar ve dar sırtların tepeleri yumuşamış.
- **EN:** "Elevation comes from the USGS 1 m merged DEM of Gale Crater, built from HiRISE stereo images taken by NASA's Mars Reconnaissance Orbiter."

### 2 · Eğim (türetilmiş)

- 1 m'lik modeli 1,5 m Gauss filtresiyle yumuşatıp (piksel gürültüsü) eğimi hesapladık. Her 2 m hücre içindeki **en dik** değeri alır (temkinli seçim).
- `slope.bin` aşağı yuvarlanır: geçilebilir bir hücre ekranda hiçbir zaman "20°" görünmez.

### 3 · 20° geçilmezlik sınırı (NASA gereksinimi)

- **Kaynak:** NASA Exploration EVA System Concept of Operations Summary (EVA-EXP-0075): giysiyle 20°'ye kadar eğimde yukarı, aşağı ve yanlamasına yürüme. https://www.nasa.gov/wp-content/uploads/2020/01/topic_1-_eva_lunar_surface_concept_of_operations.pdf
- Ay görevleri (Artemis) için yazılmış; Mars için ayrı bir giysi şartnamesi yok. Bunu açıkça söylüyoruz.
- **Sonuç:** Alanın %31,7'si geçilmez. Katmanlar bu hücreleri hiçbir zaman açmaz.

### 4 · Birleşik risk (yöntem bizim)

```
risk = clamp( round( eğim / 20 × 100  +  Σ ağırlık × katman / 100 ), 0, 100 )      eğim ≥ 20° → geçilmez
```

- Her katman hücre başına 0–100 puan. Ağırlıklar (risk puanı) bizim seçimimiz, ölçüm değil; arayüzde "assumption".
- Planlama ekranında her katman ayrı açılıp kapatılabilir; rota yalnız açık katmanlarla yeniden hesaplanır (`combineRisk`).
- "Shortest" rotası riski hiç hesaba katmaz (ağırlık 0); "Lowest estimated risk" rotası ağırlık 8 ile hesaplar.

### 5 · Katman: Curiosity'nin sürüş izi (ölçüm + varsayım)

- **Kaynak:** NASA/JPL-Caltech MSL traverse, MMGIS harita sunucusu: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json (1317 sürüş çizgisi, metre altı sıklıkta).
- **Bizim yaptığımız:** İzi yerel metreye çevirip ±3 m'lik bir şerit çizdik (rover yaklaşık 3 m genişliğinde; konum hatası payı). Alan içinde 4,1 km iz, hücrelerin %0,7'si.
- **Varsayım:** Ağırlık **−20**: 900 kg'lık bir rover geçtiyse zemin sağlam ve geçilebilir; risk 20 puan düşer.
- **Göremedikleri:** Tek bir iz; izin dışındaki zemin için bir şey söylemez.
- **Doğrulama:** İz üç bilim durağının da tam üstünden geçiyor (duraklar rover'ın kaldığı yerler) → koordinat dönüşümü doğru.
- **Etki:** Deneme rotası izin %11'i yerine %41'inde yürüyor.
- **EN:** "Ground that Curiosity already drove on is proven firm, so the planner prefers it."

### 6 · Katman: İletişim gölgesi (türetilmiş + varsayım)

- **Ayrı bir NASA iletişim verisi yok.** 1'deki yükseklik modelinden biz hesapladık.
- **Yöntem:** Habitattan her yöne ışın tarama (görüş hattı / viewshed). Bir hücrede giysi anteninden habitat antenine çekilen düz çizgiyi arazi kesiyorsa o hücre gölgede. Mars'ın eğriliği dahil (2 km'de ~0,6 m). Hücreye düşen ışınların çoğu görmüyorsa gölge sayılır (temkinli).
- **Varsayımlar:** Habitatın yeri (10, varsayımsal); habitat anteni 3 m direk; giysi anteni zeminden 2 m; ağırlık **+20**.
- **Göremedikleri:** Yörüngedeki aktarıcı uydular, rover ya da tepeye kurulacak aktarıcılar yok; telsizin sırt etrafında kırınımı yok; 2 m ızgara dar tepeleri yumuşatır.
- **Sonuç:** Alanın %70'i habitatı görmüyor (habitat vadi tabanında). Habitat ve üç durağın kendisi görüş hattında.
- **Etki:** Deneme rotasının gölgedeki kısmı 474 m'den 323 m'ye indi; rota 15 m uzadı.
- **EN:** "Radio shadow is computed from the elevation model: where terrain blocks the line of sight to the habitat's antenna, the astronaut cannot call home."

### 7 · Katman: Boxwork sırtları (hazırlanıyor)

- **Girdi:** 8'deki HiRISE görüntüsü (0,5 m). Yükseklik modeli 1–2 m'lik sırtları çözemeyecek kadar yumuşak.
- **Yöntem (kural tabanlı, makine öğrenmesi yok):** Sato çizgi filtresiyle parlak sırt çizgileri; ~40 m pencerede sırt yoğunluğu ve yönlerin ne kadar dağınık olduğu. Çok yönlü, kesişen sırtlar = boxwork; paralel çizgiler = kaya katmanı kenarı, dışarıda kalır.
- **Doğrulama (prototipte):** Görüntüde bulunan sırtlar yükseklik modelinde çevresinden ortalama ~20 cm yüksek (bağımsız veri). Boxwork bölgesi alanın %12'si ama Curiosity'nin 144 konumunun 56'sı (%39) bu bölgede.
- **Varsayım:** Ağırlık +15 (sırt aşma). Eklendiğinde bu bölüm güncellenecek.

### 8 · Uydu görüntüsü (ölçüm)

- **Ürün:** MSL Gale Merged Orthophoto Mosaic, HiRISE renkli sürüm (USGS / JPL; Calef ve Parker). https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm
- 0,25 m'lik mozaikten 0,5 m/piksel kestik. Yalnız gösterim ve 7. katman için kullanılıyor.
- **Göremedikleri:** ~1 m'den küçük kayalar; gevşek kum sağlam zeminden ayırt edilemez.

### 9 · Bilim durakları (ölçüm)

- **Kaynak:** NASA/JPL MSL waypoints (MMGIS): https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json
- Duraklar, Curiosity'nin alan içinde en uzun kaldığı üç yer: sol 4560'tan 11 sol; sol 4687–4805; sol 4868'den ~40 sol. Yani gerçek bilim ekibinin seçtiği yerler.

### 10 · Habitat (varsayım)

- Alanın içinde, duraklara yakın en düz nokta. Ekranda "Habitat (hypothetical)". İletişim gölgesi (6) bu konuma bağlı.

### 11 · Durak fotoğrafları (ölçüm)

- Curiosity Navcam ham görüntüleri (NASA/JPL-Caltech), siyah beyaz. s1: sol 4560, s2: sol 4722, s3: sol 4874. Bağlantılar `app_data/stops.json` → `photo.source_url`.

### 12 · Radyasyon (ölçüm, son arşivlenen)

- **MSL RAD**, NASA PDS Planetary Plasma Interactions düğümü: https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-3-RDR-V1.0
- 0,16 mGy/gün: sol 4841–4843 (21 Mart 2026'ya kadar), 262 gözlemin ortalaması. Emilen doz (absorbed dose), eşdeğer doz (mSv) değil.
- Canlı değil: ekranda "last measured" ve tarih.

### 13 · Hava (ölçüm, son yayımlanan)

- **MSL REMS** hava raporu, sol 4995 (25 Ağustos 2026): https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json
- Bu rapor tanıtım ürünü (Centro de Astrobiología / NASA-JPL); bilimsel arşiv NASA PDS Atmospheres düğümünde: https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/rems.html

### 14–17 · Yürüme modeli varsayımları

| Sabit | Değer | Kaynak |
| --- | --- | --- |
| Düz zeminde hız | 2,0 km/saat | NASA Artemis yürüyüş menzili çalışması, NTRS 20210026296: https://ntrs.nasa.gov/citations/20210026296 · Apollo planlamacıları 2,7 km/saat: https://www.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.gaits.html |
| Eğimde hız | Tobler yürüyüş fonksiyonu, giysi için ölçeklenmiş (~0,4 ×) | Tobler (1993), yaygın kullanılan yürüyüş modeli; ölçek 2,0 km/saat'ten türetildi |
| Yürüyüş sınırı | 6 saat | NASA EVA-EXP-0075: 8 saate kadar, 6 ± 2 saat |
| Dönüşte güvenlik payı | +%20 | Bizim seçimimiz; ölçülmüş yavaşlama değil |
| Durakta çalışma | 20 dk | Bizim seçimimiz |

### 18 · Oksijen göstergesi (türetilmiş)

- **Oksijen sensörü ya da ölçülmüş tüketim yok.** Gösterge, 6 saatlik giysi bütçesini (15) yüzdeye çeviriyor: başta %100, yürüyüş saatiyle eşit hızda düşüyor; çizgi "buradan dönmek için gereken". Ekranda "estimated".

### 19 · Rota arama (yöntem)

- A*, 8 komşu, 2 m hücre. Adım maliyeti = mesafe × (1 + ağırlık × risk / 100). Veri olmayan hücre en yüksek risk sayılır. Tarayıcıda çalışır (0,04–0,15 sn).

## 3. Doğrulama kanıtları

- Curiosity'nin alan içindeki 144 gerçek konumunun **135'i (%93,8)** modelimizde geçilebilir.
- NASA'nın sürüş izi üç durağın da üstünden geçiyor → konum dönüşümü doğru.
- Habitat ve bütün duraklar geçilebilir hücrelerde ve habitatla görüş hattında.
- Tarayıcıdaki katman birleştirme, bütün katmanlar açıkken `risk.bin` ile bayt bayt aynı (`node tools/test_shared.mjs`).

## 4. Jüri sorularına hazır cevaplar

- **"Bu veriler gerçek mi?"** Arazi, görüntü, rover izi, duraklar, fotoğraflar, radyasyon ve hava NASA'nın yayımladığı gerçek veri. İletişim gölgesi ve boxwork sırtları bu verilerden bizim hesabımız. Habitatın yeri ve ağırlıklar varsayım; ekranda öyle yazıyor.
- **"Yenilik ne?"** Bu veriler ayrı ayrı vardı; biz onları astronotun tek bir kararında birleştirdik: "Buradan yürüyebilir miyim, yardım çağırabilir miyim ve zamanında dönebilir miyim?" Her katman açılıp kapatılabiliyor, rotanın neden değiştiği görülüyor.
- **"Ağırlıkları nereden buldunuz?"** Bizim seçimimiz; ölçüm değil. Bu yüzden arayüzde "assumption" yazıyor ve her katman kapatılabiliyor. Gerçek görevde bunlar ekip ve astronotla birlikte ayarlanır.
- **"Mars için giysi şartnamesi var mı?"** Yok; NASA'nın Artemis (Ay) gereksinimlerini kullandık ve bunu açıkça söylüyoruz.
- **"Model neyi göremiyor?"** Tek tek kayalar, gevşek kum, 1–2 m'lik sırtların yüksekliği, aktarıcı uydular. Her katmanın "Cannot show" satırında yazılı.

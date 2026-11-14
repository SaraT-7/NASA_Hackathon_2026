# İş kolu A · Veri

**Branch:** `feature/data` · **Sahibi olduğun yollar:** `pipeline/**`, `app_data/**`, `requirements.txt`, `data/**`

Önce `docs/CONTRACT.md` dosyasını oku. Bu dosya senin iş sıranı verir; biçimlerin tanımı sözleşmededir.

## Görevin

Gerçek NASA verisinden, boxwork bölgesindeki 2 × 2 km'lik alan için `app_data/` klasörünü üretmek.
Şu an o klasörde deneme verisi var; sen aynı dosya adlarıyla gerçeğini koyacaksın. B ve C iş kolları
senin dosyalarını yalnızca okur, bu yüzden biçime birebir uyman yeterli: onların kodu değişmeden çalışır.

## Dokunma

`plan/`, `walk/`, `shared/`, `tools/`, `index.html`, `docs/`. Bunlarda bir sorun görürsen değiştirme, gruba yaz.

## Kurulum

```bash
git checkout main && git pull origin main
git checkout -b feature/data
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python tools/validate_app_data.py                    # deneme verisiyle "OK" vermeli
```

GDAL pip ile kurulmazsa: `conda install -c conda-forge gdal rasterio`.
Ham veriyi `data/raw/` içine indir; bu klasör git'e girmez.

## İş sırası

Her adımın sonunda bir commit at. Betiklerini `pipeline/` içine, numaralı adlarla koy (`01_cut_aoi.py`, ...).

### 1. Alanı seç (ilk 1 saat)

- Curiosity'nin boxwork bölgesindeki konumlarını bul (yaklaşık sol 4534 ve sonrası). Kaynak: MSL Analyst's Notebook (`an.rsl.wustl.edu`) traverse verisi ya da NASA'nın "Where is Curiosity" haritası.
- Bu yolun ortasına gelen 2 × 2 km'lik bir kare seç. Karenin köşelerini yükseklik modelinin kendi projeksiyonunda (metre) ve enlem/boylam olarak not et.
- Habitat için alanın içinde düz bir nokta seç (varsayımsal).

### 2. Yükseklik modelini kes ve kalitesini kontrol et (en kritik adım)

Kaynak: USGS "Mars MSL Gale Merged DEM 1m v3" (3,6 GB). Tamamını indirme, yalnızca alanı kes:

```bash
gdalinfo /vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif
gdal_translate -projwin <ulx> <uly> <lrx> <lry> \
  /vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif data/raw/aoi_dem_1m.tif
```

**Kontrol:** Kesitten bir gölgeli kabartma (hillshade) üret ve bak. Boxwork sırtları (yaklaşık 5 m geniş, 1–2 m yüksek) seçilebiliyor mu?

- Seçiliyorsa devam et.
- Görüntü bulanık ve pürüzsüzse o bölge daha kaba veriyle doldurulmuş demektir. **Hemen gruba haber ver.** Yedek: `uahirise.org/dtm` üzerinden o bölgenin tekil HiRISE yükseklik modelini ara; o da yoksa kareyi Curiosity yolunun iyi kapsanan kısmına kaydır.

### 3. Eğim ve risk

- Eğimi 1 m veriden hesapla (`gdaldem slope` ya da numpy gradient), sonra 2 m'lik hücrelere indirirken her 2 × 2 bloğun **en büyük** eğimini al (temkinli seçim).
- Yüksekliği 2 m'ye indirirken ortalama al.
- Risk (çekirdek sürüm): `risk = round(eğim / 30 × 100)`, en fazla 100. Eğim ≥ 30° ise `255` (geçilmez). Veri olmayan hücre `254`.
- Bu kuralı `grid.json` içindeki `risk_model` alanına yaz. 30° bir varsayımdır; öyle etiketle.

### 4. Uydu görüntüsü

Kaynak: USGS "MSL Gale Merged Orthophoto Mosaic 25cm v3" (23 GB; `/vsicurl/` ile yalnızca alanı kes).

- `ortho`: 0,5 m/piksel (2 km için 4000 px), JPG, kalite ~85.
- `ortho_small`: 1 m/piksel (2000 px), JPG.
- Kesim çok yavaşsa yedek: yaklaşık 1 GB'lık renkli sürüm (`MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif`).

### 5. Dışa aktarım betiği

`pipeline/export_app_data.py` yaz: önceki adımların çıktılarından `app_data/` içindeki **bütün** dosyaları üretsin.
Örnek olarak `tools/make_mock_data.py` dosyasına bak; aynı dosyaları aynı biçimde yazıyor.

- `risk.bin`, `slope.bin` (`uint8`), `elevation.bin` (`float32` little-endian); satır 0 kuzey.
- `risk.png`, `slope.png`: yarı saydam renkli katmanlar (deneme betiğindeki renkleri kullanabilirsin).
- `grid.json`: `mock: false`, gerçek `cols`, `rows`, `georef.sw_lat`, `georef.sw_lon`, `files` (uzantılar `.jpg` olabilir), `risk_model`, `sources`.

```bash
python pipeline/export_app_data.py
python tools/validate_app_data.py      # "OK" vermeden PR açma
node tools/make_mock_route.mjs         # deneme rotasını yeni araziye göre yeniden üretir
python -m http.server 8000             # http://localhost:8000/plan/ : gerçek arazi görünmeli
```

**İlk PR'ı bu noktada aç** (cumartesi gece hedefi). Duraklar ve ölçümler hâlâ deneme olabilir; o dosyalardaki `"mock": true` kalır.

### 6. Duraklar ve Curiosity yolu

- `stops.json`: habitat + 3–5 bilim durağı. Her durak bir sırt ya da çukur olsun; `description` bir cümle (İngilizce).
- `curiosity_path.json`: rover'ın alan içindeki gerçek konumları, yerel metreye çevrilmiş, `sol` numarasıyla.
- Enlem/boylamdan yerel metreye çevirirken yükseklik modelinin projeksiyonunu kullan; sonucu uydu görüntüsü üzerinde gözle doğrula (rover izi görüntüde seçilebiliyor).

### 7. Son ölçülen koşullar

`conditions.json`: RAD'den radyasyon doz hızı, REMS'ten basınç ve hava sıcaklığı. Her değer için ölçüm günü (`measured`) ve kaynak linki.
Bunlar "son arşivlenmiş ölçüm"dür, canlı veri değildir.

### 8. Kaynak listesi

`grid.json` içindeki `sources` alanını her katman için doldur: görev, cihaz, ürün kimliği, çözünürlük, link, `cannot_see`.
Bu liste hem veri güven panelini hem de proje sayfasındaki "NASA Data" alanını besler. Çalışırken tut, sona bırakma.

## Bitti sayılır

- [ ] `python tools/validate_app_data.py` hatasız, `grid.json` içinde `mock: false`
- [ ] `/plan/` sayfasında gerçek uydu görüntüsü ve risk katmanı üst üste oturuyor (sırtlar aynı yerde)
- [ ] Bir boxwork sırtının üzerinden geçen kesitte yükseklik 1–2 m değişiyor
- [ ] Habitat ve bütün duraklar geçilebilir hücrelerde
- [ ] `sources` içindeki her alan dolu
- [ ] `app_data/` toplamı 25 MB'ın altında
- [ ] PR yalnızca `pipeline/`, `app_data/`, `requirements.txt` yollarını içeriyor

## Çekirdekten sonra (pazar 10:00 – 13:00, sırayla)

1. Gölge tabanlı kaya tespiti: bulunan kayalar `risk.bin` içinde `255` olur.
2. Duraklara Curiosity fotoğrafları (`app_data/photos/`, `stops.json` içinde `photo`).

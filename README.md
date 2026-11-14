# Boxwork Seferi · Mars Keşif Yürüyüşü İçin Akıllı Harita

NASA Space Apps Challenge 2026 — *Interplanetary Survival Guide: Martian Map*

Gale Krateri / Mount Sharp'taki boxwork oluşumlarına yapılacak bir astronot yürüyüşü (Marswalk)
için çok katmanlı harita: HiRISE/CTX topografya, HiRISE optik, CRISM spektral, THEMIS termal,
Curiosity RAD/REMS ve Mastcam/Navcam verilerini birleştirip **tahmini düşük riskli** rotalar üretir.

## Klasör yapısı

```
app.py              Streamlit arayüzü (giriş noktası)
src/data/           Veri indirme, okuma, kırpma
src/risk/           Eğim, pürüzlülük ve risk (maliyet) ızgarası
src/rocks/          HiRISE üzerinde kaya tespiti
src/routing/        A*, alternatif rotalar, Dijkstra güvenli dönüş alanı
src/ui/             Harita ve grafik bileşenleri
data/raw/           Ham veriler (git'e girmez)
data/processed/     İşlenmiş katmanlar (git'e girmez)
notebooks/          Denemeler
docs/               Görev özeti, sunum
```

## Kurulum

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
streamlit run app.py
```

> Windows'ta `gdal`/`rasterio` pip ile sorun çıkarırsa: `conda install -c conda-forge gdal rasterio`

## Veriler

Büyük raster dosyaları GitHub'a **yüklenmez**. Ortak Drive klasöründen `data/raw/` içine indirin.
Drive linki: _(buraya ekleyin)_

## Ekip ve görev paylaşımı

| Kişi | Sorumluluk | Branch |
|------|------------|--------|
| 1 | Veri işleme, eğim/risk katmanları, kaya tespiti | `feature/risk` |
| 2 | Rota algoritması, alternatif rotalar, güvenli dönüş alanı | `feature/routing` |
| 3 | Arayüz (planlama + yürüyüş), veri güven paneli, sunum | `feature/ui` |

## Çalışma kuralları

- `main` her zaman çalışır durumda kalır; doğrudan `main`'e push yok.
- Herkes kendi branch'inde çalışır, bitince Pull Request açar, bir kişi bakıp birleştirir.
- Sık sık `git pull` yapın, küçük ve açıklamalı commit atın.

## Not

Rotalar "güvenli" değil, **"tahmini düşük riskli"** olarak sunulur; veri çözünürlüğünden küçük
engeller görünmez. Koşul verileri gerçek zamanlı değil, **son ölçülen değerlerdir**.

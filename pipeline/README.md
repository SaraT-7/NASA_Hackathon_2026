# pipeline/

İş kolu A'nın klasörü: NASA verisini `app_data/` biçimine çeviren Python betikleri.

İş sırası: `docs/tasks/A_DATA.md` · Dosya biçimleri: `docs/CONTRACT.md` · Biçim örneği: `tools/make_mock_data.py`

Ham veri `data/raw/` içine iner ve git'e girmez.

## Çalıştırma sırası

```bash
python pipeline/01_cut_dem.py          # 1 m yükseklik modeli kesimi
python pipeline/02_cut_ortho.py        # HiRISE renkli görüntü kesimi
python pipeline/05_stop_photos.py      # durak fotoğrafları
python pipeline/03_export_app_data.py  # eğim, risk, görseller, duraklar, Curiosity yolu
python pipeline/06_layers.py           # ek veri katmanları + birleşik risk (03'ten sonra şart)
python pipeline/04_conditions.py       # son ölçülen RAD / REMS
python tools/validate_app_data.py
node tools/make_mock_route.mjs
python pipeline/preview_layers.py <katman> <eski_rota.json>   # kontrol görseli, data/work/
```

Ek katmanlar (`06_layers.py`, ağırlıklar `config.py` → `LAYER_WEIGHTS`):

| Katman | Veri | Ağırlık |
| --- | --- | --- |
| `curiosity` | MSL sürüş izi (MMGIS), ±3 m şerit | −20 (kanıtlanmış zemin) |
| `comm` | Habitat anteninden görüş hattı, yükseklik modelinden (anten 3 m, giysi 2 m) | +20 (telsiz gölgesi) |
| `boxwork` | HiRISE görüntüsünde sırt çizgileri (Sato) + çok yönlülük ölçüsü; sırt bandı ~3 m | +15 (sırt aşma) |
| `sky` | Yükseklik modelinden kapalı gök oranı; doz ölçeği MSL RAD Murray Buttes ölçümü (gök %19 kapalı → doz %4 düşük) | 0 (yalnız harita, sığınak) |

## Deneme: kask kamerası için kum ve kaya (Colab)

`pipeline/colab_ai4mars_terrain.ipynb`: AI4Mars (NASA JPL) ile Curiosity Navcam fotoğraflarında piksel piksel
soil / bedrock / sand / big rock sınıflandırması (DeepLabv3 + MobileNetV3). Google Colab'da T4 GPU ile çalışır;
uzman test setinde ölçer ve üç durak fotoğrafına uygular. Sonuçlar uygulamaya girmez; sunum ve "sonraki adımlar" için.

# MarsWalk · Claude için çalışma kuralları

NASA Space Apps 2026, "Interplanetary Survival Guide: Martian Map". Üç kişilik ekip, teslim pazar 17:00.
Ürün: Mount Sharp boxwork bölgesi için statik bir web sitesi. İki ekranı var: `plan/` (bilgisayarda rota planlama)
ve `walk/` (telefonda yürüyüş rehberi). Veriyi `pipeline/` içindeki Python betikleri hazırlar ve `app_data/` içine yazar.

## İlk iş

1. Kullanıcıya hangi iş kolunda çalıştığını sor (A · Veri, B · Planlama ekranı, C · Yürüyüş ekranı), söylemediyse.
2. `docs/CONTRACT.md` dosyasını oku.
3. İş koluna ait görev dosyasını oku ve oradaki sırayı izle:
   `docs/tasks/A_DATA.md` · `docs/tasks/B_PLAN.md` · `docs/tasks/C_WALK.md`

## Kurallar

- **Yalnızca iş kolunun sahibi olduğu yollarda dosya oluştur ya da değiştir** (sözleşme, bölüm 1). Başka bir yolda değişiklik gerekiyorsa yapma; kullanıcıya gruba yazmasını söyle.
- `shared/`, `tools/`, `index.html`, `docs/`, `CLAUDE.md`, `.gitignore` donmuş dosyalardır.
- Görev dosyasındaki sırayı izle. "Çekirdekten sonra" başlığındaki işlere, "Bitti sayılır" listesi tamamlanmadan başlama. Listede olmayan özellik ekleme.
- Izgara boyutu, hücre boyutu, dosya adı gibi değerleri koda sabit yazma; `grid.json`'dan ve rota nesnesinden oku.
- Süre, hız ve dönüş hesabı yalnızca `shared/walk-model.js` ve `shared/route.js` üzerinden yapılır.
- Dışarıdan (CDN) kütüphane, yazı tipi ya da görsel yükleme. Derleme adımı, paket yöneticisi ya da çatı (React vb.) ekleme: düz HTML, CSS ve JavaScript modülleri.
- Arayüz metinleri İngilizce. "Safe" yerine "lowest estimated risk", "live" yerine "last measured". Canlandırılan her şey ekranda öyle etiketlenir.
- Gerçek veri yokken sayı uydurma; deneme verisi "mock" olarak işaretli kalır.

## Git

- Branch: `feature/data`, `feature/plan`, `feature/walk`. `main`'e doğrudan push ve `--force` yok.
- Her çalışan adımda küçük bir commit. PR'dan önce `git fetch origin && git merge origin/main`.
- PR'dan önce `git diff --name-only origin/main...HEAD` yalnızca iş kolunun yollarını göstermeli.

## Çalıştırma ve test

```bash
python -m http.server 8000          # repo kökünde; http://localhost:8000/
node tools/test_shared.mjs          # ortak modüller
python tools/validate_app_data.py   # app_data sözleşmeye uyuyor mu
```

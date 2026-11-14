# NASA Space Apps Challenge 2026 — Sohbet Kaydı

**Tarih:** 14 Kasım 2026 (Cumartesi), 11:04 – 15:12
**Görev:** Interplanetary Survival Guide: Martian Map
**Kapsam:** Görev özeti PDF'inin incelenmesi, GitHub reposunun klasöre bağlanması, önceki projelerin ve makalelerin araştırılması, proje fikrinin netleştirilmesi.

## İçindekiler

1. [PDF incelemesi ve ilk fikirler](#1-pdf-incelemesi-ve-ilk-fikirler)
2. [Repoyu masaüstü klasörüne bağlama](#2-repoyu-masaüstü-klasörüne-bağlama)
3. [Commit için de izin gerekir mi?](#3-commit-için-de-izin-gerekir-mi)
4. ["Uygulamayı kurmak" ne demek?](#4-uygulamayı-kurmak-ne-demek)
5. [İkinci yolun sade anlatımı](#5-ikinci-yolun-sade-anlatımı)
6. [PowerShell çıktısının kontrolü](#6-powershell-çıktısının-kontrolü)
7. [İstenenler, terimler, önceki projeler](#7-istenenler-terimler-önceki-projeler)
8. [Takıma anlatım ve internetsiz mobil uygulama](#8-takıma-anlatım-ve-internetsiz-mobil-uygulama)
9. [Yanlış eklenen dosya](#9-yanlış-eklenen-dosya)
10. [Makale: Mars, Venüs ve Dünya](#10-makale-mars-venüs-ve-dünya)
11. [Makale özeti: Mars'ta arazi çalışması](#11-makale-özeti-marsta-arazi-çalışması)
12. [Yedi makale bağlantısının değerlendirmesi](#12-yedi-makale-bağlantısının-değerlendirmesi)
13. [Haritadan farklı olmak için ne araştırmalı?](#13-haritadan-farklı-olmak-için-ne-araştırmalı)
14. [Başka nelere dikkat edilmeli?](#14-başka-nelere-dikkat-edilmeli)
15. [NASA'nın verdiği kaynaklar](#15-nasanın-verdiği-kaynaklar)
16. [Jüri için "çünkü"lü cümleler](#16-jüri-için-çünkülü-cümleler)
17. [Mars'ta GPS var mı?](#17-marsta-gps-var-mı)
18. [Rover nedir?](#18-rover-nedir)
19. [Curiosity nedir?](#19-curiosity-nedir)
20. [Astronotun konumu nasıl bulunur?](#20-astronotun-konumu-nasıl-bulunur)
21. [Marswalk yapıldı mı? Eski fotoğraflar nasıl kullanılır?](#21-marswalk-yapıldı-mı-eski-fotoğraflar-nasıl-kullanılır)
22. [Veriler Dünya'ya gönderilecek mi?](#22-veriler-dünyaya-gönderilecek-mi)
23. [Görüntü işleme, mobil uygulama ve web sitesi](#23-görüntü-işleme-mobil-uygulama-ve-web-sitesi)

---

## 1. PDF incelemesi ve ilk fikirler

> **Soru:** Biz 3 arkadaş NASA Hackathon'una katıldık ve görevimiz bu klasördeki pdf dosyasında yazıyor senden bu pdfi incelemeni istiyorum ve projeyi bana açıklamanı sonra da bu proje ile ne yapabiliriz yenilikçi fikirler üretmeni istiyorum.

**Cevap:**

PDF'i okudum. Bu belge, resmi görev metninin yanında ekibinizin seçtiği senaryoyu ve teknik planı da içeriyor.

### Proje ne?

**Görev:** "Interplanetary Survival Guide: Martian Map". Mars'ta birkaç kilometrelik tek bir bölge için, farklı NASA görevlerinin verilerini üst üste bindiren bir harita yapmanız isteniyor. Harita, bir astronotun yüzey yürüyüşünü planlamasına, yolunu bulmasına ve yol boyunca bilim yapmasına yardım etmeli.

**Dört zorunlu beklenti:**
- Bir bilimsel hedef ve ona uygun bir bölge seçmek
- En az üç farklı veri türünü birleştirmek
- Astronot güvenliğini öne almak (radyasyon, giysiyle hareket kısıtı, kayalar)
- Engellerden kaçınan bir rota sunmak

**Sizin senaryonuz ("Boxwork Seferi"):** İki astronot, Gale Krateri'ndeki Mount Sharp'ta boxwork sırtlarına yürüyüp örnek topluyor ve üsse dönüyor. Bu sırtlar eski yeraltı suyunun bıraktığı minerallerden oluşuyor. Curiosity yıllardır orada olduğu için veri bol.

**Sistem üç parçadan oluşuyor:**
1. **Planlama ekranı:** Alternatif rotalar (en kısa, en düşük riskli, en çok bilim noktalı) uzunluk, eğim ve süreyle birlikte gösterilir.
2. **Yürüyüş görünümü:** Sıradaki durak, kalan mesafe, dönüş payı ve Curiosity'nin o noktadan çektiği fotoğraf.
3. **Güvenlik katmanı:** Son ölçülen radyasyon ve hava değerleri, acil dönüş yolu.

**Teknik akış:** Yükseklik modelinden eğim haritası çıkarılır, kayalar ve zemin türü eklenir, hepsi tek bir risk ızgarasında birleşir. A* algoritması bu ızgarada en düşük maliyetli rotayı bulur.

### Yenilikçi fikirler

Plan sağlam, ama çoğu takım da "katmanlı harita ve A* rota" yapacak. Sizi ayırabilecek fikirler, etki/emek oranına göre sıralı:

1. **Radyo gölgesi haritası.** Habitat anteninden görüş hattı hesaplanır ve iletişimin kesildiği bölgeler işaretlenir. GDAL'da hazır komut olduğu için birkaç saatlik iştir.
2. **Güneş fırtınası sığınağı.** Yükseklik modelinden her noktada gökyüzünün ne kadarının kapalı olduğu hesaplanır. Fırtına uyarısında sistem en yakın yamaç dibini gösterir. Curiosity'nin RAD cihazı bir tepenin yanında dozun düştüğünü ölçmüştü; bu bulguyu sunumdan önce doğrulayın.
3. **GPS'siz yön bulma.** Mars'ta GPS yok. Her durakta ufuk silüeti üretilir: "şu tepe 40° yönünde görünmeli". Astronot konumunu arazi işaretleriyle doğrular.
4. **Curiosity'nin gerçek iziyle doğrulama.** Rover'ın gerçek güzergâhı algoritmanızın rotasıyla karşılaştırılır.
5. **Mesafe yerine oksijen bütçesi.** Güvenli dönüş alanı kilometre yerine tüketilen oksijen ve enerjiyle hesaplanır.
6. **Canlı yeniden planlama.** Demoda "beklenmeyen engel" veya "toz fırtınası" düğmesine basılır, rota anında değişir ve güvenli alan daralır.
7. **Saat katmanı.** Günün saatine göre gölge haritası çıkar; sistem yürüyüşe en uygun çıkış saatini önerir.

> **Not:** Bölüm 7'deki araştırma, bu fikirlerin çoğunun başka takımlarda zaten bulunduğunu gösterdi.

### Öneri

Üç kişisiniz ve bu ilk yarışmanız; PDF'teki plan ise dört iş koluna bölünmüş. Önce çekirdeği (eğim, risk, rota, arayüz) bitirin.

Kaya tespitinde model eğitmeye girmeyin. Etiketli veri var, ama iki seçenek de 48 saate zor sığar:
- BoulderNet çalışmasının arkasında Dünya, Ay ve Mars'tan 33.000'i aşkın kaya etiketi var, ancak modeli kurup çalıştırmak ilk kez yapan biri için saatler alır.
- Zenodo'daki Mars-Bench kaya seti eğitim için fazla küçük; içinde yalnızca onlarca örnek bulunuyor.

Gölge tabanlı yöntem yeterli olur.

Termal (THEMIS, yaklaşık 100 m/piksel) ve spektral (CRISM, yaklaşık 18 m/piksel) veriler birkaç kilometrelik alanda çok kaba kalır. Bunları rota hesabına katmayın, yalnızca arka plan katmanı olarak gösterin.

**Kaynaklar:**
- [BoulderNet literatür özeti](https://www.themoonlight.io/review/automatic-characterization-of-boulders-on-planetary-surfaces-from-high-resolution-satellite-images)
- [Mars-Bench: mb-boulder_det (Zenodo)](https://zenodo.org/records/15494828)

---

## 2. Repoyu masaüstü klasörüne bağlama

> **Soru:** [SaraT-7/NASA_Hackathon_2026](https://github.com/SaraT-7/NASA_Hackathon_2026) bu repoyu masaüstündeki NASA_Hackathon_2026 klasörüne bağlamak istiyorum. commit ve pushları senin yapman için gerekli izinleri veririm

**Cevap:**

Repoyu buluttaki çalışma alanıma klonladım ve okuyabiliyorum, ama iki şeyi buradan yapamıyorum: masaüstü klasörünüzü repoya bağlamak ve push etmek.

### Engeller

- **Klasörü bağlamak:** Bu oturumda bilgisayarınızda komut çalıştırma aracım yok, yalnızca dosya okuyup yazabiliyorum. Bu yüzden `git` komutlarını sizin çalıştırmanız gerekiyor.
- **Push:** GitHub push'u reddediyor, çünkü Claude GitHub uygulaması SaraT-7 hesabındaki bu repoya kurulu değil.

### Klasörü bağlamak (sizde, 1 dakika)

```powershell
cd "C:\Users\Elif Naz\OneDrive\Desktop\NASA_Hackathon_2026"
git init -b main
git remote add origin https://github.com/SaraT-7/NASA_Hackathon_2026.git
git pull origin main
git branch --set-upstream-to=origin/main main
```

Klasördeki PDF repoda zaten `docs/` altında duruyor. Bağlantıdan sonra kökteki kopyayı silebilirsiniz.

Klasör OneDrive içinde olduğu için eşitleme sırasında git dosyaları ara sıra bozulabiliyor. Sorun çıkarsa klasörü OneDrive dışına (örneğin `C:\Projeler\`) taşıyın.

### Benim commit ve push yapabilmem için

Repo sahibinin (SaraT-7 hesabı) şunlardan birini yapması gerekiyor:

- Claude GitHub uygulamasını [bu sayfadan](https://github.com/apps/claude/installations/select_target) kurup bu repoyu seçmek.
- Uygulama zaten kuruluysa GitHub bağlantısını [Claude ayarlarından](https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1) yenilemek.

README'deki kurala göre `main`'e doğrudan push yok; herkes kendi branch'inde çalışıp Pull Request açıyor.

İzin gelene kadar da çalışabiliriz: dosyaları doğrudan masaüstü klasörünüze yazarım, commit ve push'u siz yaparsınız.

---

## 3. Commit için de izin gerekir mi?

> **Soru:** sadece commit yapman için de mi izin lazım. Ben zaten contributer olarak ekliyim

**Cevap:**

Hayır, commit için izin gerekmiyor; izin yalnızca push için lazım.

- **Commit:** Buluttaki kopyamda hemen yapabilirim. Ama commit yereldir: push edilmediği sürece yalnızca benim çalışma alanımda kalır, ne GitHub'a ne sizin masaüstünüze ulaşır.
- **Push:** Sizin contributor olmanız sizin hesabınıza push hakkı verir, bana vermez. Ben GitHub'a Claude GitHub uygulaması üzerinden bağlanıyorum ve bu uygulamayı bir repoya yalnızca repo sahibi (SaraT-7) kurabilir.

İki yol var:

1. **Sara uygulamayı kurar.** Sonrasında commit ve push'u ben yaparım.
2. **Sara'yı beklemeden çalışırız.** Dosyaları doğrudan masaüstü klasörünüze yazarım, siz de kendi hesabınızla push edersiniz:

```powershell
git add .
git commit -m "mesaj"
git push
```

---

## 4. "Uygulamayı kurmak" ne demek?

> **Soru:** 2. yolu seçelim de SaraT'ın uygulamayı kurmasından kastın nedir

**Cevap:**

"Uygulamayı kurmak" bilgisayara program yüklemek değil; Sara'nın GitHub hesabından Claude'a bu repo için erişim izni vermesi demek. GitHub'da üçüncü taraf araçlar repolara "GitHub App" denen bir bağlantıyla erişiyor ve bu izni yalnızca repo sahibi verebiliyor.

Sara'nın yapacağı şey:

1. Kendi hesabıyla (SaraT-7) giriş yapmışken [kurulum sayfasını](https://github.com/apps/claude/installations/select_target) açar.
2. Hesabını seçer.
3. "Only select repositories" seçeneğiyle yalnızca `NASA_Hackathon_2026` reposunu işaretler.
4. "Install" düğmesine basar.

Bu bir iki dakika sürer ve yalnızca o repoya erişim verir. Şart değil; ikinci yolla onsuz da ilerlenebilir.

---

## 5. İkinci yolun sade anlatımı

> **Soru:** push kısmını kendimiz yapacağız. yani ikinci yolu ama ikinci yol için dediğin şeyi anlamadım. biz şu an daha araştırma kısmındayız hiçbir branch açmadık.

**Cevap:**

Araştırma aşamasındaysanız şu an branch'e de git komutuna da ihtiyacınız yok. Aşağıdakiler kod yazmaya başlayacağınız zaman lazım olacak.

### İkinci yol nasıl işliyor?

- Ben kod dosyalarını masaüstünüzdeki `NASA_Hackathon_2026` klasörüne yazarım.
- Siz o dosyaları GitHub'a gönderirsiniz (push).

Bunun çalışması için klasörün GitHub'daki repoyu tanıması gerekiyor. "Bağlamak" dediğim şey bir kerelik bir tanıştırma işlemi.

### Bağlama (bir kere)

1. Başlat menüsüne "PowerShell" yazıp açın.
2. `git --version` yazıp Enter'a basın. Sürüm numarası çıkarsa Git kurulu demektir.
3. Bölüm 2'deki beş satırı sırayla yapıştırın.

Satırlar sırayla şunları yapar: klasöre girer, klasörü git klasörüne çevirir, GitHub'daki repoyu adres olarak tanıtır, repodaki dosyaları indirir, klasörü repoya eşler.

### Branch konusu

Branch, herkesin birbirinin kodunu bozmadan çalıştığı kişisel kopyadır. Repodaki README'de üç kişilik bir görev paylaşımı ve her kişi için bir branch adı yazıyor, ama bunlar henüz açılmamış. Kimin hangi kısmı alacağına karar verdiğinizde tek komutla açılır.

---

## 6. PowerShell çıktısının kontrolü

> **Soru:** (ekran görüntüsü) bu doğru mu şu an

**Cevap:**

Evet, doğru; klasör repoya bağlı ve güncel. Klasörde `README.md`, `app.py`, `src`, `data`, `docs` ve diğer dosyalar yerinde.

Ekrandaki iki uyarı zararsız. İkisi de bu komutların daha önce bir kez çalıştırıldığını söylüyor:

- **`re-init: ignored`**: Klasör zaten git klasörüydü.
- **`remote origin already exists`**: Repo adresi zaten tanımlıydı.

Son iki satır her şeyin yolunda olduğunu gösteriyor:

- **`Already up to date`**: Klasörünüz GitHub'daki son hâlle aynı.
- **`set up to track 'origin/main'`**: Bundan sonra yalnızca `git pull` ve `git push` yazmanız yeterli.

Klasörün kökündeki `Mars_Haritasi_Gorev_Ozeti.pdf` artık fazlalık; aynı dosya `docs` klasöründe de var.

---

## 7. İstenenler, terimler, önceki projeler

> **Soru:** şimdi projemiz için araştırma kısmını yapıyoruz. bana bu projede bizden istenenleri detaylı şekilde açıklamanı istiyorum. kullandığın her bir terimsel kelimenin ne anlama geldiğini açıklamanı istiyorum. daha sonra bu proje için bu zamana kadar yapılmış projeleri araştırmanı ve bizim ek 40 saatte üzerine ekleyebileceğimiz ne katabiliriz bunu konuşalım, olur mu?

**Cevap:**

Araştırmanın en önemli sonucu şu: Gale/boxwork senaryosu size özel değil, en az üç takım daha aynı yeri seçmiş. Önceki mesajda yenilikçi diye önerdiğim fikirlerin çoğu da başka takımlarda zaten var. Öte yandan rakiplerin çoğu sahte arazi verisiyle çalışıyor; asıl fırsat orada.

Resmi görev sayfası açılamadı. İstenenler PDF'inizden ve başka takımların aktardığı görev metninden derlendi.

### Bizden istenenler

1. **Tek bir bölge veya rota seçmek.** Tüm Mars'ı değil, bir astronotun bir yürüyüşte dolaşacağı birkaç kilometrelik alanı haritalamak.
2. **Bir bilim hedefi belirlemek.** "Astronot oraya neden gidiyor?" sorusunun cevabı olmalı. Sizinki: boxwork sırtlarından örnek almak.
3. **En az üç veri türünü birleştirmek.** Farklı NASA görevlerinden gelen veriler aynı haritada üst üste açılıp kapanabilmeli.
4. **Güvenliği öne almak.** Radyasyon, dik yamaç, büyük kaya ve uzay giysisinin hareket kısıtı hesaba katılmalı.
5. **Engellerden kaçınan bir rota vermek.** Harita yalnızca göstermemeli, "şuradan yürü" demeli.
6. **Üç aşamaya hizmet etmek.** Rota ve duraklar, güncel koşullar, yol üstündeki bilim.

### Terimler

**Görev ve senaryo**

| Terim | Anlamı |
|---|---|
| Marswalk | Astronotun Mars yüzeyinde yaptığı yürüyüş |
| EVA | "Araç dışı etkinlik": uzay giysisiyle üs dışında yapılan görev. Marswalk bir EVA türüdür |
| Habitat | Astronotların yaşadığı basınçlı üs |
| Rover | Yüzeyde gezen robot araç (Curiosity, Perseverance) |
| Yörünge aracı | Gezegenin çevresinde dönüp yukarıdan ölçüm yapan uydu |
| Sol | Bir Mars günü, yaklaşık 24 saat 40 dakika |
| HUD / vizör | Kask camına yansıtılan bilgi ekranı |
| Walk-back (güvenli dönüş) | Her noktadan üsse yürüyerek dönebilme şartı |

**Yer ve bilim**

| Terim | Anlamı |
|---|---|
| Gale Krateri | Curiosity'nin 2012'den beri gezdiği, yaklaşık 154 km çaplı krater |
| Mount Sharp | Gale'in ortasındaki yaklaşık 5 km yüksekliğinde katmanlı dağ |
| Jezero Krateri | Perseverance'ın indiği, eski bir nehir deltası barındıran krater |
| Boxwork | Çatlaklara dolan minerallerin oluşturduğu ağ biçimli sırtlar; eski yeraltı suyunun izi |
| Mineral | Belirli kimyasal bileşimi olan doğal katı; kil ve sülfat gibi olanlar suya işaret eder |

**Veri türleri**

| Terim | Anlamı |
|---|---|
| Katman | Aynı bölgeyi gösteren, üst üste konabilen ayrı harita |
| Raster | Piksellerden oluşan harita; her piksel bir değer taşır |
| Çözünürlük | Bir pikselin yerde kapladığı alan. "25 cm/piksel" çok ayrıntılı, "100 m/piksel" kaba demektir |
| Topografik veri (DEM/DTM) | Yükseklik modeli: her pikselde o noktanın yüksekliği yazar |
| Optik | Görünür ışıkla çekilmiş fotoğraf |
| Termal | Yüzey sıcaklığı ölçümü |
| Termal atalet | Zeminin sıcaklık değişimine direnci. Kaya yavaş ısınıp soğur, toz hızlı |
| Spektral | Işığın çok sayıda dalga boyunda ölçülmesi; her mineralin kendine özgü bir "parmak izi" vardır |
| Atmosferik | Sıcaklık, basınç, rüzgâr, toz |
| Radyasyon | Uzaydan ve Güneş'ten gelen yüksek enerjili parçacıklar |

**Uzay araçları ve cihazlar**

| Terim | Anlamı |
|---|---|
| MRO | 2006'dan beri Mars yörüngesindeki NASA uydusu; HiRISE, CTX ve CRISM'i taşır |
| HiRISE | 25 cm/piksel çeken kamera; çift çekimlerden 1 m'lik yükseklik modeli üretilir |
| CTX | Yaklaşık 6 m/piksel çeken geniş alan kamerası |
| CRISM | Mineral haritası çıkaran spektrometre (yaklaşık 18 m/piksel) |
| MOLA | Lazerle tüm gezegenin kaba yükseklik haritasını çıkaran cihaz |
| THEMIS | Mars Odyssey uydusundaki termal kamera (yaklaşık 100 m/piksel) |
| Curiosity (MSL) | Gale Krateri'ndeki rover |
| RAD / REMS | Curiosity'nin radyasyon ölçeri / hava istasyonu |
| Mastcam / Navcam | Curiosity'nin direğindeki renkli bilim kamerası / yön bulma kamerası |
| Mars Trek | NASA'nın web tabanlı Mars harita görüntüleyicisi |

**İşleme ve algoritma**

| Terim | Anlamı |
|---|---|
| GDAL | Harita verisi işleyen açık kaynak yazılım kütüphanesi |
| Eğim | Zeminin yatayla yaptığı açı |
| Pürüzlülük | Yüksekliğin kısa mesafede ne kadar oynadığı |
| Nesne tespiti | Görüntüde belirli nesneleri (burada kayaları) bulan yapay zekâ yöntemi |
| Maliyet ızgarası (risk haritası) | Her hücrede "buradan geçmek ne kadar pahalı/riskli" sayısını tutan harita |
| A* | Başlangıçtan hedefe en düşük maliyetli yolu bulan algoritma |
| Dijkstra | Tek bir noktadan bütün hücrelere en düşük maliyeti hesaplayan algoritma |
| Yükseklik profili | Rota boyunca iniş çıkışı gösteren grafik |
| Streamlit | Python ile hızlı web arayüzü kurma aracı |
| Leaflet / Folium | Web'de etkileşimli harita kütüphanesi / onun Python sürümü |

### Daha önce yapılanlar

**Akademik öncül:** MIT'nin SEXTANT aracı.
- Yol seçimi mesafe, süre ya da harcanan enerji ölçütüne göre yapılıyor.
- Acil durum için her noktadan üsse dönüş yolu da araçta var.
- Utah'taki saha denemesinde gerçek yürüyüşler tahminden belirgin biçimde uzun sürdü.

**Bu yarışmadaki takımlar** (depolar hackathon sırasında değişiyor olabilir):

| Proje | Bölge | Öne çıkan | Zayıf yan |
|---|---|---|---|
| ARIADNE | Mount Sharp boxwork, iki astronot | RAD ölçümleriyle ayarlanan bir kalkan katmanı | Henüz kurulum aşamasında |
| Kyung Hee takımı | Gale, boxwork | İletişim görüş hattı, dönüşü olmayan nokta, güneş fırtınası uyarısı | Arazi ve kayalar simülasyon |
| Team VAA | Gale'de 2 × 2 km | Kask ekranı, git/gitme kontrolleri, acil dönüş | Yükseklik ve kayalar demo modelden; toz fırtınası yok |
| Protikriti | Jezero | Perseverance'ın gerçek sürüşüyle karşılaştırma | Eğim haritası 20–32 m; kayalar modelde yok |
| Sol Atlas | Jezero | Adım maliyeti metabolik enerji; rota oksijeni en aza indiriyor | — |
| MONSTER4REX | Belirtilmemiş | Belirsizliği hesaba katan rota, dönüş şartı, rota kararlılığı | 8 Kasım itibarıyla gerçek veride denenmemiş |
| RedStep | Jezero | GİT / DİKKAT / GİTME kararı ve gerekçesi | — |

**Çıkan sonuçlar:**
- Oksijen bütçesi, dönüş şartı, radyo gölgesi, fırtına uyarısı ve rover izi artık herkeste var; bunlar fark yaratmaz.
- Gale'i seçen üç takımın üçü de gerçek arazi verisini henüz yüklememiş.
- Gerçek veri mevcut: ARIADNE'nin veri listesinde Gale için 1 m'lik yükseklik modeli ve 25 cm'lik ortofoto yer alıyor.

### 40 saatte ne katabiliriz?

- **A. Gerçek veriyle çalışan dar ama doğru bir harita.** Az özellik, ama hepsi gerçek 1 m'lik veriden gelir ve Curiosity'nin gerçek iziyle sınanır.
- **B. "İnsan nereye gidebilir, rover nereye gidemedi?" haritası.** Aynı algoritma rover ve insan sınırlarıyla iki kez çalıştırılır; aradaki fark, yalnızca bir astronotun ulaşabileceği bilim noktalarını gösterir.
- **C. Dünya'da saha testi.** Kayseri'de 1 km'lik bir parkuru yürüyüp süre tahmin modelini telefon GPS'iyle sınamak.

Öneri: A'yı temel almak, hikâyeyi B üzerine kurmak; C vakit kalırsa.

**Kaynaklar:**
- [ARIADNE](https://github.com/vyom-aggarwal/ARIADNE)
- [Kyung Hee takımı: Martian Map · Marswalk HUD](https://github.com/Ercadion/Martian-Map)
- [Team VAA: Marswalk Planner](https://github.com/Isfandiyor-Vohidov/marswalk-planner)
- [Team Protikriti: Martian Map](https://github.com/AhsanulHoque22/Nasa-Space-Apps-Challenge-2026-Team-Protikriti)
- [Sol Atlas](https://github.com/saracen66/the-sol-explorers)
- [MONSTER4REX: Marswalk Planner](https://github.com/MONSTER4REX/Martian-Map)
- [RedStep](https://github.com/leo-noble/RedStep)
- [Mars Traverse (görev özeti)](https://github.com/lkorth/mars-traverse)
- [SEXTANT saha değerlendirmesi (MIT)](https://dspace.mit.edu/handle/1721.1/81410)
- [SEXTANT: An Integrated Traverse Planner (MIT)](https://dspace.mit.edu/entities/publication/242ddd93-f93d-4ca4-944f-281cdf25ace6)

---

## 8. Takıma anlatım ve internetsiz mobil uygulama

> **Soru:** şimdi şöyle biz bize hangisi uygun tam olarak bilmiyoruz bu yazdığın kavramların çoğu bize çok uzak ilk defa böyle bir konu üzerine proje geliştiriyoruz. internetsiz mobil uygulama gibi bir şey geliştirelim diye konuştuk ama önce tam olarak ne yapacağımızı anlamalı ve takımla konuşurken arkadaşlar bizden bunlar isteniyor ve daha önce bunlar yapılmış biz ek olarak bunları katabiliriz gibi düşünceler olması lazım. aynı zamanda bu hackatonda nasa'nın açık kaynak verilerini kullanmamızın daha iyi olacağını söylediler bunu da göz önüne al.

**Cevap:**

İnternetsiz mobil uygulama fikri iyi ve göreve uyuyor: Mars'ta internet yok ve astronotun elinde küçük bir ekran olacak.

### Takıma anlatırken

**Bizden ne isteniyor?**
- Mars'ta birkaç kilometrelik tek bir bölge için, yürüyen bir astronota yol gösteren bir harita. Dağ yürüyüşü için Google Haritalar'ın Mars sürümü gibi düşünün.
- Harita üç soruya cevap vermeli: Nereden yürüyeyim? Şu an tehlike var mı? Yolda neyi incelemeliyim?
- En az üç farklı türde NASA verisi kullanmak zorunlu.

**Daha önce ne yapılmış?**
- Onlarca takım aynı şeyi yapıyor: harita, güvenli rota ve oksijen hesabı neredeyse hepsinde var.
- Çoğu masaüstü web sitesi olarak tasarlanmış.
- Birkaç takımın arazisi gerçek NASA verisi değil, bilgisayarda üretilmiş sahte arazi.
- İnternetsiz çalışma bir iki takımda var (MarsNav, Team VAA).

**Biz ne katabiliriz?**
- **Telefonda, internetsiz çalışan bir yürüyüş rehberi.** Astronotun yürürken baktığı sade ekran.
- **Tamamen gerçek NASA verisi.** Uygulamadaki her şeyin kaynağı gösterilir.
- **"Rover buraya gidemedi, insan gidebilir" noktaları.**

### Hangi NASA verileri?

1. **Yükseklik haritası.** Arazinin nerede dik olduğunu gösterir.
2. **Uydu fotoğrafı.** Haritanın arka planı olur.
3. **Curiosity'nin ölçümleri.** Radyasyon, hava durumu ve rover'ın çektiği fotoğraflar.

### İnternetsiz mobil uygulama nasıl yapılır?

Gerçek bir Android veya iOS uygulaması yazmak ilk kez yapan bir ekip için 40 saate sığmaz. Bunun yerine telefona uygulama gibi kurulan bir web sayfası önerilir; internet olmadan açılır.

- **Bilgisayarda hazırlık (1 kişi):** NASA verisi indirilir, Python ile işlenir ve küçük harita resimlerine dönüştürülür.
- **Telefondaki uygulama (2 kişi):** Bu hazır resimleri gösterir, rotayı çizer, uyarıları verir.

Repodaki mevcut plan Streamlit üzerine kurulu ve Streamlit telefonda internetsiz çalışmaz. Arayüz kısmının değişmesi gerekir; bunu Sara ile konuşun.

---

## 9. Yanlış eklenen dosya

> **Soru:** bir tane google akademiden böyle bir makale buldum proje adımızı yazıp sence işe yarar mı yarıyorsa bana özetler misin

**Cevap:**

Eklenen dosya makale değil, ilk mesajda incelenen görev özeti PDF'inin aynısıydı. Makalenin PDF'i, bağlantısı ya da başlığı istendi.

---

## 10. Makale: Mars, Venüs ve Dünya

> **Soru:** yanlış atmışım pardon bunu kastetmiştim ("Mars, Venüs ve Dünya: Farklı kaderlerin gezegenleri")

**Cevap:**

Proje için işe yaramaz; yalnızca sunumun giriş cümlelerinde arka plan olarak kullanılabilir.

**Ne tür bir yazı?** Bilimsel bir araştırma makalesi değil, popüler bilim denemesi. Bilim ve Ütopya dergisinin Ağustos 2025 sayısında çıkmış, Tunahan Sönmeztürk imzalı görünüyor. Veri, yöntem ya da kaynakça yok.

**Özet:**
- **Mars:** Bir zamanlar nehirleri ve gölleri vardı. Küçük olduğu ve manyetik alanını yitirdiği için atmosferini ve suyunu kaybetti.
- **Venüs:** Güneş'e daha yakın olduğu için suyu buharlaştı ve kontrolden çıkan bir sera etkisiyle çok sıcak bir gezegene dönüştü.
- **Dünya:** Manyetik alanı ve dengeli atmosferi sayesinde suyunu korudu.

**Projeye bağlanabilecek iki nokta:**
1. **Mars'ta geçmişte su vardı.** Boxwork sırtları bu suyun yeraltındaki izi.
2. **Mars'ın atmosferi ince, manyetik alanı yok; bu yüzden yüzeyde radyasyon yüksek.**

Bu yazıyı sunumda kaynak göstermeyin; aynı bilgiler NASA'nın sayfalarında var.

**Google Akademik için arama terimleri:**
- `EVA traverse planning Mars`
- `astronaut path planning planetary surface`
- `Gale crater boxwork Curiosity`
- `Mars traversability map HiRISE`

---

## 11. Makale özeti: Mars'ta arazi çalışması

> **Soru:** çoğu ingilizce kaynak acaba senin erişimin olur mu link atsam sen tek tek incelesen (ekte bir makale özeti)

**Cevap:**

Bağlantılar gönderilebilir; İngilizce olanlar açılıp Türkçe özetlenir. Sınır: ücretli makalelerin yalnızca herkese açık kısmı görülebilir.

Gönderilen metin konuyla doğrudan ilgili ve işe yarar.

**Ne anlatıyor?**
- Yazar, Dünya'daki iki Mars benzeri araştırma istasyonunda (Utah'taki MDRS ve Kanada'daki FMARS) yapılan arazi çalışmalarının deneyimini Mars'a uyarlıyor.
- Mars'ın yükseklik haritalarını kullanarak farklı arazi türleri için varsayımsal astronot güzergâhları planlıyor.
- Her güzergâhı üç sayıyla ölçüyor: toplam mesafe, en dik eğim ve yol boyunca toplam iniş çıkış.

**Vardığı sonuç:**
- Kumullar, sel yarıkları ve vadi kesitleri gibi bazı yapılar tek bir yürüyüşte incelenebiliyor.
- Küçük faylar ve lav akıntıları birkaç yürüyüş gerektiriyor.
- Büyük heyelanlar ve yanardağ çöküntüleri bugünkü teknolojiyle yerinde incelenemeyecek kadar zor.
- Planlamada temel sınırlardan biri olarak 6 saatlik yürüyüş süresi alınmış.

**Size ne katar?**
- **Uygulamada gösterilecek sayılar:** mesafe, en dik eğim, toplam iniş çıkış.
- **Süre sınırı:** "Bir yürüyüş en fazla 6 saat" kuralı kaynak gösterilerek kullanılabilir.
- **Küçük alan gerekçesi:** Tek bir yürüyüşte incelenebilecek hedefler sınırlı.

**Eksikler:** Yalnızca özet görünüyor; makale ağırlıklı olarak araçla yapılan güzergâhları ele alıyor.

---

## 12. Yedi makale bağlantısının değerlendirmesi

> **Soru:** (yedi makale bağlantısı)
> - https://arc.aiaa.org/doi/pdf/10.2514/1.26248
> - https://arc.aiaa.org/doi/pdf/10.2514/6.2010-8829
> - https://arc.aiaa.org/doi/pdf/10.2514/6.2005-6993
> - https://www.sciencedirect.com/science/article/pii/S0094576510004248
> - https://journals.sagepub.com/doi/abs/10.1089/ast.2018.1838
> - https://www.sciencedirect.com/science/chapter/edited-volume/pii/B978012820245600001X
> - https://www.sciencedirect.com/science/article/pii/S0169555X26002291

**Cevap:**

Yedi bağlantının hiçbiri doğrudan açılmadı; yayıncı siteleri erişimi engelliyor. Beşinin hangi makale olduğu açık erişimli kopyalarından ve dizinlerden bulundu, ikisi belirlenemedi. Değerlendirmeler özetlere dayanıyor.

### En yararlıdan aza doğru

**1. SEXTANT (2. bağlantı): çok yararlı, önce bunu okuyun**
"An Integrated Traverse Planner and Analysis Tool for Planetary Exploration", Johnson ve ark., 2010.
- **Ne anlatıyor:** MIT'nin astronot güzergâhı planlama aracı. En verimli yol mesafe, süre ya da harcanan enerjiye göre seçiliyor. Her noktadan üsse dönüş yolu hesaplanıyor. Güneşli ve gölgeli bölgelerden astronotun ısı yükü çıkarılıyor.
- **Size katkısı:** Yapmak istediğiniz şeyin akademik karşılığı.
- **Dikkat:** Ay verisiyle geliştirilmiş.
- **Açık kopya:** [MIT DSpace](https://dspace.mit.edu/handle/1721.1/81322)

**2. NASA BASALT saha denemesi (5. bağlantı): yararlı**
"Future Needs for Science-Driven Geospatial and Temporal Extravehicular Activity Planning and Execution", Astrobiology, 2019.
- **Ne anlatıyor:** NASA, Dünya'daki Mars benzeri lav arazilerinde astronot yürüyüşlerini canlandırmış; planlama ve yürütme için Minerva adlı bir yazılım takımı kullanılmış.
- **Size katkısı:** "Biz ne katabiliriz" sorusunun cevabı NASA'nın eksik gördüğü şeyler listesinden gelebilir.
- **Eksik:** Tam metin açılamadı. [PMC sayfası](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442304) tarayıcıda açılıp sonuç bölümü yapıştırılabilir.

**3. Karar desteği deneyi (1. bağlantı): arayüzü yapan kişi için yararlı**
"Design and Evaluation of Path Planning Decision Support for Planetary Surface Exploration", Marquez ve Cummings, 2008.
- **Ne anlatıyor:** Bilgisayar daha çok iş üstlendiğinde kullanıcılar en iyi rotaya birkaç yüzde farkla yaklaştı ve ortalama 1,5 dakika kazandı; bedeli, durum farkındalığının azalması ve otomasyona aşırı güven oldu.
- **Size katkısı:** Uygulama yalnızca "buradan yürü" dememeli; nedenini ve alternatifini de göstermeli.
- **Açık kopya:** [MIT DSpace](https://dspace.mit.edu/handle/1721.1/90281)

**4. Aynı ekibin ön çalışması (3. bağlantı): sunumun açılışı için yararlı**
"Collaborative Human-Computer Decision Support for Planetary Surface Traversal", Marquez ve ark., 2005.
- **Ne anlatıyor:** Apollo örneği: Ay'da astronotların elinde yalnızca üzerine güzergâh çizilmiş bir kâğıt harita vardı ve rotadan saptıklarını fark etmediler. Programın gerisine düştüler, kalp atışları ve enerji harcamaları yükseldi.
- **Size katkısı:** "Bu uygulama neden gerekli?" sorusuna gerçek bir örnek.
- **Açık kopya:** [PDF](https://groups.csail.mit.edu/rrg/papers/MarquezAIAAPaper.pdf)

**5. Mars'ta arazi çalışması (4. bağlantı)**
Büyük olasılıkla Bölüm 11'deki makale.

### Belirlenemeyenler

- **6. bağlantı:** Bir Elsevier kitabının birinci bölümü.
- **7. bağlantı:** Geomorphology dergisinde 2026'da çıkmış bir makale.

---

## 13. Haritadan farklı olmak için ne araştırmalı?

> **Soru:** bu makalelere göre de sence biz ne araştırmalıyız sadece bir haritadan farklı olabilmesi için

**Cevap:**

Makalelerin ortak mesajı: astronotun sorunu harita eksikliği değil, yürürken doğru kararı verememek. Araştırmayı "haritada ne gösterelim" sorusundan "astronot yürürken hangi soruların cevabını bilmek ister" sorusuna çevirin.

### Makalelerden çıkan üç fikir

**1. Plan ile gerçek aynı olmuyor.**
- SEXTANT'ın saha denemesinde yürüyüşler tahmin edilenden belirgin biçimde uzun sürdü.
- Apollo astronotları planlanan yoldan saptıklarının farkında değildi.
- Uygulama yürüyüş sırasında "planın 12 dakika gerisindesin, bu hızla en geç şu saatte geri dönmelisin" diyebilir.

**2. Bilgisayar her şeyi kendisi yaparsa insan farkındalığını kaybediyor.**
- Uygulama rotayı neden önerdiğini ve alternatifini göstermeli; son kararı astronot vermeli.

**3. Her hedef tek yürüyüşe sığmıyor.**
- Uygulama "bu hedef tek yürüyüşe sığmıyor, ikiye bölelim" diyebilir.

### Öneri

Projeyi tek bir fikrin etrafında kurun: **planı gerçekle karşılaştıran yürüyüş rehberi.** Uygulama astronotun gerçek hızını izler, kalan süreyi ve geri dönüş anını buna göre sürekli günceller.

Rakip projelerde kalan süre ve dönüş uyarısı vardı, ama tahmini astronotun gerçek hızına göre düzelten biri görülmedi. Hepsi ayrıntılı incelenmediği için bunu kesin bir fark olarak sunmayın.

### Üç kişiye üç araştırma konusu

| Kişi | Araştırma sorusu | Arama terimleri |
|---|---|---|
| 1 | Uzay giysili biri ne kadar hızlı yürür, yokuş hızı nasıl etkiler? Bir yürüyüş en fazla kaç saat sürer? | `Tobler hiking function`, `EVA walking speed slope`, `Apollo EVA metabolic rate` |
| 2 | Astronot yürürken ekranda neye ihtiyaç duyar? Eldivenle kullanılacak bir ekran nasıl tasarlanır? | `EVA navigation display astronaut`, `BASALT Minerva EVA`, Apollo 14 Cone Crater |
| 3 | Gale Krateri için hangi NASA verileri var, nereden indirilir? | `MSL Gale DEM HiRISE USGS`, `Curiosity REMS data`, `Curiosity RAD data` |

---

## 14. Başka nelere dikkat edilmeli?

> **Soru:** bu fikirler güzel başka nelere dikkat edilmeli?

**Cevap:**

**Kapsam**
- **Önce en basit çalışan sürüm.** Harita, tek rota ve telefonda açılma çalışmadan başka özelliğe geçmeyin.
- **Son saatlerde yeni özellik eklemeyin.**

**Veri**
- **NASA dosyaları büyük ve alışılmadık biçimlerde.** Küçük bir alan seçin (örneğin 2 × 2 km) ve erkenden bir dosyayı gerçekten açmayı deneyin.
- **Kullandığınız her veriyi not edin.** Hangi görev, hangi cihaz, hangi bağlantı.

**Demo**
- **"Yürüyüşü canlandır" düğmesi.** Nokta rota üzerinde ilerlesin, hızı değiştirilebilsin.
- **İnternetsiz çalıştığını kanıtlayın.** Sunumda telefonu uçak moduna alın.
- **Telefonda erken deneyin.**

**Dürüstlük**
- "Güvenli rota" yerine "tahmini düşük riskli rota", "anlık veri" yerine "son ölçülen değer".
- Canlandırılmış olanı açıkça belirtin.

**Kurallar ve teslim**
- Kod etkinlik sırasında yazılmalı.
- Yapay zekâ kullanımının belirtilmesi gerekip gerekmediğini organizatörlere sorun.
- Bir başka takımın notlarına göre resmi teslim 15 Kasım, yerel saatle 23:59. Kayseri etkinliğinin saatini doğrulayın.

**Ekip**
- Sık sık `git pull` ve küçük commit.
- Arayüz kararını (Streamlit yerine ne) şimdi verin.

---

## 15. NASA'nın verdiği kaynaklar

> **Soru:** (NASA Data & Resources listesi) BUNLAR BİZE VERİLEN KAYNAK DATALAR. İNCELEYİP NASIL KULLANABİLECEĞİMİZİ SÖYLER MİSİN?

**Cevap:**

Beş kaynaktan üçü doğrudan işe yarıyor; ikisi senaryoya uymuyor. Sayfaların çoğu etkileşimli uygulama olduğu için yalnızca açıklama kısımları görülebildi.

| Kaynak | Ne | Uygun mu? |
|---|---|---|
| [Mars Trek](https://trek.nasa.gov/mars/) | Mars'ın katmanlı web haritası | Evet, ana kaynak |
| [USGS jeoloji haritaları](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Kaya türlerini gösteren haritalar | Evet, ek katman olarak |
| [Curiosity'nin Mount Sharp rotası](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | Açıklamalı rota haritası ve video | Evet, örnek ve içerik olarak |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | Dünya'nın uydu görüntüleri | Hayır, Mars verisi yok |
| [Perseverance ham görüntüleri](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | Jezero Krateri'nden fotoğraflar | Hayır, bölgeniz Gale |

**Mars Trek (ana kaynak)**
- **Bölgeyi seçmek için:** Gale Krateri'ni ve Mount Sharp'ı bulun, mesafe ve yükseklik ölçme araçlarıyla 2 × 2 km'lik alanı ve durakları belirleyin.
- **Harita görüntüsü almak için:** Seçtiğiniz alanın görüntülerini önceden indirip uygulamanın içine koyun.
- **Veri şartı için:** Uydu fotoğrafı ve yükseklik haritası buradan gelir.

**USGS jeoloji haritaları (ek katman)**
- Rota hesabına katmayın; durak kartlarında "burada hangi kaya var" bilgisi olarak kullanın.
- Tüm gezegeni kapsayan haritalar 2 km'lik alan için kaba kalabilir.

**Curiosity'nin Mount Sharp rotası (örnek ve içerik)**
- Görev metninin kendi verdiği örnek; jürinin "rota haritası" derken ne beklediğini gösterir.
- Bölge adları ve videodaki açıklamalar bilim duraklarının içeriği olabilir.
- Harita HiRISE, CRISM ve CTX verisiyle hazırlanmış; 2019'da yayımlanmış.

**NASA Worldview:** Dünya verisi; yalnızca arayüz örneği olarak bakılabilir.

**Perseverance ham görüntüleri:** Jezero'dan. Curiosity'nin de aynı türden bir galerisi var; "Curiosity raw images" diye aratın.

**Eksik kalan:** Radyasyon ve hava uyarıları için Curiosity'nin ölçüm verileri bu listede yok. Liste dışı NASA verisi kullanmanın serbest olup olmadığını organizatörlere sorun.

---

## 16. Jüri için "çünkü"lü cümleler

> **Soru:** jürilere bir astronotun uzaydaki (Mars'taki) durumunu düşünerek böyle böyle tasarım düşündük, bu yüzden bu fikirleri ekledik projemize ve olan projelerden farkı olarak bunları düşündük çünkülü cümleler kurabileceğimiz yenilikçi fikirler eklemek istiyoruz

**Cevap:**

Her fikri aynı kalıba oturtun: astronotun durumu, bu yüzden verilen tasarım kararı, mevcut projelerden farkı.

**1. Eldivenle kullanılan ekran**
- **Durum:** Astronot kalın, basınçlı eldiven giyiyor; küçük düğmeye basamaz, yazı yazamaz.
- **Cümle:** "Astronot eldivenli olduğu için ekranda en fazla üç büyük düğme var ve hiçbir yerde yazı yazmak gerekmiyor."

**2. Tek karar ekranı**
- **Durum:** Astronot yorgun, gözü arazide, dikkati bölünmüş.
- **Cümle:** "Yürürken katman katman harita okunamayacağı için yürüyüş ekranı tek soruya cevap veriyor: devam mı, dönüş mü? Yeşil, sarı, kırmızı."

**3. Gerçek hıza göre güncellenen dönüş anı**
- **Durum:** Saha denemelerinde yürüyüşler plandan uzun sürüyor.
- **Cümle:** "Plan ile gerçek tutmadığı için uygulama astronotun gerçek hızını izliyor ve en geç dönüş saatini sürekli yeniden hesaplıyor."

**4. Kararı yerinde veren uygulama**
- **Durum:** Mars ile Dünya arasında sinyal tek yönde dakikalar sürüyor.
- **Cümle:** "Dünya'dan cevap dakikalar sonra geldiği için uygulama kararı yerinde veriyor; bu yüzden tamamen internetsiz çalışıyor."

**5. Fotoğrafla konum doğrulama**
- **Durum:** Mars'ta GPS yok; astronot nerede olduğundan emin olamaz.
- **Cümle:** "GPS olmadığı için her durakta Curiosity'nin oradan çektiği gerçek fotoğrafı gösterip 'Bu manzarayı görüyor musun?' diye soruyoruz; astronot onaylayınca konum kesinleşiyor."

**6. Dönüşü daha yavaş hesaplama**
- **Durum:** Dönüşte astronot hem yorgun hem topladığı örnekleri taşıyor.
- **Cümle:** "Dönüş yolunda astronot yorgun ve yüklü olduğu için dönüş süresini gidişten daha yavaş bir hızla hesaplıyoruz."

### Farkı anlatırken

> "Mevcut projelerin çoğu haritadan yola çıkıp astronota uyarlıyor. Biz astronotun kısıtlarından yola çıktık: eldiven, yorgunluk, GPS'in ve Dünya ile anlık iletişimin olmaması. Her tasarım kararımızın arkasında bu kısıtlardan biri var."

"Hiçbir projede yok" demeyin; "incelediğimiz projelerde görmedik" deyin.

3 ve 4 projenin omurgası, 1 ve 2 yapması en kolay olanlar. 5 ve 6 vakit kalırsa.

---

## 17. Mars'ta GPS var mı?

> **Soru:** gps kullanmıyor muyuz? internet yoksa aklımıza gps gelmişti nasa gps ile almıyor mu verileri? nasıl alıyor?

**Cevap:**

Mars'ta GPS kullanılamaz, çünkü GPS Dünya'nın çevresinde dönen uydulara dayanır ve Mars'ın çevresinde böyle bir uydu ağı yok.

**GPS nasıl çalışır?**
- Dünya'nın yörüngesinde yaklaşık 30 GPS uydusu var. Telefon bu uyduların sinyalini dinleyip konumunu hesaplar.
- İnternet gerektirmez, ama uydular gerekir ve bu uydular yalnızca Dünya'yı kapsar.

**NASA rover'ın yerini nasıl biliyor?**
- **Tekerlek ve hareket sensörleri:** Rover tekerleklerinin kaç tur döndüğünü ve hangi yöne döndüğünü ölçer.
- **Kamera karşılaştırması:** Art arda çektiği fotoğraflarda kayaların ne kadar kaydığına bakarak hareketini düzeltir.
- **Yörünge fotoğraflarıyla eşleştirme:** Rover'ın çektiği manzara, uydudan çekilmiş haritayla karşılaştırılır.

**NASA veriyi Dünya'ya nasıl alıyor?**
- Radyo sinyaliyle. Rover veriyi Mars'ın yörüngesindeki bir uyduya gönderir, uydu da Dünya'daki dev antenlere aktarır (ABD, İspanya, Avustralya).
- Sinyalin tek yönde ulaşması dakikalar sürer.

**Proje için anlamı:**
- Astronotun konumu adım ve yön sensörleriyle tahmin edilir, ardından bir işaret noktasında doğrulanır.
- Jüri cümlesi: "Mars'ın çevresinde GPS uydusu olmadığı için konumu adım ve yön tahminiyle izliyor, her durakta Curiosity'nin gerçek fotoğrafıyla doğruluyoruz."

**Demoda GPS:** Kullanılabilir, ama "Mars'taki adım sensörünün yerine geçen bir araç" olarak açıkça belirtilmeli. Bina içinde kötü çalıştığı için "yürüyüşü canlandır" düğmesi yedek olsun.

---

## 18. Rover nedir?

> **Soru:** rover nedir

**Cevap:**

Rover, başka bir gezegenin yüzeyinde gezen tekerlekli robot araçtır. İçinde insan yoktur; Dünya'dan gönderilen komutlarla hareket eder, fotoğraf çeker, kaya ve toprak inceler.

Mars'ta şu an çalışan iki NASA rover'ı var:

- **Curiosity:** 2012'den beri Gale Krateri'nde. Sizin seçtiğiniz bölgeyi gezen rover bu.
- **Perseverance:** 2021'den beri Jezero Krateri'nde.

Projede rover iki yerde karşınıza çıkıyor:

- **Veri kaynağı olarak:** Curiosity'nin fotoğrafları ve radyasyon, hava durumu ölçümleri.
- **Karşılaştırma olarak:** Rover dik yamaçlara ve büyük kayaların arasına giremez; astronot girebilir.

---

## 19. Curiosity nedir?

> **Soru:** ("Curiosity'nin") bu ne

**Cevap:**

Curiosity, NASA'nın Mars'a gönderdiği bir rover'ın adıdır; İngilizcede "merak" anlamına gelir.

- **Ne zaman gitti:** Kasım 2011'de fırlatıldı, Ağustos 2012'de Mars'a indi ve hâlâ çalışıyor.
- **Nerede:** Gale Krateri'nde, Mount Sharp dağının eteklerinde.
- **Ne yapıyor:** Mars'ın geçmişte yaşama elverişli olup olmadığını araştırıyor.
- **Büyüklüğü:** Küçük bir otomobil kadar, yaklaşık 900 kg.

---

## 20. Astronotun konumu nasıl bulunur?

> **Soru:** o zaman biz dünya'dan rover aracılığı ile onun tekerlek konumu enerji bilgisi gibi bilgilerini kullanarak astronotun nerede olduğunu algılıyoruz. astronotun kullandığı küçük araca burada mısın mesaj yolluyoruz ve astronot onaylar ise orada onaylamaz veya reddederse orada değil doğru mu

**Cevap:**

Tam öyle değil; üç düzeltme:

**1. Rover astronotu izlemiyor.**
Rover ayrı bir robot ve sensörleri yalnızca kendi konumunu söyler. Örnek olarak anlatıldı: astronotun cihazı aynı yöntemi kullanır, ama tekerlek yerine astronotun adımlarını ve yönünü sayar.

**2. Mesaj Dünya'dan gelmiyor.**
"Bu manzarayı görüyor musun?" sorusunu astronotun elindeki uygulama kendisi sorar.

**3. "Hayır" cevabı "orada değilsin" demek değil.**
"Konumundan emin değiliz" demek.

### Doğru akış

1. **Yürürken:** Uygulama adım ve yön sensörleriyle konumu tahmin eder. Bu tahmin yürüdükçe biraz kayar.
2. **Durağa yaklaşınca:** Uygulama, önceden yüklenmiş fotoğrafı gösterir ve sorar: "Bu manzarayı görüyor musun?"
3. **"Evet":** Konum kesinleşir, birikmiş kayma sıfırlanır.
4. **"Hayır":** Uygulama konumu "belirsiz" olarak işaretler ve yardım eder: "Çevrene bak, şu tepeyi ara" ya da "son onaylanan noktaya dön".

**Curiosity'nin rolü:** Yalnızca geçmişte o noktalardan çektiği fotoğraflar.

Jüri cümlesi: "Uygulama astronotun konumunu adım ve yön sensörleriyle tahmin ediyor. Tahmin zamanla kaydığı için her durakta Curiosity'nin oradan çektiği fotoğrafla astronota doğrulatıyoruz. Bütün bunlar astronotun cihazında, Dünya'ya bağlanmadan oluyor."

---

## 21. Marswalk yapıldı mı? Eski fotoğraflar nasıl kullanılır?

> **Soru:** peki marswalk daha önce yapılmış bir şey mi? sen anlık veri olmuyor dedin ama bu robot daha önce bu fotoğraflamaları yaptıysa nasıl oluyor?

**Cevap:**

**Marswalk daha önce yapıldı mı?**
Hayır. Mars'a bugüne kadar hiçbir insan gitmedi; yalnızca robotlar gitti. İnsanlar Dünya dışında yalnızca Ay'da yürüdü: 1969–1972 arasındaki Apollo görevlerinde 12 astronot.

**Anlık veri yoksa fotoğraflar nereden geliyor?**
"Anlık veri yok" verinin canlı olmadığı anlamına gelir, hiç veri olmadığı değil.

- Curiosity yıllardır o bölgede geziyor ve geçtiği yerlerin fotoğrafını çekiyor.
- Bu fotoğraflar Dünya'ya gönderiliyor ve NASA'nın herkese açık arşivinde saklanıyor.
- Siz bu fotoğrafları şimdi indirip uygulamanın içine koyuyorsunuz.

Google Sokak Görünümü'ne benzer: fotoğraf geçmişte bir kez çekilmiştir, sonradan bakılır.

**Eski fotoğraf neden işe yarıyor?**
Mars'ta tepeler ve kayalar çok yavaş değişir.

| Veri | Değişim hızı | Uygulamada nasıl gösterilir |
|---|---|---|
| Arazi, yükseklik, kayalar | Çok yavaş | Harita olarak, doğrudan |
| Curiosity'nin manzara fotoğrafları | Çok yavaş | "Varınca bunu göreceksin" |
| Hava durumu, toz, radyasyon | Hızlı | "Son ölçülen değer" ve tarihi |

---

## 22. Veriler Dünya'ya gönderilecek mi?

> **Soru:** dünya ile iletişimde zaman sorunu var ya biz verileri dünya'ya göndermeyecek miyiz

**Cevap:**

Gönderilecek, ama uygulamanın çalışması buna bağlı olmayacak. Kararlar yerinde verilir, kayıtlar sonradan gönderilir.

- **Karar beklemez.** "Döneyim mi?" sorusunun cevabı hemen gerekir.
- **Kayıt bekleyebilir.** Yürünen yol, alınan örnekler Dünya'ya 20 dakika geç ulaşsa da bir şey kaybedilmez.

**Uygulamada nasıl olur?**
1. Yürüyüş boyunca uygulama her şeyi telefona kaydeder.
2. Astronot üsse döndüğünde ya da bağlantı kurulduğunda kayıt topluca gönderilir: önce üsse, oradan Dünya'ya.
3. Bağlantı hiç kurulmasa da uygulama eksiksiz çalışır.

**Üs ile Dünya farklı.** Astronot ile üs arasındaki telsiz neredeyse anlık çalışır. Gecikme yalnızca Mars ile Dünya arasında. Arada bir tepe varsa üs ile bağlantı da kesilebilir.

**Eklenecek özellik:** Bir "yürüyüş kaydı" ve yürüyüş bitince bunu dosya olarak dışa aktaran bir düğme.

Jüri cümlesi: "Dünya ile iletişim gecikmeli olduğu için kararları astronotun cihazı veriyor; yürüyüşün kaydı ise cihazda saklanıp bağlantı kurulduğunda üsse ve Dünya'ya gönderiliyor."

---

## 23. Görüntü işleme, mobil uygulama ve web sitesi

> **Soru:** görüntü işlemeli, internet olmadığı için mobil uygulamaya dökülen ama web sitesi de içeren ne yapabiliriz

**Cevap:**

Üçü tek projede birleştirilebilir; her biri astronotun farklı bir anına hizmet eder.

| Parça | Nerede çalışır | Ne yapar |
|---|---|---|
| Görüntü işleme | Dizüstü bilgisayarda, yürüyüşten önce | NASA fotoğraflarından tehlike ve bilim haritası çıkarır |
| Web sitesi | Üste, büyük ekranda | Yürüyüşü planlar, sonra kaydı gösterir |
| Mobil uygulama | Astronotun elinde, internetsiz | Yürüyüş sırasında yol gösterir |

Akış: NASA verisi görüntü işlemeden geçer, hazır haritalar web sitesine ve telefona yüklenir, astronot sitede planlar ve telefonla yürür, dönünce yürüyüş kaydı siteye aktarılır.

### Görüntü işleme ne yapsın?

- **Kaya haritası.** Büyük kayalar uydu fotoğrafında gölge bırakır. Koyu gölgeleri bulan basit bir yöntemle kayalık bölgeler işaretlenir.
- **Boxwork sırt haritası.** Sırtlar ağ biçiminde ince çizgiler olarak görünür. Çizgi ve sırt bulan hazır filtrelerle otomatik işaretlenir; bunlar bilim durakları olur.

İkisi de Python'da hazır kütüphanelerle (OpenCV, scikit-image) denenebilir; yapay zekâ modeli eğitmek gerekmez. Erkenden bir örnek üzerinde deneyin.

**İddialı ek (vakit kalırsa):** Telefon kamerası manzarayı çeker, uygulama bunu Curiosity'nin fotoğrafıyla karşılaştırıp durağı kendisi tanır. Zor ve sonuç güvenilmez olabilir.

### Web sitesi ve mobil uygulama

Tek bir web uygulaması, iki görünüm:

- **Planlama görünümü:** Bilgisayarda açılır. Harita, katmanlar, rota seçimi, yürüyüş kayıtları.
- **Yürüyüş görünümü:** Telefona kurulur ve internetsiz çalışır. Büyük düğmeler, tek karar ekranı.

### Görev paylaşımı

- **1. kişi:** Görüntü işleme (Python).
- **2. kişi:** Planlama görünümü ve harita.
- **3. kişi:** Yürüyüş görünümü ve internetsiz çalışma.

### Jüri cümleleri

- "Uydu fotoğrafındaki kayaları ve boxwork sırtlarını görüntü işlemeyle otomatik çıkardık, çünkü birkaç kilometrelik alanı elle işaretlemek hem yavaş hem hataya açık."
- "Planlama üste büyük ekranda yapıldığı için web sitesi, yürüyüş eldivenle ve bağlantısız yapıldığı için mobil uygulama tasarladık."

---

## Açık kalan sorular

- Ekipte HTML ve JavaScript bilen var mı? (Web ve mobil kısmının ne kadar sade tutulacağı buna bağlı.)
- Streamlit yerine hangi arayüz kullanılacak? (Sara ile konuşulacak.)
- Liste dışı NASA verisi (Curiosity RAD/REMS) kullanmak serbest mi? (Organizatörlere sorulacak.)
- Yapay zekâ kullanımının belirtilmesi gerekiyor mu? (Organizatörlere sorulacak.)
- Kayseri etkinliğinin teslim saati nedir?

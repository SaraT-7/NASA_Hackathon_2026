# MarsWalk — Mars Keşif Yürüyüşü İçin Akıllı Harita

**NASA Space Apps Challenge 2026 | Interplanetary Survival Guide: Martian Map**  
**Çalışma bölgesi:** Mars, Gale Krateri, Mount Sharp — Boxwork oluşumları  
**Belge türü:** Ekip araştırma özeti, teknik gereksinimler, prototip incelemesi ve geliştirme yol haritası  
**Derleme tarihi:** 14 Kasım 2026

> **Durum notu:** Bu belge sohbet boyunca yaptığımız araştırma ve fikir geliştirme çalışmalarının derlemesidir. Kaynak PDF'deki proje planı, yüklenen Argon HTML prototipinin incelenmesi ve ekibin tartıştığı tasarım fikirleri bir araya getirilmiştir. **Prototipte gösterilen sayılar, korunaklı alanlar, koordinatlar ve rotalar gerçek NASA ölçümü ya da doğrulanmış insanlı Mars operasyonu değildir.** Aşağıda açıkça belirtilmedikçe özellikler önerilen geliştirme hedefleridir.

## İçindekiler

1. [Challenge'ın amacı ve beklenen çıktı](#1-challengeın-amacı-ve-beklenen-çıktı)
2. [Boxwork Seferi senaryosu](#2-boxwork-seferi-senaryosu)
3. [Gerekli NASA veri türleri ve indirme bağlantıları](#3-gerekli-nasa-veri-türleri-ve-indirme-bağlantıları)
4. [Teknik mimari ve algoritmalar](#4-teknik-mimari-ve-algoritmalar)
5. [Argon HTML prototipinde neler var?](#5-argon-html-prototipinde-neler-var)
6. [Arayüzü sadeleştirme önerisi](#6-arayüzü-sadeleştirme-önerisi)
7. [İnternetsiz çalışma mimarisi ve kısıtları](#7-internetsiz-çalışma-mimarisi-ve-kısıtları)
8. [Astronotun karşılaşabileceği aksaklıklar](#8-astronotun-karşılaşabileceği-aksaklıklar)
9. [Üç öncelikli tehlike: toz fırtınası, gevşek kum, radyasyon](#9-üç-öncelikli-tehlike-toz-fırtınası-gevşek-kum-radyasyon)
10. [Ekstrem ve zincirleme kriz senaryoları](#10-ekstrem-ve-zincirleme-kriz-senaryoları)
11. [Önceden yüklenen korunaklı alanlar](#11-önceden-yüklenen-korunaklı-alanlar)
12. [48 saatlik plan, MVP ve görev paylaşımı](#12-48-saatlik-plan-mvp-ve-görev-paylaşımı)
13. [Teslimler, demo ve kontrol listesi](#13-teslimler-demo-ve-kontrol-listesi)
14. [Doğrulanması gereken bilgiler ve kaynaklar](#14-doğrulanması-gereken-bilgiler-ve-kaynaklar)

---

## 1. Challenge'ın amacı ve beklenen çıktı

NASA'nın farklı robotik keşif görevlerinden elde edilmiş Mars verilerini **tek bir sınırlı bölgede katmanlı harita** olarak birleştirip, astronotun Mars yüzey yürüyüşünü (EVA / Marswalk) planlamasına, yolunu bulmasına ve bilimsel çalışma yapmasına yardımcı olan sistem tasarlamak.

Görev özetindeki temel beklentiler:

- Bilimsel hedef ve ona uygun Mars bölgesi belirlemek.
- **En az üç farklı veri türünü** birleştirmek: örneğin optik görüntü, topografya, spektral mineral, termal, atmosfer veya radyasyon.
- Astronot güvenliğini dikkate almak: eğim, büyük kayalar, belirsiz arazi, uzay giysisi hareket kısıtları, radyasyon vb.
- Engellerden kaçınabilen rota haritası ve yürüyüş esnasında anlaşılır navigasyon sunmak.
- Ölçümün çözünürlüğünü, yaşını, güvenilirlik sınırlarını açıkça göstermek.

### Son ürün ne olmalı?

1. **Katmanlı Mars haritası:** NASA'nın gerçek görüntü ve bilimsel verilerinden hazırlanmış küçük bir bölge haritası.
2. **Görev planlayıcı:** Başlangıç/varış ve bilim noktalarını seçme.
3. **Rota karşılaştırması:** En kısa, daha düşük riskli ve daha fazla bilim noktasına uğrayan seçenekler.
4. **Güvenlik/dönüş desteği:** Arazi riski, belirsiz alanlar ve kayıtlı üs/korunaklı noktalara dönüş hesabı.
5. **Sade yürüyüş ekranı:** Sıradaki durak, kalan mesafe, görev süresi, dönüş bütçesi, risk uyarısı.
6. **Offline kullanım:** Gerekli haritalar, metaveri ve hesaplama kodu cihazda bulunmalı.
7. **Jüri demosu:** Seçim → rota → risk → yeniden planlama → dönüş akışı.

**Terminoloji:** «Kesin güvenli rota» demek yerine **«mevcut verilere göre tahmini daha düşük riskli rota»** denmeli.

## 2. Boxwork Seferi senaryosu

- **Bölge:** Gale Krateri'ndeki Mount Sharp'ın boxwork oluşumları.
- **Bilimsel soru:** Geçmiş yeraltı suyu faaliyetini gösteren mineral damarları ve sırt oluşumları nasıl incelenebilir?
- **Neden ilginç?** Boxwork; kaya çatlaklarına minerallerin yerleşmesi ve farklı aşınma sonucunda açığa çıkan ağ benzeri sırtlarla ilişkilidir. Curiosity bölgeyi 2025'te incelemiştir.
- **Görev:** İki astronot habitat üssünden çıkar, seçilen boxwork bilim noktalarını ziyaret eder, örnek alır ve geri döner.
- **Üç kullanım aşaması:** (a) habitatta planlama; (b) yürüyüş sırasında navigasyon; (c) risk/kriz durumunda geri dönüş ve belirsizlik değerlendirmesi.

**Kritik doğrulama:** Gerçek boxwork çalışma sınırı, hedef noktalarının coğrafi koordinatları ve seçilen verilerin birbirini kapsaması henüz ayrıca doğrulanmalı. HTML prototipindeki işaretçilerin konumları gerçek bilim konumu kanıtı değildir.

## 3. Gerekli NASA veri türleri ve indirme bağlantıları

| Veri / cihaz | Kullanım | Nereden araştırıp indirebiliriz? | Öncelik |
|---|---|---|---|
| **HiRISE / CTX optik görüntüler** | Gerçek yüzey haritası, görünür engeller, kaya analizi | [HiRISE](https://www.uahirise.org/), [PDS Orbital Data Explorer](https://ode.rsl.wustl.edu/), [Mars Trek](https://trek.nasa.gov/mars/) | Çok yüksek |
| **HiRISE/CTX DEM-DTM; MOLA alternatif** | Yükseklik, eğim, pürüzlülük, A* maliyetleri | [HiRISE DTM](https://www.uahirise.org/dtm/), [DTM harita araması](https://www.uahirise.org/hiwish/maps/dtms.jsp), [PDS ODE](https://ode.rsl.wustl.edu/) | Çok yüksek |
| **CRISM spektral mineral verisi** | Mineraller, bilimsel hedeflerin desteklenmesi | [PDS Orbital Data Explorer](https://ode.rsl.wustl.edu/), [NASA PDS](https://pds.nasa.gov/) | Yüksek |
| **Curiosity Mastcam / Navcam** | Hedeflere ait gerçek yer fotoğrafları ve saha bağlamı | [Curiosity raw images](https://mars.nasa.gov/msl/multimedia/raw-images/?mission=msl), [Boxwork panoraması](https://science.nasa.gov/photojournal/curiosity-surveys-the-boxwork-region/) | Yüksek |
| **THEMIS termal görüntü / atalet** | Kumlu/kayalık zemin türü hakkında bölgesel ipuçları | [THEMIS Data Viewer](https://themis-data.asu.edu/viewer/themis), [ASU Mars verileri](https://www.mars.asu.edu/data/) | Orta |
| **Curiosity REMS** | Geçmiş atmosfer ve sıcaklık/basınç ölçümleri | [REMS arşivi](https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/rems.html) | Ek |
| **Curiosity RAD** | Geçmiş radyasyon ölçümleri | [MSL PDS arşivi](https://pds-geosciences.wustl.edu/missions/msl/index.htm), [Analyst's Notebook](https://an.rsl.wustl.edu/) | Ek |

### Doğrudan incelenebilecek örnek görseller

- [Curiosity Surveys the Boxwork Region](https://science.nasa.gov/photojournal/curiosity-surveys-the-boxwork-region/): Gerçek Boxwork panoraması.
- [Curiosity's First 360-Degree View of Boxwork Patterns](https://www.jpl.nasa.gov/images/pia26559-curiositys-first-360-degree-view-of-boxwork-patterns/): Başka bir panorama.
- [Mars Trek harita görüntüleyici](https://trek.nasa.gov/mars/).
- [Mars Trek harita servisleri/API](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars).

### Veri indirme sırası

1. Boxwork çalışma alanını (yaklaşık birkaç kilometrelik yürüme sahası) haritada kesinleştir.
2. Alanı kapsayan gerçek **CTX/HiRISE ortogörüntüsü** bul ve ürün kimliğini kaydet.
3. Aynı alanı kapsayan sayısal **DEM/DTM** bul; varsa görüntüyle eşleştir.
4. Aynı alan için **CRISM** veya alternatif bilim katmanı araştır; uzamsal örtüşmeyi test et.
5. Curiosity fotoğraflarını konum ve çekim tarihiyle ekle.
6. Zaman kalırsa THEMIS, REMS, RAD ürünlerini bağla.

### İndirilen dosyalarda dikkat edilecekler

- `.JPG/.PNG`: görsel, tek başına jeoreferanslı sayısal arazi analizi sağlamaz.
- `.TIF/.GeoTIFF`, `.IMG`, `.JP2`: raster/jeo-veri veya sayısal ürünler; ürün türüne göre işlenir.
- `.LBL/.XML`: koordinat sistemi, ölçüm birimleri, çözünürlük, tarih, kalite/metaveri.
- `.CSV/.TAB`: sayısal ölçüm tabloları.
- Çözünürlük, kapsama, projeksiyon, veri tarihi ve no-data alanları belgelenmeli.
- **MOLA küçük taşları veya metre düzeyindeki engelleri algılamaya uygun değildir.** THEMIS de tekil küçük kum tuzaklarını doğrulayamaz.
- Ürün ve alan özelinde «HiRISE 1 m», «CRISM 18 m», «CTX 6 m» gibi rakamlar **kontrol edilmeden sabit doğruluk iddiası olarak kullanılmamalı**.

## 4. Teknik mimari ve algoritmalar

### Veri işleme

- GDAL/rasterio ile DEM'den **eğim** ve **pürüzlülük** elde et.
- Optik görüntüler üzerinde büyük kaya/engel analizi yap; gerekirse gölge tabanlı basit yaklaşım kullan.
- Termal/spektral verileri aynı mekânsal referansa getir.
- Hücre bazlı maliyet ızgarası oluştur: `eğim + kaya/engel + zemin + veri belirsizliği`.
- Eksik veya düşük çözünürlüklü veriye sahip hücreleri **güvenli kabul etme**.

### A* (ileri rota planlama)

Örnek tasarım formülü:

```text
geçiş_maliyeti = mesafe × (1 + w1*eğim_riski + w2*kaya_riski + w3*belirsizlik_riski)
```

- En kısa yol, en düşük maliyetli yol ve bilim noktalarını ziyaret eden rota karşılaştırılabilir.
- Gerçek algoritmada maliyetler harita hücrelerine uygulanmalı, A* komşu düğümleri gezerek **rota geometrisini yeniden hesaplamalı**.
- Rota çıktısı: uzunluk, max/ortalama eğim, tahmini süre, geçilen riskli/belirsiz alanlar, bilim noktaları.

### Dijkstra (dönüş ve erişilebilirlik)

- Habitat veya onaylanmış korunaklı alanlardan başlatılan Dijkstra ile mevcut maliyet ızgarasında dönüş seçenekleri hesaplanabilir.
- Sadece kuş uçuşu yarıçap değil, eğim/engel ve kaynak bütçesi etkileri kullanılmalı.
- Dönüş bütçesi için tüketim varsayımları açıklanmalı; simülasyondaki oksijen yüzdeleri gerçek giysi telemetrisi değildir.

### Önerilen teknoloji

- **Veri ön işleme:** Python + GDAL/rasterio, isteğe bağlı NumPy.
- **Web harita:** Leaflet + yerel raster/tile paketleri; başlangıçta HTML/JS de yeterli.
- **Alternatif hızlı demo:** Streamlit + Folium/leafmap; offline dağıtımı ayrıca ele alınmalı.
- **Algoritmalar:** Yerel Python veya istemci tarafında JavaScript; harici internete bağımlı servis olmamalı.

## 5. Argon HTML prototipinde neler var?

**İncelenen dosya:** `mars_ke_if_y_r_y_ak_ll_harita_prototipi.html`

### Görünen bölümler

1. **Planlama (Habitat):** Altı katman seçeneği (topografya, kaya, CRISM, THEMIS, Dijkstra dönüş alanı, belirsizlik), bilim hedefleri, harita, yükseklik profili, A* ağırlık kaydırıcıları, alternatif rota kartları.
2. **Yürüyüş (Kask HUD):** Sıradaki durak, kalan mesafe, görev süresi, dönüş bütçesi, ilerleme kaydırıcısı, risk alarm simülasyonu, yüzey/görev kartı.
3. **Güvenlik ve Veri Güven:** Kaynak/çözünürlük/kör nokta tablosu, örnek çevresel telemetri, teslim listesi.

### Teknik gerçeklik kontrolü

| Özellik | Mevcut HTML'nin durumu |
|---|---|
| Ekran geçişleri, kaydırıcılar, katman aç/kapat | Prototipte etkileşim var |
| Harita görüntüsü ve kaya/risk desenleri | Canvas üzerinde temsili çizim |
| Bilim hedefi konumları | Kod içine yazılmış oransal `x/y` konumları |
| Rota kartları ve sayıları | Simülasyon, sabit/türetilmiş örnek değerler |
| Gerçek A* yol araması | Uygulanmış değil; rota yolları önceden çiziliyor |
| Gerçek Dijkstra dönüş hesabı | Uygulanmış değil; dönüş göstergesi temsili |
| Yükseklik profili | Örnek/sabit değerlerden çiziliyor |
| Curiosity Mastcam resmi | SVG temsili çizimi; gerçek fotoğraf değil |
| REMS/RAD ölçüm panosu | HTML içine yazılmış değerler; doğrulanmış canlı/son ölçüm entegrasyonu yok |
| «10/10 tamamlandı» göstergesi | Arayüz metni; gerçek teslim tamamlanmışlığı değil |

**Önemli:** Bu aşamada HTML'nin **arayüz prototipi olması normal**. Prototipten gerçek veri entegrasyonu beklemiyoruz; ancak simülasyonu gerçekmiş gibi etiketlememeliyiz. Sonraki aşamada hesaplama ve veri modülleri geliştirilecek.

## 6. Arayüzü sadeleştirme önerisi

Mevcut üç ana ekran yerine:

1. **Görev Planlama:** Ortada büyük Mars haritası; solda katmanlar ve bilim noktaları; sağda 2–3 alternatif rota, mesafe/süre/risk karşılaştırması; altta/ayrıntıda yükseklik grafiği.
2. **Yürüyüş:** Büyük yönlendirme, sıradaki durak, kalan mesafe, dönüş bütçesi, acil dönüş/uyarı, küçük bilim noktası fotoğrafı.

«Veri Kaynakları», «Çevresel Koşullar» ve A* ağırlıkları açılır ayrıntı/«Gelişmiş Ayarlar» paneline taşınabilir. «10/10 tamamlandı» kaldırılmalı. Tekrarlanan simülasyon uyarıları yerine görünür bir **Demo / Simülasyon** etiketi kullanılabilir.

**Korunacak etkileşimler:** Katman açma/kapatma, hedef seçimi, rota karşılaştırma, yükseklik grafiği, ilerleme simülasyonu, risk alarmı, acil dönüş temsili. Bu aşamada tek HTML dosyası hedeflenebilir; gerçek offline ürün için CDN bağımlılıkları yerelleştirilmeli.

## 7. İnternetsiz çalışma mimarisi ve kısıtları

### Temel ilke

İnternet olmaması, cihazda hesaplama yapılamaması anlamına gelmez. Haritalar ve algoritmalar **önceden cihaza yüklenirse**, A*, Dijkstra ve risk gösterimi offline çalışabilir.

```text
Görev öncesi hazırlık
NASA veri ürünleri + DEM + risk ızgarası + bilim noktaları +
onaylı habitat/sığınaklar + acil prosedürler
                  ↓
        Yerel tablet / PWA
                  ↓
  Yerel harita + A* + Dijkstra + görev kaydı
                  ↓
    Offline uyarı ve yeniden rota hesaplama
```

### Offline yapılabilecekler

- Önceden indirilen harita ve gerçek fotoğrafları açmak.
- Yerel DEM/risk verisi üzerinden rota hesaplamak.
- Bilim noktalarını ve kayıtlı korunaklı alanları göstermek.
- Yeni bir engeli manuel olarak işaretleyip yeniden rota hesaplamak.
- Önceden yüklenmiş prosedürleri göstermek ve görev kayıtlarını yerelde saklamak.

### Offline tek başına yapılamayacaklar

- İnternetten yeni NASA ürünü veya güncel Dünya kaynaklı ölçüm çekmek.
- **Sensör olmadan** astronotun gerçek oksijen, batarya, radyasyon veya sağlık durumunu bilmek.
- **Konumlandırma olmadan** astronotun kesin yerini bilmek. Mars'ta Dünya GPS altyapısının eşdeğeri hazır bir hizmet yoktur.
- Sonradan keşfedilen bir engeli astronot/sensör bildirmeden otomatik öğrenmek.
- Harita kayıp/bozulmuşsa doğrulanmamış yol bilgisi üretmek.

### Offline hata senaryoları

| Olay | Güvenli tasarım davranışı |
|---|---|
| Harita karosu/DEM eksik | Bilinmeyen alan; güvenilir rota yok uyarısı |
| Konum kayıp | Son doğrulanmış konumu ve belirsizliğini göster; kesin yönlendirmeyi durdur |
| Yeni engel görüldü | Manuel ekle, A* ile yeniden hesapla |
| Habitat iletişimi kesildi | Yerel harita ve kayıtlı prosedürler kullanılabilir; bağlanabilirlik ayrıca gösterilir |
| Tablet bataryası azaldı | Düşük güç, görev kaydı ve yedek navigasyon uyarısı |
| Veri bozuldu | Dosya bütünlük kontrolü (hash), güvenilmez veri uyarısı |
| Eski harita | Tarihi, çözünürlük ve kapsama uyarısı |

**Offline web notu:** HTML'de Tailwind CDN ve Google Fonts uzaktan çağrılıyor. Gerçek offline sürüm için CSS, JS, fontlar ve harita görselleri yerel olmalı. PWA seçilirse Service Worker ile önbellekleme ve offline test yapılmalı. Offline olması mutlaka tüm yerel telsiz/ağ bağlantılarının kopuk olduğu anlamına gelmez.

## 8. Astronotun karşılaşabileceği aksaklıklar

Aşağıdakiler, araştırdığımız **olası senaryolardır**; Boxwork bölgesinde görülmüş kesin olay listesi değildir.

| # | Sorun | MarsWalk yaklaşımı |
|---|---|---|
| 1 | Dik yamaç, kayma | DEM eğim riski ve alternatif rota |
| 2 | Büyük kaya/çatlak/kapalı yol | Engel bildirimi ve A* yeniden hesaplama |
| 3 | Gevşek kum/toza saplanma | Zemin belirsizliği, maliyet artışı, farklı yol |
| 4 | Toz fırtınası ve düşük görüş | Görüş uyarısı, offline navigasyon, konum güvenilirliği |
| 5 | Güneş kaynaklı radyasyon olayı | Doğrulanmış alarm, görevi durdurma, önceden onaylı korunaklı alanlar |
| 6 | Oksijen rezervi azaldı | Kaynak bütçesi kontrolü, görevi iptal/dönüş seçeneği |
| 7 | Giysi basınç sızıntısı | Gerçek telemetri varsa alarm; kayıtlı acil prosedür |
| 8 | Batarya azalması | Enerji rezervi ve yedek navigasyon uyarısı |
| 9 | Aşırı soğuk/termal kontrol sorunu | Giysi/sensör verisi varsa alarm ve dönüş planı |
| 10 | Üs/ekip haberleşmesinin kesilmesi | Yerel görev bilgisi ve offline rota |
| 11 | Konumlandırma kaybı | Son güvenilir konum; belirsizliği açık gösterme |
| 12 | Düşme/yaralanma | Yardım çağrısı ve tahliye noktaları (bağlantı varsa iletim) |
| 13 | Bilim hedefine ulaşılamaması | Alternatif bilim noktaları / iptal |
| 14 | Numune alma uzadı | Süre ve kaynak tahminini güncelleme |
| 15 | Harita eski/eksik | Belirsizlik alanı ve kaynak açıklaması |

## 9. Üç öncelikli tehlike: toz fırtınası, gevşek kum, radyasyon

### 9.1 Toz fırtınası

**Etkiler:** Görüş azalması, kamera tabanlı konum belirlemenin zorlaşması, ekipmanda toz birikimi, güneş enerjili sistemlerin etkilenmesi. Mars'ın ince atmosferinde Dünya'daki fırtınalarla aynı mekanik etki beklenmez.

**Önerilen özellikler:**
- Görüş seviyesi senaryo kaydırıcısı / manuel «görüş azaldı» bildirimi.
- Navigasyon haritasında konum güvenilirliğinin ayrı durumu.
- Bilim görevini durdurmayı değerlendirme ve kayıtlı dönüş yolunu gösterme.
- Konum belirsizse kesin yön talimatı vermeme.

**Demo:** Görüş oranı düşürülür → harita okunabilir kalır → navigasyon güveni değişir → görev yeniden değerlendirme önerisi gösterilir. Yüzde eşikleri temsili olmalı.

### 9.2 Gevşek kum

**Etkiler:** Yürüme hızı düşebilir, düşme/yorulma riski artabilir, tahmini süre sapabilir. Rover tekerleğinden çıkarılan zemin sonucu astronotun ayak basma güvenliğini tek başına doğrulamaz.

**Önerilen özellikler:**
- THEMIS/optik görüntülerden elde edilen zemin ipuçları ve düşük güven işaretleri.
- Gevşek kum hücresine **yüksek geçiş maliyeti** atama.
- Kum alanı bildirildiğinde A* ile çevresinden yeni rota.
- Beklenen/gerçekleşen ilerleme farkından süre tahmini güncelleme (sahada veri varsa).

**Demo:** En kısa yol kumdan geçer → kum riski etkinleşir → daha uzun ama tahmini düşük maliyetli rota önerilir.

### 9.3 Radyasyon artışı **veya** radyasyon sensörü arızası

İki olay birbirinden farklıdır:

- **Gerçek maruziyet artışı:** Doğrulanmış dozimetre veya uzay hava durumu uyarısı mevcut.
- **Ölçüm bozulması:** Sensör verisi yok/eski/hatalı; güvenlik düzeyi **bilinmiyor**.

**Önerilen özellikler:**
- Alarm kaynağını ve en son güvenilir ölçüm zamanını göstermek.
- Bilimsel görevi durdurma ve önceden değerlendirilmiş korunaklı alanları görüntüleme.
- A* ile kayıtlı alanlara erişim seçenekleri; tahmini süre ve arazi riski.
- Sensör arızasında «radyasyon düşük» yazmamak.
- Bir mağara, kaya gölgesi veya çukuru otomatik olarak güvenli radyasyon sığınağı ilan etmemek.

**Demo:** «Alarm» ve «Sensör arızası» ayrı düğmeler; birincide korunaklı alan rotaları, ikincide güven verisi belirsiz uyarısı.

## 10. Ekstrem ve zincirleme kriz senaryoları

Ek olarak tartışılan uç durumlar:

1. Dar kanyonda mahsur kalma / geri dönüş yolunun kapanması.
2. Kırıklı zeminin çökmesi ve yaralanma.
3. Görüşün neredeyse tamamen kaybolması.
4. Üsten uzakta güneş parçacık olayı uyarısı.
5. Bilinmeyen çukur/mağara girişi (güvenli sığınak olduğu varsayılmaz).
6. İki astronotun ayrılması ve buluşma sorunu.
7. Güneş kavuşumu nedeniyle Dünya haberleşmesinin kesintiye uğraması.
8. Kamera ve konum belirlemenin aynı anda bozulması.
9. Habitatın geçici kullanılamaz hale gelmesi.
10. Bilimsel fırsat ile kritik geri dönüş rezervi arasında seçim.

### Öneri: MarsWalk Crisis Mode

Zincirleme bir gösterim:

1. Astronot Boxwork hedefine giderken **yeni engel bildiriyor**.
2. A* rota hesaplıyor, ardından **oksijen bütçesi kritik** hale geliyor.
3. Görev iptali ve geri dönüş öncelik kazanıyor.
4. **Konum belirleme de bozuluyor**; kesin yönlendirme durduruluyor.
5. Sistem son güvenilir konumu, verinin güvenilirlik düzeyini ve kayıtlı acil prosedürü gösteriyor.

**Yeni fikirler:**
- `Last Safe Point`: son doğrulanmış güvenilir konum.
- `Mission Abort Assistant`: görevden vazgeçme/kaynak geri dönüş değerlendirmesi.
- `Uncertainty-Aware Navigation`: konum ve arazi güvenilirliğini ayrı puanlama.
- `Multi-Astronaut Rescue`: ekip arkadaşına erişim/buluşma (ileri aşama).

### Tehlike renkleri

- **Yeşil:** Mevcut kanıta göre düşük risk.
- **Sarı:** Risk veya önemli belirsizlik.
- **Kırmızı:** Bilinen kritik tehlike/alarmlar.
- **Gri:** Yetersiz bilgi; «güvenli» anlamına gelmez.

## 11. Önceden yüklenen korunaklı alanlar

**Evet:** Offline MarsWalk'ta habitat ve olası sığınakların konumları, özellikleri, kapasitesi, onay/koruma durumu **görevden önce yerel veriye eklenir**. Ancak mevcut Gale/Boxwork senaryosunda gerçek, doğrulanmış insanlı Mars sığınakları bulunduğunu iddia etmiyoruz; habitat/sığınaklar **prototip için varsayımsal**.

Her korunaklı noktanın veri kaydı örneği:

```json
{
  "id": "shelter_demo_01",
  "name": "Simüle Edilmiş Acil Sığınak",
  "coordinates": {"lat": null, "lon": null},
  "status": "SIMULATION_ONLY",
  "protection": "pre-approved-in-demo",
  "last_verified": null,
  "capacity": null,
  "available": true
}
```

**Acil akış:** Doğrulanmış alarm → mevcut güvenilir konum → yerelde kayıtlı korunaklı noktaları filtrele → arazi maliyetleriyle alternatif rotaları hesapla → kaynak süresi ve belirsizliği göster. Hiç doğrulanmış erişilebilir seçenek yoksa **«Güvenilir korunaklı rota bulunamadı»** yaz.

## 12. 48 saatlik plan, MVP ve görev paylaşımı

### Kaynak PDF'deki plan

| Süre | Görev |
|---|---|
| 0–4. saat | Veri indirme/açma; çalışma alanı sınırları |
| 4–16. saat | Eğim/risk/kaya katmanları; arayüz iskeleti |
| 16–30. saat | A*, alternatif rotalar, Dijkstra dönüş alanı |
| 30–40. saat | Entegrasyon, yürüyüş modu, fotoğraflar, veri güven paneli |
| 40–48. saat | Hata ayıklama, demo ve sunum |

### Önceliklendirilmiş MVP

**Temel:** Gerçek görüntü + aynı bölge DEM + üçüncü farklı bilim veri türü + bilim noktaları + gerçek maliyet ızgarası + A* alternatif rota + belirsizlik uyarısı + offline çalışabilen harita.

**Yüksek öncelikli ek:** Dijkstra ile dönüş, sade yürüyüş görünümü, gerçek Curiosity fotoğrafları, bir tehlike tetikleme senaryosu.

**Zaman kalırsa:** Kaya tespit modeli, THEMIS, REMS/RAD zaman serisi, gelişmiş çoklu felaket simülasyonu.

**Kapsam dışı:** Tüm gezegen düzeyinde rota, tam 3B, gerçek astronot HUD donanımı, uçuşa hazır EVA güvenlik kontrol sistemi.

### Altı kişilik olası görev dağılımı (öneri)

1. Veri indirme/koordinat ve katman eşleştirme.
2. DEM, eğim ve risk ızgarası.
3. A*/Dijkstra ve rota metrikleri.
4. Görüntüden kaya/engel tespiti.
5. Offline harita/web arayüzü.
6. Bilim noktaları, test, entegrasyon, demo ve sunum.

## 13. Teslimler, demo ve kontrol listesi

### Önerilen teslim paketleri

- Çalışan offline web prototipi veya PWA.
- GitHub kod deposu ve kurulum açıklaması.
- Kullanılan NASA veri ürünlerinin kaynak bağlantıları, ürün kimlikleri ve lisans/kullanım açıklamaları.
- Veri hazırlama adımları ve çalıştırılabilir rota algoritması.
- Senaryo anlatımı, kısa demo videosu, jüri sunumu.

> Resmî platformun zorunlu yükleme biçimi/kuralları ayrıca kontrol edilmeli; yukarıdaki liste ekip için önerilen teslim paketidir.

### Önerilen jüri akışı

1. Offline haritayı aç, farklı NASA katmanlarını göster.
2. Habitat ve iki bilim noktası seç; alternatif rotaları karşılaştır.
3. Eğimi/riski ve veri belirsizliğini açıklayın.
4. Yolda yeni büyük engel veya kum riski simüle edin; A* rotayı değiştirsin.
5. Oksijen/radyasyon alarmı simüle edin; bilinen habitat/korunaklı alternatifler değerlendirilsin.
6. İnterneti kesin; harita ve yerel hesaplamanın çalıştığını gösterin.
7. Sensör/konum kaybında sistemin «bilmiyorum» diyebilmesini gösterin.

### Kontrol listesi

- [ ] Gerçek Boxwork çalışma alanı ve koordinat sınırları doğrulandı.
- [ ] En az üç farklı tür NASA verisi aynı alanda eşleştirildi.
- [ ] Gerçek sayısal DEM'den eğim çıkarıldı.
- [ ] Veri eksikliği/no-data ve çözünürlük uyarıları eklendi.
- [ ] A* gerçekten rota geometrisi hesaplıyor.
- [ ] En az iki alternatif rota ve karşılaştırması mevcut.
- [ ] Dijkstra/dönüş maliyeti gerçek ızgara veya açıklanmış simülasyon üzerinde çalışıyor.
- [ ] Bilim noktaları ve fotoğraf kaynakları doğrulandı.
- [ ] Uygulama internet bağlantısı yokken çalışabiliyor.
- [ ] En az bir kriz senaryosu çalışıyor.
- [ ] Demo, dokümantasyon ve sunum hazır.

## 14. Doğrulanması gereken bilgiler ve kaynaklar

### Kaynaklar / inceleme belgeleri

- Kullanıcının eklediği **`Mars_Haritasi_Gorev_Ozeti.pdf`** (3 sayfa): Görev, Boxwork senaryosu, teknik yaklaşım ve 48 saat planı.
- Kullanıcının eklediği **`mars_ke_if_y_r_y_ak_ll_harita_prototipi.html`**: Argon tarafından oluşturulan etkileşimli arayüz prototipi.
- [NASA Mars Trek](https://trek.nasa.gov/mars/)
- [NASA HiRISE](https://www.uahirise.org/) ve [DTM arşivi](https://www.uahirise.org/dtm/)
- [NASA PDS](https://pds.nasa.gov/) ve [Orbital Data Explorer](https://ode.rsl.wustl.edu/)
- [Curiosity Boxwork panoraması](https://science.nasa.gov/photojournal/curiosity-surveys-the-boxwork-region/)
- [THEMIS Data Viewer](https://themis-data.asu.edu/viewer/themis)
- [Curiosity REMS](https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/rems.html)
- [Curiosity MSL bilim arşivi](https://pds-geosciences.wustl.edu/missions/msl/index.htm)
- [NASA Human Spaceflight Hazards](https://www.nasa.gov/hrp/hazards/)

### Açık araştırma soruları

1. HiRISE ortogörüntüsü, DEM ve CRISM verilerinin **tam Boxwork çalışma alanında** ortak kapsaması var mı?
2. HiRISE stereo DTM yoksa hangi CTX DTM veya başka bölgesel çözünürlükte veri kullanılabilir?
3. Curiosity görüntüleri hangi koordinat ve gözlem tarihlerine güvenilir biçimde eşlenebilir?
4. Mars projeksiyonu, koordinat tanımı, no-data ve raster hizalaması nasıl standardize edilecek?
5. Risk ağırlıkları hangi kaynak/deneyle gerekçelendirilecek? Demo değerleri gerçek EVA güvenlik sınırı gibi gösterilmemeli.
6. Enerji, oksijen ve radyasyon alarmı simülasyonundaki eşikler hangi senaryoya göre belirlenecek?
7. Yerel PWA/tablet üzerinde veri boyutu, depolama, önbellek ve çevrimdışı ilk açılış nasıl test edilecek?
8. Resmî Space Apps 2026 teslim/önceden hazırlık kuralları güncel etkinlik dokümanından ayrıca doğrulanacak.

---

## Tek cümlelik proje tanımı

**MarsWalk**, Mars'ın seçilmiş bir bilimsel bölgesi için NASA'nın farklı görevlerinden elde edilmiş verileri birleştiren; arazi belirsizliğini açıkça gösteren, düşük riskli bilim yürüyüşleri planlamaya ve bağlantı yokken beklenmeyen engellere karşı görev planını yeniden değerlendirmeye yardımcı olan **offline karar destek prototipidir**.

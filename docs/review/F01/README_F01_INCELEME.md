# F01 bilimsel inceleme talebi: Batı delta cephesi / Hawksbill Gap

**English summary.**
- This package asks the geology teammate to review one automated three-raster check of feature F01. It does not
  claim the feature is scientifically confirmed.
- **Requested decisions:**
  - whether the algorithmic scarp lines match the fan front in the CTX, hillshade and HiRISE panels;
  - whether the measured step at the rover anchor is the fan front itself or a sub-step;
  - a hand-traced boundary;
  - ideally, a second independent tracing.
- **Source:** feature layer `1c0248bfeda3`, branch `integ/s5-rc`, tag `s5-rc1`.

---

**Kimden:** yazılım / veri ekibi (Ares Wayfinder)
**Kime:** jeoloji / görüntü yorumlama ekibi (doküman `ARES1_ARAZI_BILIMSEL_DOGRULAMA.md` v0.9 sahibi)
**Durum:** `AUTOMATED_MEASUREMENT_PENDING_REVIEW`. `qa_status` hâlâ `LITERATURE_CONFIRMED`; inceleyici yok.

Bu paket, v0.9 planınızın 4. bölümündeki protokolün F01 için yazılım tarafını uygular. **Jeolojik yorumu onaylamaz.**
Görüntü korelasyonu tek başına sertifika değildir. Sizin kararınız olmadan durum bir üst basamağa geçmeyecek.
Bir sonraki basamak `THREE_LAYER_VISUALLY_CONFIRMED`.

## 1. Kullanılan ürünler (planınızdaki üçlü, açık seçimle)

| Kod | Dosya | Rol | Kontrol |
|---|---|---|---|
| CTX-2020 | `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif` | bağlam görüntüsü, 6 m | başlık okundu; pencerede NoData %0 |
| DEM-2020 | `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` | yükseklik; 2 m analiz hücresi (2×2 ortalama) | başlık okundu; pencerede NoData %0 |
| HIRISE-2020 | `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif` | ayrıntı görüntüsü (panelde 1 m) | başlık okundu; DTM ile aynı orijin, DTM pikseli başına tam 4×4 piksel |

- **Not:** uygulamanın ekranda gösterdiği HiRISE ürünü farklıdır (`soc_007 … Ortho_blend120`, ortografik projeksiyon). F01 için **sizin seçtiğiniz** `soc_006 … first` ürünü kullanıldı; iki ürün birbirinin yerine kullanılmadı.
- **DOI'ler** (10.5066/P9GV1ND3, P9REJ9JN, P9QJDP48) dokümanınızdan alındı. Dosya adları ve başlıklar burada doğrulandı; DOI sayfaları çevrimdışı açılmadı.
- **Pencere bütünlüğü:** her pencerenin ham piksel SHA-256 değeri `F01_qa.json` içinde.

## 2. Ortak pencere ve koordinatlar

- **CRS (üç ürün için aynı):**
  ```
  +proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs
  ```
  Bu bir Mars küresidir, WGS84 değildir.
- **Pencere:**
  - E 4 587 844 – 4 588 582 m, N 1 093 784 – 1 094 484 m;
  - yaklaşık 700 × 700 m zemin (çapa ±350 m; plandaki F01 çalışma yarıçapı);
  - pencere özelliğin sınırı değildir.
- **Çapa:** NASA MMGIS sol 501, RMC 26_1154, 18.45869497° K, 77.40595178° D. Dosyadaki değerle birebir eşleşti.
  - Çapa özelliğin merkezi **değildir**.
  - Bu pencerede çapa, bulunan basamağın tabanına neredeyse denk geliyor: etek 2 m kuzeyde, tepe 25 m kuzeyde.
- **Hizalama ölçümleri (NCC):**
  - CTX ile HiRISE arası: 0,73 m D / −0,92 m K (NCC 0,91);
  - DTM hillshade ile HiRISE arası: 1,56 m D / 0,08 m K (NCC 0,55).
  - Bunlar görüntü panellerindeki çizgi konumunu etkiler, DEM ölçümlerini değil. DEM'in mutlak kaydını doğrulamazlar; G1/S-4 açık kalıyor.

## 3. Ne yapıldı (otomatik; sizin incelemenize sunuluyor)

1. **Dört panel** (`F01_panel.png`): CTX | hillshade 315°/45° | hillshade 90°/45° | HiRISE. Hepsi aynı pencerede, kuzey yukarı, zemin oranında, her panelde 100 m ölçek çubuğu var.
2. **Sınır:** DEM'den **algoritmik eğim kırılması adayı**. Elle çizilmiş jeolojik dokanak değildir.
   - Pencerede eğimi 15°'den büyük hücrelerin baskın aşağı-eğim yönü bulundu (≈ güney). Bu yöne paralel 25 m aralıklı 25 transekt alındı.
   - Her transektte en dik noktanın iki yanında, profil eğiminin 10°'nin altına düştüğü yer tepe (sarı) ve etek (camgöbeği) seçildi. Profil eğimi 10 m taban uzunluğuyla hesaplandı.
3. **Ölçüm transekti** (kırmızı): çapadan geçen transekt (`F01_profile.csv`, 401 örnek). Mozaik ve bağımsız stereo çiftler C/W/DL birlikte verildi. Pencerede mozaik tamamen C çiftinden oluşuyor.

## 4. Ölçümler ve belirsizlik (her biri hesaplandı; varsayılan hata yok)

| Ölçü | Nominal | Bağımsız stereo DEM'ler (C/W/DL) | Seçim eşiği 8–12° |
|---|---|---|---|
| Tepe / etek kotu (DEM-2020, datum DOĞRULANMADI) | −2514,16 / −2522,52 m | — | — |
| Δz | 8,36 m | 8,15–8,62 m | 8,20–8,89 m |
| Yatay mesafe Δd | 23 m | 23–24 m | 22–27 m |
| Ortalama transekt eğimi atan(Δz/Δd) | 20,0° | 19,5–20,0° | 18,2–20,5° |
| Yerel hücre eğimi (segmentin 10 m yakını, 193 hücre): medyan / %95 / maks | 9,9° / 31,8° / 32,5° | %95: 29,6–31,8° | — |

- **Çözünürlük:** DTM 1 m grid, analiz hücresi 2 m. Etkin çözünürlük birkaç metredir; küçük bloklar görünmez.
- **Düşey belirsizlik:** stereo çiftler arasındaki sabit kaymalar (2,4 m'ye kadar) Δz'de birbirini götürür. 2 m kenar başına eğim gürültüsü ≈ 0,048 (~2,7°). Mutlak datum doğrulanmadı.
- **Yorum sınırı:** delta cephesi çok parçalı. Sarı ve camgöbeği çizgilerdeki sıçramalar, her transektin kendi en dik basamağını seçmesinden kaynaklanıyor.

## 5. Sizden istenen kararlar (lütfen `F01_INCELEME_FORMU.md` dosyasını doldurun)

1. **Üç katman:** sarı ve camgöbeği çizgiler CTX'teki ton sınırı, iki hillshade'deki yamaç ve HiRISE'deki birim sınırıyla aynı nesneyi mi izliyor? Hangi kesimlerde izlemiyor?
2. **Basamak mı, cephe mi:** çapadaki 8,4 m / 23 m basamak fan cephesinin kendisi mi, yoksa daha büyük, çok parçalı cephenin alt basamağı mı? Asıl cephe başka bir yerdeyse transekt nereden geçmeli?
3. **Hawksbill Gap:** Kathir ve ark. (NTRS 20250004753) Şekil 1'e göre Hawksbill Gap bu pencerenin neresinde? Paneldeki sol taraftaki V biçimli girinti ile ilişkisi var mı? Biz bunu **iddia etmiyoruz**, sizin konumlamanızı istiyoruz.
4. **Elle çizim:** dokanağı QGIS'te HiRISE `soc_006 … first` ve iki hillshade üzerinde elle çizin. Mümkünse ikinci bir kişi bağımsız çizsin; iki çizim arasındaki farkı metre olarak not edin. Bu, planınızın 8a ve 9. adımlarıdır.
5. **Transekt uçları:** önerdiğimiz tepe ve etek noktalarını kabul ediyor musunuz? Etmiyorsanız kendi uçlarınızı ve işaretleme toleransınızı (m) verin.
6. **Sonuç:** `THREE_LAYER_VISUALLY_CONFIRMED` verilebilir mi?

## 6. QGIS'te açmak için

- **Rasterlar:** USGS dosyalarını yalnızca pencereyi kırparak açın. Proje CRS'ini yukarıdaki `+proj=eqc …` dizesiyle özel CRS olarak tanımlayın; WGS84'e dönüştürmeyin.
- **Çizgiler:** `F01_vertices_eqc.csv` dosyasını "Delimited text" olarak yükleyin (X = `E_eqc_m`, Y = `N_eqc_m`, CRS = yukarıdaki özel CRS). `F01_geometry.json` aynı noktaları enlem/boylam (Mars) olarak içerir.
- **Geri gönderilecekler:**
  - elle çizdiğiniz dokanak, aynı CRS'te E/N köşe listesi (CSV);
  - doldurulmuş form.

## 7. Paket içeriği

| Dosya | İçerik |
|---|---|
| `F01_panel.png` | 4 panelli kanıt görüntüsü |
| `F01_profile.png`, `F01_profile.csv` | transekt profili (mozaik + C/W/DL) |
| `F01_geometry.json` | çapa, algoritmik tepe/etek, transekt (Mars enlem/boylam) |
| `F01_vertices_eqc.csv` | aynı köşeler, eqc metre (QGIS için) |
| `F01_qa.json` | kaynaklar, başlıklar, pencere SHA-256 değerleri, hizalama, ölçümler, belirsizlik, durum |
| `F01_INCELEME_FORMU.md` | doldurulacak inceleme formu |

**Değişmeyecek kurallar:**
- F01 rota modeline girmez ve onaylı tehlike olarak gösterilmez (`validated_for_human_eva=false`).
- F02 ve F03 için raster ölçümleri hâlâ `PENDING`.

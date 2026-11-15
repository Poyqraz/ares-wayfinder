# ARES-1 | M0 Tüp Konumları ve MEDA Sol 516 Doğrulama Raporu

**Tarih:** 14 Kasım 2026  
**Proje:** NASA Space Apps – Jezero Krateri görev planlama prototipi  
**Kapsam:** M0 / Three Forks deposundaki 10 örnek tüpünün ayrı konumları ve MEDA Sol 516 atmosfer basıncı ölçümleri.  
**Önemli:** Bu doküman gerçek kaynağa bağlanır; elde edilmeyen bir sayıyı asla gerçek NASA ölçümü veya kesin koordinat olarak sunmaz.

## 0. Hızlı sonuç / teslim durumu

| İstek | Durum | Bilgi / belirsizlik |
|---|---|---|
| 10 tüpün adı, PDS örnek kimliği, bırakılma günü ve saati | **DOĞRULANDI** | NASA PDS Analyst's Notebook; kaynak güveni **yüksek** |
| Her tüp için NASA'nın resmî **tüp merkezi enlem/boylamı** | **HENÜZ DOĞRULANAMADI** | PDS `sample_tube_locations.csv` resmî olarak bulundu; açıklamasına göre buradaki enlem/boylam **tüp bırakıldığında gezginin konumudur**, tüpün kendisi değil. Konumsal kesinlik **düşük / doğrulanmamış** |
| Three Forks deposunun bölgesel yeri ve 10 tüpün birbirine göre dizilişi | **DOĞRULANDI** | NASA haritası ve görsel belgeler; genel konum güveni **yüksek**, bireysel coğrafi koordinat güveni **düşük** |
| Gerçek MEDA Sol 516 türetilmiş basınç ürünü (CSV + PDS4 XML) | **RESMÎ ÜRÜN DOĞRULANDI** | PDS indeksinde `WE__0516___________DER_PS__________________P01.CSV` var; kimlik güveni **yüksek** |
| MEDA'nın gerçek basınç zaman serisinin indirilip hesaplanması | **ÇALIŞTIRILMADI** | Bu çalışma ortamında NASA CSV/XML dosyalarının baytlarına erişilemedi. İşleme betiği eklidir; sayısal ölçümler **bilinmiyor** |
| Bağımsız çalıştırılabilir indirme/QA kodu | **HAZIR, SÖZDİZİMİ DOĞRULANDI** | `ingest_m0_locations.py` ve `download_validate_meda.py`; ağ indirmesi ve gerçek veriyle uçtan uca test **bekliyor** |

> **Dürüstlük notu:** Kullanıcı tarafından istenen iki son işten hiçbiri şu an gerçek ölçüm/konum sayılarını içeren doğrulanmış bir dosyaya dönüşmedi. Resmî veri ürünleri ve kesin bağlantıları bulundu; sayısal veri edinme aşaması, bu çalışma ortamının dosya indirme kısıtı nedeniyle açıktır. Tüp yerine rover koordinatını veya uydurma basınç değerini vermek bilimsel hata olur.

---

## 1. M0: Gerçek tüp kayıtları

### 1.1 Resmî adlar ve bırakılma olayları

| Tüp | NASA numune kimliği | Bırakılma günü (sol) | Yerel Mars saati (LMST) | Bırakıldığı bölgede kesin tüp noktası |
|---|---|---:|---|---|
| Malay | `M2020-00337-08` | 653 | 13:38:22.157 | Henüz çıkarılmadı |
| Mageik | `M2020-00579-17` | 655 | 13:25:56.560 | Henüz çıkarılmadı |
| Crosswind Lake | `M2020-00639-21` | 661 | 12:48:35.876 | Henüz çıkarılmadı |
| Roubion | `M2020-00164-02` | 666 | 13:32:55.072 | Henüz çıkarılmadı |
| Coulettes | `M2020-00271-06` | 668 | 13:23:55.805 | Henüz çıkarılmadı |
| Montdenier | `M2020-00190-03` | 672 | 14:09:04.193 | Henüz çıkarılmadı |
| Bearwallow | `M2020-00516-15` | 675 | 13:07:52.470 | Henüz çıkarılmadı |
| Skyland | `M2020-00495-12` | 680 | 12:52:41.778 | Henüz çıkarılmadı |
| Atsah | `M2020-00374-10` | 682 | 14:04:26.386 | Henüz çıkarılmadı |
| Amalik Witness | `M2020-00586-18` | 690 | 14:36:26.755 | Henüz çıkarılmadı |

**Birincil kaynak:** [NASA PDS Analyst's Notebook – Three Forks Depot](https://an.rsl.wustl.edu/help/Content/About%20the%20mission/M20/Return%20sample%20science/Three%20Forks%20Depot.htm).  
**Doğruluk seviyesi:** Numune adı, kimliği, bırakılma sol'u ve saat için **yüksek**; bireysel tüp koordinatları için **doğrulanmamış**.

**Dikkat:** Bir tüpün numune alma yeri ile deposa bırakıldığı yer farklıdır. Özellikle `M2020-...` tanımındaki sol değeri, Three Forks'a bırakılma sol'u değildir.

### 1.2 Gerçek konumlar nerede saklanıyor?

NASA'nın resmî Three Forks arşivinde şu dosyalar var:

1. [`sample_tube_locations.csv`](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/sample_metadata/sample_tube_locations.csv) — **rover'ın tüp bırakma esnasındaki konum kayıtları**, Site/Drive ve yönelim. **Tüpün tam koordinatı olarak kullanılamaz**.
2. [`sample_tube_locations.xml`](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/sample_metadata/sample_tube_locations.xml) — CSV sütunlarının PDS4 tanımı.
3. [`sample_tube_identifiers.csv`](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/sample_metadata/sample_tube_identifiers.csv) — tüp / drop-zone tanımlayıcıları.
4. [`sample_tube_targets.csv`](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/sample_metadata/sample_tube_targets.csv) — drop zone, tüpün **glove / seal** uçları ve görüntüleme hedeflerinin adları.
5. [Three Forks veri ve görüntü arşivi](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/) — her tüp için Navcam stereo kaynaklı yaklaşık **0,0025 metre/piksel** ortorektifiye DEM / RZS verisi ve görüntüler.
6. [Mars 2020 PLACES konum sistemi](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm) — rover yerelleştirmesi, dönüşümler ve koordinat referans çerçevesi.
7. [NASA'nın 10 tüplü depot haritası](https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/) — her tüpün ayrı işaretlendiği, fakat tablo hâlinde koordinatları yayınlamayan görsel kaynak.

**Kaynak açıklamasının kesin ifadesi:** *Sample Tube Locations* tablosu rover'ın bırakma olaylarındaki enlem, boylam ve yükseltisini verir. Tüpün yerdeki gerçek merkezi veya iki ucu için ayrı hassas lokalizasyon, yerel hedef/görüntü/DEM verilerinden yapılmalıdır. Bu ayrımı [PDS açıklamasındaki “Sample Tube Locations” ve “Sample Tube Targets” bölümleri](https://an.rsl.wustl.edu/help/Content/About%20the%20mission/M20/Return%20sample%20science/Three%20Forks%20Depot.htm) doğruluyor.

### 1.3 Hassas tüp koordinatı üretmek için teknik iş akışı

1. Yukarıdaki üç metadata CSV'sini ve XML etiketlerini indir; örnek kimliklerini tekilleştir.
2. Her numunenin bırakılma `sol`, `site`, `drive`, rover konumu ve tüpün `glove/seal` hedeflerini eşleştir.
3. Tüpe ait Navcam kaynaklı ortorektifiye yüzey görüntüsü (**RZS**) ve DEM'i aç; tüpün gövdesinin orta noktası ile uçlarını görüntüde işaretle.
4. Ürünün **yerel koordinat sistemi**, dönüklüğü, piksel ölçeği ve kontrol noktalarını PDS4 etiketi ile doğrula.
5. PLACES'in yerel → Mars küresel dönüşüm parametrelerini kullanarak tüp merkezi için enlem/boylam oluştur; Mars'a uygun planetocentric/planetographic enlem türünü açıkça belirt.
6. Hata bütçesi kaydet: rover yerelleştirme belirsizliği, stereo DEM/ortomozaik hata payı, tüp merkezini tespit etme hatası ve dönüşüm belirsizliği. `latitude_deg`, `longitude_east_deg`, `coordinate_source`, `uncertainty_m`, `verification_status` alanlarını üret.
7. En az bir NASA dokümantasyon görüntüsü ve depodaki komşu tüplere göre mesafelerle çapraz kontrol yap; beklenen komşu tüp aralığı yaklaşık **5–15 m**.

**Kabul kriteri:** 10 ayrı coğrafi işaret üretmeden önce her koordinatın gerçekten *tüp merkezine* ait olduğu gösterilmeli. Rover bırakma konumları `rover_drop_location` olarak tutulmalı; `tube_location` alanına kopyalanmamalı. Koordinatların hassasiyeti, hata sınırından küçük olacak şekilde sahte ondalıklarla sunulmamalı.

### 1.4 Sistem entegrasyonu

Önerilen JSON alanları:

```json
{
  "tube_name": "Skyland",
  "sample_id": "M2020-00495-12",
  "drop_sol": 680,
  "rover_drop_position": null,
  "tube_center_position": null,
  "coordinate_reference": "Mars - source CRS to be verified from PDS4 labels",
  "source": "NASA PDS Three Forks Depot Archive",
  "uncertainty_m": null,
  "verification_status": "awaiting_source_data_and_georeferencing"
}
```

`null` değerleri "konumu bilmiyoruz" anlamındadır, `(0,0)` anlamında değildir. Depoyu şimdilik önceki harita referans noktasıyla **yaklaşık tek bölgesel işaret** olarak gösterin. Tek tek 10 tüp için kesin navigasyon hedefi oluşturmayın.

---

## 2. MEDA Sol 516: İlk gerçek basınç ürünü

### 2.1 Resmî kimlik ve doğrulanmış metadata

| Alan | Doğrulanmış değer | Güven |
|---|---|---|
| Görev / cihaz | Perseverance / MEDA — Pressure Sensor (`PS`) | Yüksek |
| Veri seviyesi | `Derived` (kalibre edilmiş değerlerden ve işleme varsayımlarından türetilmiş) | Yüksek |
| Mars günü | **Sol 516** | Yüksek |
| Ürün | `WE__0516___________DER_PS__________________P01.CSV` | Yüksek |
| PDS CSV boyutu | Yaklaşık **392 KiB / 0,399 MB** | Yüksek (arşiv indeksinde) |
| Dünya saati başlangıcı | `2022-08-02T08:51:27.903Z` | Yüksek |
| Dünya saati bitişi | `2022-08-03T08:34:37.576Z` | Yüksek |
| Yerel ortalama Mars saati aralığı | `00516M00:00:06.025` – `00516M23:05:11.037` | Yüksek |
| Mars yılı ve mevsim | MY 37; yaklaşık `Ls=277.68°` | Yüksek |
| Ortalama/minimum/maksimum basınç | **Çıkarılmadı — sayı verilmedi** | Mevcut değil |
| Ölçüm adedi, kalite bayrakları | **Çıkarılmadı** | Mevcut değil |

**Birincil kaynaklar:** [PDS MEDA sensör arşivi](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html), [Sol 516 Derived PS ürününün resmi dizini](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/), [MEDA Derived PS indeksi](https://atmos-ah-vs.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/logs/MARS_2020_MEDA_Derived_PS_del1-5.htm). Veri yayını DOI: [10.17189/1522849](https://doi.org/10.17189/1522849).

**Veri dosyası:** [Gerçek basınç CSV'si](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/WE__0516___________DER_PS__________________P01.CSV)  
**Şema dosyası:** [PDS4 XML etiket dosyası](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/WE__0516___________DER_PS__________________P01.xml)

### 2.2 Sayısal veri işleme prosedürü

Aynı klasördeki `download_validate_meda.py`, kullanıcı bilgisayarında ağ erişimi olduğunda CSV ve PDS4 XML etiketini indirir, XML'deki sütun isimleri ve basınç biriminden ölçüm sütununu bulur, satırları doğrular ve `meda_sol0516_der_ps_tidy.csv` ile `meda_sol0516_ingestion_report.json` üretir.

```bash
cd ARES1_M0_MEDA_Verifikasyon
python download_validate_meda.py
```

**Kodu çalıştırmadan önce:** Python 3.9+ ve internete erişim yeterlidir. Haricî Python paketi kullanılmaz. Kodun sözdizimi kontrol edilmiştir; gerçek dosyayı bu ortamda indirme imkânı olmadığı için NASA verisiyle uçtan uca başarılı olduğunu iddia etmiyoruz. Çalıştırma sırasında sütun eşleştirmesi başarısız olursa hata vererek durur; rastgele sütunu basınç diye seçmez.

**QA kontrolleri:** (1) XML etiketindeki sütun sayısı, (2) basınç biriminin Pa olması, (3) satır uzunluğu, (4) boş/nümerik olmayan değerler, (5) `100–1500 Pa` *yalnızca kaba makullük kontrolü* (güvenlik limiti değildir), (6) eksik ve sıra dışı değerler, (7) kaynak dosya SHA256, (8) PDS sensor kalite bayraklarının **ayrıca** incelenmesi. MEDA sensör dokümanı kalibre edilmiş ürünlerle türetilmiş ürünler arasındaki farkı açıklıyor.

**Veri kullanımı sınırlaması:** MEDA Sol 516, **o sol'da Perseverance'ın bulunduğu yerdeki basınçtır**; bütün Jezero'nun eşzamanlı basınç haritası veya 2040 yılı için hava tahmini değildir. A/Delta görevinin tarihsel çevresel bağlamında kullanılabilir.

### 2.3 Uygulamaya aktarılacak veri sözleşmesi

```csv
mission,sol,record_index,utc,lmst,ltst,pressure_pa,pressure_uncertainty_pa,data_status,source_pds_url
```

Bu satır yalnızca **sütun başlığı şablonudur**; dosya gerçek veri indirilip ayrıştırılmadan herhangi bir sayı içermez. `data_status` ölçüm / türetilmiş veri ayrımını korumalıdır. Yüksek belirsizliğe veya geçersiz QA bayrağına sahip örnekler değerlendirmede ayrı işaretlenmelidir.

---

## 3. Veri teslimi ve QA kontrol kapıları

| Kontrol | Kabul şartı | Mevcut durum |
|---|---|---|
| M0-01 | 10 ad / numune kimliği / bırakma saati PDS ile eşleşiyor | **Geçti** |
| M0-02 | 10 ayrı tüp noktası tüp merkezi olarak doğrulandı | **Geçmedi / veri eksik** |
| M0-03 | Kaynak koordinat sistemi (enlem türü, doğu boylamı, datum) etiketlendi | **Bekliyor** |
| M0-04 | Konum başına metre cinsinden hata sınırı belgelendi | **Bekliyor** |
| MEDA-01 | Gerçek PDS ürünü, sol ve sürüm doğrulandı | **Geçti** |
| MEDA-02 | CSV/XML gerçek baytlar indirildi, SHA256 kaydedildi | **Bekliyor** |
| MEDA-03 | PDS4 şemasına göre gerçek basınç satırları ayrıştırıldı | **Bekliyor** |
| MEDA-04 | Kalite bayrakları, eksik değerler ve zaman aralığı gözden geçirildi | **Bekliyor** |

### 3.1 M0 otomatik alma betiği

```bash
cd ARES1_M0_MEDA_Verifikasyon
python ingest_m0_locations.py
```

Betik resmî PDS `locations`, `identifiers`, `targets` CSV/XML dosyalarını indirir; SHA256 değerlerini ve sütun tanımlarını korur, tüp kaydıyla eşleşebilen **rover bırakma yeri** bilgilerini `m0_pds_locations_annotated.csv` dosyasına kaydeder. Bu işlem **10 adet kesin tüp GeoJSON'u üretmez**; amaç kaynak veriyi doğru semantikle arşivlemek ve sonraki görsel coğrafi eşleştirmeye hazırlamaktır.

### 3.2 Dosya listesi

| Dosya | İşlev |
|---|---|
| `ARES1_M0_MEDA_DOGRULAMA_RAPORU.md` | Teknik rapor, kaynaklar, bilimsel sınırlar, teslim durumu |
| `M0_tube_status.csv` | Her tüp için resmî örnek kimliği ve **boş bırakılmış, doğrulanmamış koordinat** alanları |
| `ingest_m0_locations.py` | Resmî PDS M0 lokasyon / kimlik / hedef arşivinden otomatik indirme ve kayıt |
| `download_validate_meda.py` | Resmî MEDA Sol 516 CSV/XML indirme ve ilk basınç QA kontrolü |
| `MEDA_sol0516_pressure_manifest.json` | Basınç veri ürünü kimliği, URL'leri ve işlem durumu |

---

## 4. Yazılımcıya kritik uyarılar

1. **Rover koordinatı ≠ tüp koordinatı.** `sample_tube_locations.csv` içindeki gezgin enlem/boylamını ``tube_center_lat`` adı altında kullanmayın.
2. **10 tüpü aynı noktaya yerleştirmeyin.** M0 mevcut durumda tek bir *bölgesel depo hedefi* olarak gösterilebilir; tekil tüpler için kaynak doğrulaması beklenmelidir.
3. **Gerçekte olmayan MEDA satırlarını üretmeyin.** Ürün kimliği doğrulandı ancak gerçek sayısal ölçüm dosyası henüz bu pakette yok.
4. Mars koordinat çerçevesinde planetocentric/planetographic enlem ve doğu pozitif boylamı ürünün PDS4 etiketine göre doğrulayın. Dünya WGS84 varsayımını doğrudan kullanmayın.
5. Bütün veri satırlarında `source_url`, `provenance`, `uncertainty`, `verification_status` alanları bulunsun.
6. NASA'nın örnek deposu haritasında komşu tüpler yaklaşık 5–15 m aralıklarla gösterilir; bu ölçek, yüzlerce metrelik gezgin/harita işaretini tam tüp konumu gibi kabul etmeye izin vermez.

## 5. Neye ihtiyaç var?

İki küçük veri indirmesi sonuçları sayısallaştırmayı mümkün kılar:

- **M0:** `sample_tube_locations.csv/.xml`, ardından tüpü doğrudan coğrafi koordinata bağlamak için her birinin yerel DEM/RZS + PLACES eşleştirmesi.
- **MEDA:** Sol 516 `WE__0516___________DER_PS__________________P01.CSV/.xml`, sonra betiğin gerçek dosyada çalıştırılması ve kalite bayraklarının yorumlanması.

**Bu rapor, kaynak doğrulaması ve entegrasyon hazırlığı açısından tamamlanmıştır. Tek tek tüp koordinatları ile gerçek MEDA basınç sayıları açısından tamamlanmış değildir.**

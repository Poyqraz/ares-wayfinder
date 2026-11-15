# ARES-1 | Bilimsel Veri Doğrulama Paketi (M0, A, B, MEDA)

**Sürüm:** 1.0  
**Hazırlanma:** 2026-11-14  
**Kapsam:** NASA Perseverance / Jezero, Three Forks, Wildcat Ridge, Skinner Ridge, Bright Angel/Cheyava Falls  
**Durum:** M0, A, B kaynaklı kayıtlar hazır. MEDA'nın resmî **Sol 516 türetilmiş basınç** ürünü belirlendi ve otomatik içe alma betiği yazıldı; bu ortamda PDS CSV baytları indirilemedi, bu nedenle sayısal ölçüm dosyası *henüz oluşturulmadı*.

## 0. Görev kodları ve terimler

- **M0:** Three Forks Sample Depot; yüzeye bırakılmış on tüpün geri alınması (senaryomuzda).
- **A:** Batı delta cephesi; **Skinner Ridge** ve **Wildcat Ridge** ayrı kaya oluşumlarıdır (yaklaşık 20 m aralıklı). Bunların dört karotu vardır; iki karot M0 deposundadır.
- **B:** Neretva Vallis, Bright Angel formasyonu; **Cheyava Falls** kayanın adı, **Sapphire Canyon** bu kayadan alınan karotun adıdır. Sapphire Canyon M0'da değildir.
- **Sol:** Perseverance görevindeki Mars günü; `sample_sol`, `sealed_sol`, `depot_drop_sol` **farklı olaylar** olabilir.

## 1. Kanıt güvenilirliği ve belirsizlik şeması

| Etiket | Anlamı | Örnek |
|---|---|---|
| `high` | Birincil NASA/PDS kaydında doğrudan ifade edilen olay veya ölçüm | Tüp ismi, kayıt kimliği, bırakılma günü |
| `medium` | Verilerle desteklenen ancak yorum ve/veya ölçek sınırlaması taşıyan sonuç | Bir kaya katmanının tortullaşma/alterasyon kökeni |
| `low` | Hipotez veya kanıtlanmamış yorum | Cheyava Falls işaretlerinin biyolojik kökeni |
| `pending` | Kaynak ürün bulunmuş ama henüz sayısal veri okunmamış/QA yapılmamış | MEDA CSV sayısal değerleri; tüpün tekil koordinatı |

**Bilimsel iddia ile veri kimliğini karıştırma.** Bir kaya adının doğruluğu `high` olabilirken o kayadaki mineralin biyolojik kökeni `low` olabilir.

## 2. M0 — Gerçek 10 tüp

**İndirilebilir kayıt:** `M0_10_tup_kaydi.csv`.

Kaynak: [Analyst's Notebook / Three Forks Depot](https://an.rsl.wustl.edu/help/Content/About%20the%20mission/M20/Return%20sample%20science/Three%20Forks%20Depot.htm), [NASA Mars Rock Samples](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/), [NASA PIA25682 yerleşim haritası](https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/).

- Tüm tüplerin **resmî isimleri, resmî Sample Designation kodları ve bırakılma Sol+LMST zamanları** PDS Analyst's Notebook ile doğrulanmıştır (`high`).
- Türler: 4 magmatik, 3 tortul, 1 regolit, 1 atmosfer ve 1 witness kontrol tüpü (`high`).
- Daha önceki GeoJSON'daki tek *Three Forks* noktası sadece yakın Perseverance waypoint'i. **On tüpün her birinin enlem/boylamı değildir**. CSV'de boş bırakıldı (`pending`).
- PDS depo arşivinde her tüp için rover Site/Drive, lat/lon/elevation ve yerleşim alanlarının özel ürünleri vardır. **Gerekli ekstra entegrasyon:** bu arşiv ürünlerini okuyup her tüp için koordinatları oluşturmak.
- Arşivde yaklaşık **0,0025 m/piksel** Navcam ortorektifiye DEM/RZS ürünleri mevcut: lokal depo konum QA'sında yararlı; tüm Jezero DEM'sinin yerini tutmaz. Kaynak: [Three Forks Depot belgesi](https://an.rsl.wustl.edu/help/Content/About%20the%20mission/M20/Return%20sample%20science/Three%20Forks%20Depot.htm).

## 3. Görev A — İki ayrı kaya ve dört karot

**İndirilebilir kayıt:** `A_iki_kaya_kanitlari.csv`.

### Skinner Ridge — yakın plan kaynakları

- Kayacın türü: orta taneli, yatay tabakalı kumtaşı; suyla taşınmış çeşitli kırıntılar ve çimentolanma izleri (interpretasyon `medium`).
- **Thornton Gap** aşındırma hedefi.
- **Swift Run (Sol 490, rover'da) ve Skyland (Sol 495, M0 deposunda)** iki gerçek karot (`high`).
- [NASA iki karotu gösteren birincil görsel](https://science.nasa.gov/resource/rock-cores-from-skinner-ridge/)
- [NASA ilk delta karotunu anlatıyor](https://science.nasa.gov/blog/perseverance-takes-first-core-from-the-delta/)
- [Bosak ve arkadaşları, AGU Advances 2024, Table 1](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2024AV001241)

### Wildcat Ridge — yakın plan kaynakları

- Kayacın türü: ince taneli tortul kaya; çökelme, tuzluluk, suyun kaybolması ve organik maddeyi koruma potansiyeli açısından inceleniyor (yorum `medium`).
- **Berry Hollow** aşındırma hedefi.
- **Hazeltop (Sol 509, rover'da) ve Bearwallow (Sol 516, M0 deposunda)** karotları (`high`).
- [NASA iki karotu gösteren birincil görsel](https://science.nasa.gov/resource/perseverance-rock-cores-from-wildcat-ridge/)
- [NASA Wildcat/Skinner iki alanın birlikte yer aldığı harita](https://science.nasa.gov/resource/two-perseverance-sampling-locations-in-jezeros-delta/)
- [Bosak ve arkadaşları, AGU Advances 2024](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2024AV001241)

**QA kritik fark:** 2022'de alınan kayaç örnekleri ~20 m uzaklıktaki iki ayrı oluşumdan; bunları uygulamada tek örnekleme noktası olarak göstermeyin. Mevcut GeoJSON'un tek **A bölgesi waypoint'i** gerçek karot konumu değildir.

## 4. Görev B — Cheyava Falls bilimsel bulguları

**İndirilebilir kayıt:** `B_Cheyava_Falls_bulgular.csv`; her iddianın kaynak ve belirsizlik seviyesi var.

- **Kaya adı:** Cheyava Falls / bölge: Bright Angel (Neretva Vallis).
- **Karot:** Sapphire Canyon, NASA örnek no. 25; **21 Temmuz 2024 / Sol 1215**'te mühürlendi; Perseverance'da (`high`). Kaynak: [NASA sample inventory](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/).
- Kayada kalsiyum sülfat damarları, kırmızı hematit ile ilişkili bantlar ve leopar beneklerine benzeyen reaksiyon cephesi dokuları (`high`, gözlem). [NASA görsel](https://science.nasa.gov/resource/perseverance-finds-a-rock-with-leopard-spots/).
- SHERLOC Raman incelemeleri organik karbonla tutarlı sinyal gösteriyor (`medium`); Fe-P ve Fe-S zenginleşmeleri vivianit/greigit ile tutarlı (`medium`, çıkarım; kesin mineral tanımlaması değil).
- Biyolojik süreçler **olası açıklamalardan sadece birisi** (`low`, hipotez). **Mars'ta yaşam bulunduğuna dair kanıt yok.**
- Esas makale: [Nature (2025), Redox-driven mineral and organic associations](https://www.nature.com/articles/s41586-025-09413-0).
- NASA arka plan: [NASA 2024 Cheyava Falls açıklaması](https://www.nasa.gov/solar-system/nasas-perseverance-rover-scientists-find-intriguing-mars-rock/).

**QA:** yazılımda `possible_biosignature` etiketi gösterilebilir; `life_detected` veya `biological_origin_confirmed` gösterilmemeli.

## 5. MEDA — ilk gerçek ölçüm ürününün seçimi ve entegrasyonu

**Seçilen ürün:** Perseverance MEDA **Derived Pressure Sensor**, **Sol 516**, PDS4 CSV + XML. Sol 516 Wildcat Ridge Bearwallow örneklemesiyle aynı sol olduğu için A göreviyle tarihsel bağ kurar; *ölçüm o kaya yüzeyinin bütününü temsil etmez*.

- [NASA PDS MEDA arşivi](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html)
- [Sol 516 dizin sayfası](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/)
- **Özgün sayısal ölçüm dosyası:** [WE__0516___________DER_PS__________________P01.CSV](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/WE__0516___________DER_PS__________________P01.CSV)
- **Veri şeması / birimler:** [WE__0516___________DER_PS__________________P01.xml](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/WE__0516___________DER_PS__________________P01.xml)
- Bilimsel veri seti DOI: [10.17189/1522849](https://doi.org/10.17189/1522849).

### Çalıştırma (internet erişimi olan geliştirici bilgisayarında)

```bash
python download_validate_meda.py
```

Betiğin beklentisi: NASA CSV ve XML dosyalarını **değiştirmeden** indirmek, XML'deki alan tanımlarından basınç sütununu **Pa** olarak belirlemek, ölçüm içeren temiz bir CSV'ye dönüştürmek, NaN ve sıra dışı değerleri raporlamak ve SHA-256 üretmek. **Kaynak sütunu bulunamazsa hata verir; uydurulmuş değer üretmez.**

Başarılı olduğunda `meda_source/meda_sol0516_der_ps_tidy.csv` ve `meda_source/meda_sol0516_ingestion_report.json` oluşur. PDS kalite bayraklarını değerlendirmek ayrıca gerekir. Uygulamadaki ilk MEDA katmanı **gerçek tarihsel zaman serisi** olacaktır, gelecekteki hava tahmini değil.

**Mevcut durum:** Kaynağın URL, Sol ve veri türü doğrulandı (`high`). Bu çalışma ortamından PDS `text/csv` ve `text/xml` ikili dosyaları indirilemedi; dolayısıyla bu pakette hiçbir sahte sayısal ölçüm değeri bulunmaz. İndirildikten sonra ham dosya ve XML şeması birlikte korunmalıdır (`pending`).

## 6. Geliştirici için somut entegrasyon işleri

1. **M0:** 10 tüpü `M0_10_tup_kaydi.csv` ile numune katmanına yükle; her tüp için `coordinate_status: pending` göster. Tüp konumlarını arşivden çıkarana kadar hepsini depo merkezine aynı noktada sabitleme.
2. **A:** Skinner Ridge ve Wildcat Ridge için iki ayrı hedef kaydı oluştur; her birinin iki karotunun bağlantısını göster. M0'daki **Skyland** ve **Bearwallow** ile karot kimliği üzerinden ilişki kur.
3. **B:** Cheyava Falls/Sapphire Canyon bilgi kartındaki bilimsel iddiaları `B_Cheyava_Falls_bulgular.csv` kaynak+belirsizlik üzerinden göster. Hipotezleri kesin gerçek gibi boyama.
4. **MEDA:** `download_validate_meda.py` ile gerçek basınç örneğini indirdikten sonra temiz ölçüm CSV'sini zaman serisi grafiğine bağla. Ölçüm konumunun rover'a ait olduğunu belirt; tüm krater için meteoroloji olarak yayma.
5. **QA:** Her kaynak için `source_url`, `retrieval_date`, `confidence`, `coordinate_status`, `time_basis`, `measurement_vs_interpretation` alanlarını sakla. M0'daki adlar ile A'daki kaya adlarını farklı varlık tipleri olarak modelle.

## 7. Paket ve dosya durumları

| Dosya | İşlev | Durum |
|---|---|---|
| `M0_10_tup_kaydi.csv` | İsim/ID/sol/tip tablosu | Doğrulanmış kayıtlar; konumlar boş |
| `A_iki_kaya_kanitlari.csv` | 2 kaya + 4 karot | Doğrulanmış isimler, yorum belirsizlikli |
| `B_Cheyava_Falls_bulgular.csv` | İddia bazında bilimsel kanıt | Kaynak ve belirsizlikli |
| `MEDA_sol0516_pressure_manifest.json` | Gerçek ürün metadata | Özgün ürün URL'si doğrulanmış |
| `Jezeroda_3_taslak_waypoint.geojson` | Önceki üç yaklaşık harita pini | NASA waypoint referansı, **kesin numune konumu değil** |
| `download_validate_meda.py` | Kaynağı indir/QA/CSV üret | Çalıştırma geliştirici ortamında gerekli |

## 8. Hızlı kabul kontrolleri

- [ ] M0'da **10 ve yalnızca 10** farklı Sample Designation var.
- [ ] M0 içinde **7 kaya + 1 regolit + 1 atmosfer + 1 witness** var.
- [ ] A'da **iki ayrı kaya**, toplam **dört farklı karot**, M0 ile iki eşleşme var.
- [ ] B'de `Cheyava Falls` **kaya**, `Sapphire Canyon` **karot** ve **M0 dışında**.
- [ ] `life_detected = false`; bilimsel hipotezin güven düzeyi düşük.
- [ ] MEDA ham CSV + PDS4 XML indirildi; kaynak hash, veri satırı ve eksikler raporlandı.
- [ ] MEDA ölçümleri `observed_historical` etiketi taşıyor; EVA anlık hava verisi gibi sunulmuyor.
- [ ] Tüp/kaya **tam koordinatları eksik** kaydı çözülmeden rota varış noktası olarak kullanılmıyor.

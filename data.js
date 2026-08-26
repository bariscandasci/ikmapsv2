/**
 * ANKARA_DATA — Ulaşım & Proje Eşleştirme Modülü veri modeli.
 *
 * Bu dosya classic <script> olarak yüklenir (ES module DEĞİL) ki index.html
 * dosya sisteminden (file://) çift tıklanarak da açılabilsin.
 *
 * VERİ KAYNAĞI (ÖNEMLİ)
 * ----------------------
 * transitLines[] içindeki M1-M4, A1 Ankaray ve Başkentray hatları ile
 * EGO_261_6 / EGO_105_1 otobüs hatları OpenStreetMap / Overpass API'den
 * (14 Ağustos 2026 tarihinde) çekilen GERÇEK EGO/Ankara Metrosu rota
 * verilerine dayanır: gerçek hat adları (ör. "261-6: Kasalar-Bakanlık"),
 * gerçek durak sıraları ve gerçek operatör bilgisi (EGO Genel Müdürlüğü,
 * TCDD Taşımacılık). `verified: true` olan hatlar bu şekilde doğrulanmıştır.
 *
 * `verified: false` olan TEK hat Pursaklar için kullanılan tahmini hattır —
 * OSM'de bu ilçeye ait, hub'a (Kızılay/Ulus) doğrudan bağlanan, isimle
 * doğrulanabilir bir EGO hattı bulunamadı. Arayüzde bu hat "TAHMİNİ" rozetiyle
 * ayrıca işaretlenir; İK bu bilgiyi adaya kesin diye SÖYLEMEMELİDİR.
 *
 * Koordinatlar yine de yaklaşıktır (durak/istasyonların tam pin konumu için
 * hâlâ gerçek geocoding/GTFS shape verisi gerekir) — ama hat isimleri, durak
 * adları ve hangi hattın hangi hub'dan geçtiği artık gerçek veriye dayanıyor.
 *
 * ŞEMA
 * ----
 * districts[]:     { id, name, lat, lng, accessStopId, neighborhoods: [{id, name, lat, lng, accessStopId?}] }
 * projects[]:       { id, name, sector, address, lat, lng, accessStopId, shift, salary, meal, transport }
 * transitStops[]:   { id, name, mode }
 * transitLines[]:   { id, name, mode, verified, source, stopIds: string[] }
 * hubStopIds[]:     gerçek aktarma merkezleri (Kızılay, Batıkent, Ankara Gar)
 *
 * transitMatrix sabit bir tablo olarak SAKLANMAZ. app.js içindeki
 * estimateTransit() mesafe + gerçek hat/hub ilişkisi kullanarak anlık
 * hesaplar ve sonucu localStorage tabanlı "ilçe bazlı cache" katmanında
 * saklar (bkz. app.js -> TransitCache). Gerçek süre/sefer bilgisi için bu
 * fonksiyonun içi Google Maps Directions (mode=transit) API çağrısıyla
 * değiştirilebilir; hat/durak modeli ve cache katmanı aynen kalır.
 */

const ANKARA_DATA = {
  districts: [
    {
      id: "kecioren", name: "Keçiören", lat: 39.9930, lng: 32.8720, accessStopId: "stop_kecioren_belediye",
      neighborhoods: [
        { id: "kecioren_etlik", name: "Etlik", lat: 39.9800, lng: 32.8284, accessStopId: "stop_etlik" },
        { id: "kecioren_aktepe", name: "Aktepe", lat: 39.9850, lng: 32.8550, accessStopId: "stop_kecioren_belediye" },
      ],
    },
    {
      id: "cankaya", name: "Çankaya", lat: 39.9179, lng: 32.8627, accessStopId: "stop_kizilay",
      neighborhoods: [
        { id: "cankaya_bahcelievler", name: "Bahçelievler", lat: 39.9198, lng: 32.8390, accessStopId: "stop_bahcelievler" },
        { id: "cankaya_cayyolu", name: "Çayyolu", lat: 39.8814, lng: 32.7276, accessStopId: "stop_cayyolu" },
      ],
    },
    {
      id: "yenimahalle", name: "Yenimahalle", lat: 39.9678, lng: 32.8130, accessStopId: "stop_yenimahalle",
      neighborhoods: [
        { id: "yenimahalle_demetevler", name: "Demetevler", lat: 39.9770, lng: 32.8280, accessStopId: "stop_demetevler" },
        { id: "yenimahalle_batikent", name: "Batıkent", lat: 39.9847, lng: 32.7328, accessStopId: "stop_batikent" },
      ],
    },
    {
      id: "etimesgut", name: "Etimesgut", lat: 39.9500, lng: 32.6700, accessStopId: "stop_etimesgut",
      neighborhoods: [
        { id: "etimesgut_eryaman", name: "Eryaman", lat: 39.9614, lng: 32.6280, accessStopId: "stop_eryaman_m3" },
        { id: "etimesgut_elvankent", name: "Elvankent", lat: 39.9770, lng: 32.6600, accessStopId: "stop_elvankent" },
      ],
    },
    {
      id: "sincan", name: "Sincan", lat: 39.9680, lng: 32.5750, accessStopId: "stop_sincan",
      neighborhoods: [
        { id: "sincan_merkez", name: "Sincan Merkez", lat: 39.9650, lng: 32.5800, accessStopId: "stop_sincan" },
        { id: "sincan_fatih", name: "Fatih", lat: 39.9600, lng: 32.5850, accessStopId: "stop_fatih_m3" },
      ],
    },
    {
      id: "mamak", name: "Mamak", lat: 39.9300, lng: 32.9200, accessStopId: "stop_mamak_baskentray",
      neighborhoods: [
        { id: "mamak_akdere", name: "Akdere", lat: 39.9250, lng: 32.9350, accessStopId: "stop_mamak_baskentray" },
        { id: "mamak_karsiyaka", name: "Karşıyaka", lat: 39.9450, lng: 32.9100, accessStopId: "stop_mamak_baskentray" },
      ],
    },
    {
      id: "altindag", name: "Altındağ", lat: 39.9500, lng: 32.8650, accessStopId: "stop_ulus",
      neighborhoods: [
        { id: "altindag_ulus", name: "Ulus", lat: 39.9440, lng: 32.8570, accessStopId: "stop_ulus" },
        { id: "altindag_hisar", name: "Hisar", lat: 39.9450, lng: 32.8620, accessStopId: "stop_ulus" },
      ],
    },
    {
      id: "golbasi", name: "Gölbaşı", lat: 39.7900, lng: 32.8100, accessStopId: "stop_golbasi",
      neighborhoods: [
        { id: "golbasi_merkez", name: "Gölbaşı Merkez", lat: 39.7920, lng: 32.8080, accessStopId: "stop_golbasi" },
      ],
    },
    {
      id: "pursaklar", name: "Pursaklar", lat: 40.0700, lng: 32.9000, accessStopId: "stop_pursaklar_est",
      neighborhoods: [
        { id: "pursaklar_merkez", name: "Pursaklar Merkez", lat: 40.0700, lng: 32.9000, accessStopId: "stop_pursaklar_est" },
      ],
    },
  ],

  // HAFTALIK ACİL PROJELER: Buraya id'sini eklediğin projeler, sonuç
  // kartlarında kırmızı "ACİL" rozetiyle öne çıkarılır. Her hafta bu listeyi
  // güncellemen yeterli — id'ler aşağıdaki projects[] dizisindeki "id" alanı
  // ile birebir aynı olmalı (ör. "proj_365_avm").
  urgentProjectIds: [
    "proj_bilkent_universitesi", // Bilkent Üniversitesi
    "proj_tepe_prime", // Tepe Prime
    "proj_rec_adliye", // REC Adliye
    "proj_medical_park_hastane_2", // Medical Park Hastane (Keçiören)
    "proj_vega", // Vega
    "proj_optimum_avm", // Optimum AVM
    "proj_panora_avm", // Panora AVM
    "proj_duru_beytepe", // Duru Beytepe
    "proj_medical_park_hastane", // Medical Park Hastane (Batıkent)
  ],

  // Gerçek Tepe Destek proje portföyünden (2026-08-24 tarihli iç veri) alınmıştır.
  // Koordinatlar: Google Maps linki verilenler için doğrudan çözümlenmiş,
  // diğerleri için OSM Nominatim ile geocode edilmiştir. shift/salary/meal/
  // transport alanları İK'nın adaya aktarabileceği temel proje şartlarıdır;
  // personel isim/telefon gibi kişisel iletişim bilgileri bu modülün kapsamı
  // dışında bırakılmıştır (ulaşım eşleştirmesiyle ilgisi yoktur).
  projects: [
    { id: "proj_365_avm", name: "365 AVM", sector: "Temizlik", address: "Birlik Mahallesi, Çankaya", lat: 39.875645, lng: 32.869926, accessStopId: "stop_kizilay", shift: "8-20/10-22", salary: "28.500₺", meal: "Yemekhane", transport: "2.500₺", referral: "Ofise davet>Serdar Vatan>Ahmet Tekin" },
    { id: "proj_akbank", name: "Akbank", sector: "Temizlik", address: "Ostim Sanayi Sitesi, Yenimahalle", lat: 39.9677873, lng: 32.7458173, accessStopId: "stop_ostim_m1", shift: "08.00-18.00", salary: "28.000₺", meal: "12.000-13.000₺", transport: "-", referral: "Ofise davet>Esat Bey" },
    { id: "proj_akbank_2", name: "Akbank", sector: "Temizlik", address: "Mustafa Kemal Mahallesi, Çankaya", lat: 39.910399, lng: 32.768046, accessStopId: "stop_kizilay", shift: "08.00-18.00", salary: "28.000₺", meal: "12.000-13.000₺", transport: "-", referral: "Ofise davet>Esat Bey" },
    { id: "proj_akfen_holding", name: "Akfen Holding", sector: "Temizlik", address: "GOP, Çankaya", lat: 39.888583, lng: 32.872306, accessStopId: "stop_kizilay", shift: "7.00-17.00", salary: "34.292₺", meal: "Yemekhane", transport: "2.228₺" },
    { id: "proj_ankara_oto", name: "Ankara Oto", sector: "Temizlik", address: "Çayyolu, Çankaya", lat: 39.8968152, lng: 32.681025, accessStopId: "stop_cayyolu", shift: "8.00-18.00", salary: "28.000₺", meal: "Yemekhane", transport: "Servis", referral: "Ofise davet>Abdurrahman Sabırsuyu>Müşteri Görüşmesi" },
    { id: "proj_ankara_oto_2", name: "Ankara Oto", sector: "Temizlik", address: "İskitler, Altındağ", lat: 39.947408, lng: 32.841043, accessStopId: "stop_ulus", shift: "8.00-18.00", salary: "28.000₺", meal: "Yemekhane", transport: "3.100₺", referral: "Ofise davet>Abdurrahman Sabırsuyu>Müşteri Görüşmesi" },
    { id: "proj_ankara_podium_avm", name: "Ankara Podium AVM", sector: "Temizlik", address: "Gimat, Yenimahalle", lat: 39.962315, lng: 32.769409, accessStopId: "stop_yenimahalle", shift: "7.30-16.30/13.30-22.00", salary: "30.000₺", meal: "Yemekhane", transport: "2.920₺" },
    { id: "proj_baskent_emlak_konutlari", name: "Başkent Emlak Konutları", sector: "Temizlik", address: "Doğukent Bulvarı, Çankaya", lat: 39.860111, lng: 32.857771, accessStopId: "stop_kizilay", shift: "8.00-17.00", salary: "30.000₺", meal: "8.580₺", transport: "2.700₺" },
    { id: "proj_bilkent_center", name: "Bilkent Center", sector: "Temizlik", address: "Bilkent Center AVM, Çankaya", lat: 39.884009, lng: 32.758607, accessStopId: "stop_bilkent", shift: "7.30-16.30/13.30-22.00", salary: "31.700₺", meal: "8.000₺", transport: "2.000₺", referral: "Ofise davet>Erdal Bey" },
    { id: "proj_bilkent_ohm", name: "Bilkent OHM", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.907552, lng: 32.765402, accessStopId: "stop_bilkent", shift: "8.00-18.00", salary: "28.000₺", meal: "8.000₺", transport: "Servis" },
    { id: "proj_bilkent_sehir_hastanesi", name: "Bilkent Şehir Hastanesi", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.900984, lng: 32.75704, accessStopId: "stop_bilkent", shift: "-", salary: "28.000₺", meal: "Yemekhane", transport: "Servis", referral: "Sağlık raporu çıkart>BŞH'ye götür" },
    { id: "proj_bilkent_universitesi", name: "Bilkent Üniversitesi", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.871106, lng: 32.764288, accessStopId: "stop_bilkent", shift: "7-15 / 15-23 / 23-7", salary: "28.000₺", meal: "Yemekhane", transport: "Servis", referral: "Ofise davet>Murat" },
    { id: "proj_cyberpark", name: "Cyberpark", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.869736, lng: 32.745041, accessStopId: "stop_bilkent", shift: "8.00-18.00", salary: "30.000₺+", meal: "7.500₺", transport: "Servis", referral: "Ofise davet>Ali Deniz>Mehmet Uygur" },
    { id: "proj_denizbank", name: "Denizbank", sector: "Temizlik", address: "Tunalı Hilmi, Çankaya", lat: 39.888848, lng: 32.854832, accessStopId: "stop_kizilay", shift: "8.00-18.00", salary: "-", meal: "-", transport: "-" },
    { id: "proj_denizbank_2", name: "Denizbank", sector: "Temizlik", address: "Ostim 100. Yıl Bulvarı, Yenimahalle", lat: 39.967965, lng: 32.746508, accessStopId: "stop_ostim_m1", shift: "8.00-18.00", salary: "9.562₺", meal: "-", transport: "-" },
    { id: "proj_denizbank_3", name: "Denizbank", sector: "Temizlik", address: "Turan Güneş Bulvarı, Çankaya", lat: 39.846071, lng: 32.836557, accessStopId: "stop_kizilay", shift: "8.00-18.00", salary: "-", meal: "-", transport: "-" },
    { id: "proj_denizbank_call_center", name: "Denizbank Call Center", sector: "Çağrı Merkezi", address: "Göksu AVM, Etimesgut", lat: 39.986414, lng: 32.646415, accessStopId: "stop_etimesgut", shift: "8.00-17.00", salary: "30.000₺", meal: "12.000₺", transport: "3.300₺" },
    { id: "proj_denizbank_intertech", name: "Denizbank İntertech", sector: "Temizlik", address: "Bilkent Kampüs, Çankaya", lat: 39.870603, lng: 32.750583, accessStopId: "stop_bilkent", shift: "8.30-18.00", salary: "30.000₺", meal: "12.000₺", transport: "3.300₺" },
    { id: "proj_doc_s_vadi", name: "Doc's Vadi", sector: "Temizlik", address: "Cezayir Caddesi, Çankaya", lat: 39.872002, lng: 32.851049, accessStopId: "stop_kizilay", shift: "08.00-17.00", salary: "31.630₺", meal: "8.580₺", transport: "3.640₺" },
    { id: "proj_duru_beytepe", name: "Duru Beytepe", sector: "Temizlik", address: "Ahlatlıbel Beytepe, Çankaya", lat: 39.8368111, lng: 32.7297404, accessStopId: "stop_beytepe", shift: "8.30-17.30", salary: "28.000₺", meal: "6.000₺", transport: "-" },
    { id: "proj_elemor", name: "Elemor", sector: "Temizlik", address: "Çayyolu, Çankaya", lat: 39.8748898, lng: 32.6870843, accessStopId: "stop_cayyolu", shift: "09.00-18.00 K / 14.00-24.00 E", salary: "27.000₺", meal: "Yemekhane", transport: "1.700₺", referral: "Ofise davet>Serdar Vatan" },
    { id: "proj_inavitas", name: "İnavitas", sector: "Temizlik", address: "Batıkent, Yenimahalle", lat: 39.9493549, lng: 32.7204632, accessStopId: "stop_batikent", shift: "8.00-17.00", salary: "28.000₺", meal: "12.000₺", transport: "-" },
    { id: "proj_is_bankasi", name: "İş Bankası", sector: "Temizlik", address: "Mustafa Kemal Mahallesi, Çankaya", lat: 39.909219, lng: 32.769126, accessStopId: "stop_kizilay", shift: "08.00-18.00", salary: "28.000₺", meal: "10.200₺", transport: "-", referral: "Ofise davet>Esat Bey" },
    { id: "proj_kizilay_avm", name: "Kızılay AVM", sector: "Temizlik", address: "Kızılay, Çankaya", lat: 39.9213722, lng: 32.853286, accessStopId: "stop_kizilay", shift: "7.30-16.00 / 13.30-22.00 / Gece", salary: "30.000₺", meal: "7.500₺", transport: "1.200₺" },
    { id: "proj_marka_magazalar", name: "Marka Mağazalar", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.906372, lng: 32.766483, accessStopId: "stop_bilkent", shift: "9.30-18.30", salary: "30.000₺", meal: "7.500₺", transport: "2.500₺", referral: "Ofise davet" },
    { id: "proj_medical_park_hastane", name: "Medical Park Hastane", sector: "Temizlik", address: "Batıkent, Yenimahalle", lat: 39.9664474, lng: 32.7095556, accessStopId: "stop_batikent", shift: "7-15 / 15-23 / 23-7", salary: "28.000₺", meal: "Yemekhane", transport: "2.000₺", referral: "Görüntülü Görüşme>Ayten Hanım" },
    { id: "proj_medical_park_hastane_2", name: "Medical Park Hastane", sector: "Temizlik", address: "Keçiören Belediyesi Karşısı, Keçiören", lat: 39.975277, lng: 32.867963, accessStopId: "stop_kecioren_belediye", shift: "7-15 / 15-23 / 23-7", salary: "28.000₺", meal: "Yemekhane", transport: "2.000₺", referral: "Oğuzhan Bey'e Yönlendirme (0533 478 40 19)>İSG" },
    { id: "proj_medical_park_hastane_3", name: "Medical Park Hastane", sector: "Temizlik", address: "İncek, Çankaya", lat: 39.8288529, lng: 32.7290956, accessStopId: "stop_cayyolu", shift: "08.00-17.00", salary: "28.000₺", meal: "Yemekhane", transport: "2.000₺" },
    { id: "proj_medipol_universitesi", name: "Medipol Üniversitesi", sector: "Temizlik", address: "Ankara Garı, Yenimahalle", lat: 39.9357479, lng: 32.845484, accessStopId: "stop_gar", shift: "8.00-18.00", salary: "28.000₺", meal: "Yemekhane", transport: "1.800₺", referral: "Görüntülü Görüşme>Ayten Hanım" },
    { id: "proj_meteksan_matbaa", name: "Meteksan Matbaa", sector: "Temizlik", address: "Malıköy, Sincan", lat: 39.7950349, lng: 32.4258086, accessStopId: "stop_sincan", shift: "08.00-18.00", salary: "30.000₺", meal: "Yemekhane", transport: "Servis", referral: "Ofise davet>Ali Deniz" },
    { id: "proj_meteksan_matbaa_2", name: "Meteksan Matbaa", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.8713556, lng: 32.7431938, accessStopId: "stop_bilkent", shift: "08.00-18.00", salary: "30.000₺", meal: "Yemekhane", transport: "Servis", referral: "Ofise davet>Ali Deniz" },
    { id: "proj_meteksan_savunma", name: "Meteksan Savunma", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.8784271, lng: 32.7469718, accessStopId: "stop_bilkent", shift: "08.00-18.00", salary: "30.000₺", meal: "Yemekhane", transport: "Servis", referral: "Ofise davet>Ali Deniz" },
    { id: "proj_nazende", name: "Nazende", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.851209, lng: 32.7590237, accessStopId: "stop_beytepe", shift: "08.00-17.00", salary: "34.000₺", meal: "10.300₺", transport: "-", referral: "Özlem Hanım" },
    { id: "proj_odeabank", name: "Odeabank", sector: "Temizlik", address: "GOP, Çankaya", lat: 39.8918342, lng: 32.8708554, accessStopId: "stop_kizilay", shift: "08.00-18.00", salary: "31.500₺", meal: "12.600₺", transport: "Yok" },
    { id: "proj_optimum_avm", name: "Optimum AVM", sector: "Temizlik", address: "Eryaman, Etimesgut", lat: 39.9656345, lng: 32.6315095, accessStopId: "stop_eryaman_m3", shift: "7.30-16.30/13.30-22", salary: "29.000₺", meal: "7.400₺", transport: "1.800₺" },
    { id: "proj_panora_avm", name: "Panora AVM", sector: "Temizlik", address: "Oran, Çankaya", lat: 39.8481487, lng: 32.8331251, accessStopId: "stop_cayyolu", shift: "7.30-16.30/13.30-22", salary: "33.000₺", meal: "8.500₺", transport: "Servis", referral: "Ofise davet>Serdar Vatan>Tuğrul Bey" },
    { id: "proj_parasut", name: "Paraşüt", sector: "Çağrı Merkezi", address: "Bilkent, Çankaya", lat: 39.908902, lng: 32.764544, accessStopId: "stop_bilkent", shift: "9.00-18.00", salary: "28.000₺", meal: "7.500₺", transport: "-" },
    { id: "proj_park_joven", name: "Park Joven", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.8638076, lng: 32.766768, accessStopId: "stop_bilkent", shift: "8.00-17.30", salary: "28.000₺", meal: "15.000₺", transport: "-" },
    { id: "proj_rec_adliye", name: "REC Adliye", sector: "Temizlik", address: "Etlik, Keçiören", lat: 40.01952, lng: 32.818257, accessStopId: "stop_etlik", shift: "8.00-17.00", salary: "31.500₺", meal: "Yemekhane", transport: "1.800₺" },
    { id: "proj_tepe_prime", name: "Tepe Prime", sector: "Temizlik", address: "Mustafa Kemal Mahallesi Bilkent, Çankaya", lat: 39.9096619, lng: 32.7552122, accessStopId: "stop_bilkent", shift: "8-16 / 11-20", salary: "28.000₺", meal: "7.500₺", transport: "2.000₺", referral: "Ofise davet>Ali Deniz>Ayla Hanım (0553 244 69 53)" },
    { id: "proj_tepe_servis_merkez_ofis", name: "Tepe Servis Merkez Ofis", sector: "Yönetim", address: "Bilkent Center AVM, Çankaya", lat: 39.882829, lng: 32.759688, accessStopId: "stop_bilkent", shift: "7.30-17.30", salary: "26.000₺", meal: "6.000₺", transport: "1.350₺", referral: "Ofise davet>Emrah Bey" },
    { id: "proj_tona", name: "Tona", sector: "Temizlik", address: "Alacaatlı, Çankaya", lat: 39.8239238, lng: 32.7089841, accessStopId: "stop_cayyolu", shift: "8.30-17.30", salary: "34.000₺", meal: "8.000₺", transport: "-" },
    { id: "proj_toyan", name: "Toyan", sector: "Temizlik", address: "Öveçler, Çankaya", lat: 39.894506, lng: 32.823802, accessStopId: "stop_asti", shift: "9-18 / 11-19.30", salary: "22.000₺", meal: "Yemekhane", transport: "1.600₺" },
    { id: "proj_turk_muteahhitler_birligi", name: "Türk Müteahhitler Birliği", sector: "Temizlik", address: "Birlik Mahallesi, Çankaya", lat: 39.879384, lng: 32.880171, accessStopId: "stop_kizilay", shift: "8.00-18.00", salary: "28.000₺", meal: "7.000₺", transport: "-" },
    { id: "proj_vega", name: "Vega", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.913977, lng: 32.767145, accessStopId: "stop_bilkent", shift: "8.00-18.00", salary: "36.200₺", meal: "Yemekhane", transport: "1.800₺", referral: "Ofise davet>Musa Karakaya" },
    { id: "proj_via_flat", name: "Via Flat", sector: "Temizlik", address: "Söğütözü, Çankaya", lat: 39.914345, lng: 32.80865, accessStopId: "stop_sogutozu", shift: "8.00-17.30", salary: "28.000₺", meal: "6.000₺", transport: "600₺", referral: "Ofise davet>Ali Deniz>Ayşe Hanım" },
    { id: "proj_entek", name: "Entek", sector: "Temizlik", address: "Kızılay, Çankaya", lat: 39.920372, lng: 32.852801, accessStopId: "stop_kizilay", shift: "8.30-17.30", salary: "33.000₺", meal: "8.000₺", transport: "3.500₺" },
    { id: "proj_bilkent_otel", name: "Bilkent Otel", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.909055, lng: 32.765951, accessStopId: "stop_bilkent", shift: "7-15 / 15-23 / 23-8", salary: "30.200₺", meal: "Yemekhane", transport: "Servis" },
    { id: "proj_ido_cagri_merkezi", name: "İDO Çağrı Merkezi", sector: "Çağrı Merkezi", address: "Bilkent, Çankaya", lat: 39.906073, lng: 32.766012, accessStopId: "stop_bilkent", shift: "9.00-18.00", salary: "28.000₺", meal: "7.500₺", transport: "-" },
    { id: "proj_enerjisa_cagri_merkezi", name: "Enerjisa Çağrı Merkezi", sector: "Çağrı Merkezi", address: "Bilkent, Çankaya", lat: 39.908231, lng: 32.763953, accessStopId: "stop_bilkent", shift: "9.00-18.00", salary: "28.000₺", meal: "7.500₺", transport: "-" },
    { id: "proj_hop_scooter", name: "HOP Scooter", sector: "Çağrı Merkezi", address: "Bilkent, Çankaya", lat: 39.90803, lng: 32.766929, accessStopId: "stop_bilkent", shift: "9.00-18.00", salary: "32.000₺", meal: "7.500₺", transport: "-" },
    { id: "proj_tepe_insaat", name: "Tepe İnşaat", sector: "Temizlik", address: "Bilkent, Çankaya", lat: 39.906168, lng: 32.764599, accessStopId: "stop_bilkent", shift: "9.00-18.00", salary: "29.000₺", meal: "7.500₺", transport: "Servis" },
    { id: "proj_banvit_genel_mudurluk", name: "Banvit Genel Müdürlük", sector: "Temizlik", address: "Saray, Pursaklar", lat: 40.040837, lng: 32.926793, accessStopId: "stop_pursaklar_est", shift: "9.00-18.00", salary: "32.000-33.000₺", meal: "7.900₺", transport: "4.250₺" },
    // Not: CSV'de semt "Çubuk" yazıyordu ama havalimanı gerçekte Akyurt
    // sınırlarında (OSM Nominatim doğrulaması); Pursaklar'a en yakın
    // modellenmiş durağı kullanıyoruz — bu bağlantı TAHMİNİ (doğrulanmadı).
    { id: "proj_esenboga_havalimani", name: "Esenboğa Havalimanı", sector: "Temizlik", address: "Esenboğa, Akyurt", lat: 40.123063, lng: 32.998721, accessStopId: "stop_pursaklar_est", shift: "7-15 / 15-23 / 23-7", salary: "30.000₺", meal: "Yemekhane", transport: "Servis" },
  ],

  transitStops: [
    { id: "stop_kizilay", name: "Kızılay (15 Temmuz Millî İrade)", mode: "hub" },
    { id: "stop_batikent", name: "Batıkent", mode: "hub" },
    { id: "stop_gar", name: "Ankara Gar", mode: "hub" },

    { id: "stop_ulus", name: "Ulus", mode: "metro" },
    { id: "stop_yenimahalle", name: "Yenimahalle", mode: "metro" },
    { id: "stop_demetevler", name: "Demetevler", mode: "metro" },
    { id: "stop_ostim_m1", name: "OSTİM", mode: "metro" },
    { id: "stop_kecioren_belediye", name: "Belediye (Keçiören)", mode: "metro" },
    { id: "stop_cayyolu", name: "Çayyolu", mode: "metro" },
    { id: "stop_bilkent", name: "Bilkent", mode: "metro" },
    { id: "stop_eryaman_m3", name: "Eryaman 1-2", mode: "metro" },
    { id: "stop_fatih_m3", name: "Fatih", mode: "metro" },
    { id: "stop_sogutozu", name: "Söğütözü", mode: "metro" },
    { id: "stop_beytepe", name: "Beytepe", mode: "metro" },
    { id: "stop_umitkoy", name: "Ümitköy", mode: "metro" },

    { id: "stop_besevler", name: "Beşevler", mode: "ankaray" },
    { id: "stop_bahcelievler", name: "Bahçelievler", mode: "ankaray" },
    { id: "stop_asti", name: "AŞTİ", mode: "ankaray" },
    { id: "stop_dikimevi", name: "Dikimevi", mode: "ankaray" },

    { id: "stop_sincan", name: "Sincan İstasyonu", mode: "tren" },
    { id: "stop_etimesgut", name: "Etimesgut İstasyonu", mode: "tren" },
    { id: "stop_elvankent", name: "Elvankent İstasyonu", mode: "tren" },
    { id: "stop_mamak_baskentray", name: "Mamak İstasyonu", mode: "tren" },

    { id: "stop_etlik", name: "Etlik Son Durak", mode: "otobus" },
    { id: "stop_golbasi", name: "Gölbaşı Hareket Noktası", mode: "otobus" },
    { id: "stop_pursaklar_est", name: "Pursaklar (tahmini durak)", mode: "otobus" },
  ],

  // Her hat, üzerindeki durak id'lerini listeler (fiziksel sıra önemli değil,
  // sadece hangi durağın bu hatta olduğu önemli).
  transitLines: [
    {
      id: "M1", name: "M1 Metro (Batıkent - Kızılay)", mode: "metro", verified: true,
      source: "OSM/Overpass, EGO Genel Müdürlüğü — 2026-08-14",
      stopIds: ["stop_batikent", "stop_yenimahalle", "stop_demetevler", "stop_ostim_m1", "stop_ulus", "stop_kizilay"],
      geometry: [[39.92023,32.85408],[39.92057,32.85407],[39.92115,32.85406],[39.92169,32.85407],[39.92205,32.85413],[39.92241,32.85419],[39.92591,32.8551],[39.92632,32.8552],[39.92665,32.85525],[39.9271,32.85525],[39.92749,32.85518],[39.92818,32.855],[39.92883,32.85483],[39.92944,32.85471],[39.93002,32.85455],[39.93074,32.85437],[39.93121,32.85422],[39.93164,32.85401],[39.93193,32.85383],[39.9338,32.8526],[39.93418,32.85241],[39.93485,32.85225],[39.93734,32.85213],[39.93777,32.85203],[39.93819,32.85178],[39.93862,32.85137],[39.93925,32.85067],[39.93965,32.85027],[39.94001,32.84991],[39.94028,32.84964],[39.94088,32.84892],[39.94133,32.84833],[39.94393,32.84468],[39.94439,32.84403],[39.94483,32.84341],[39.9474,32.8399],[39.94775,32.83944],[39.94967,32.83682],[39.94994,32.83646],[39.95066,32.83547],[39.95122,32.8347],[39.95197,32.83373],[39.9513,32.83478],[39.95153,32.83428],[39.95196,32.83369],[39.95248,32.833],[39.95359,32.83152],[39.95411,32.83081],[39.95443,32.83035],[39.95476,32.82973],[39.95495,32.82919],[39.95505,32.82878],[39.95513,32.82825],[39.95516,32.82768],[39.95514,32.82713],[39.95491,32.82474],[39.95487,32.82418],[39.95487,32.82375],[39.95493,32.82326],[39.95504,32.82273],[39.95522,32.82214],[39.95691,32.81793],[39.95726,32.81706],[39.95754,32.81634],[39.95806,32.815],[39.95892,32.8128],[39.9596,32.81108],[39.96,32.81012],[39.96016,32.80971],[39.96146,32.80615],[39.96175,32.80529],[39.96199,32.80461],[39.96225,32.80386],[39.96373,32.7994],[39.96528,32.79483],[39.96556,32.79401],[39.96583,32.79327],[39.96894,32.7844],[39.96926,32.78348],[39.96949,32.78284],[39.97026,32.7805],[39.97036,32.7801],[39.97046,32.77971],[39.97055,32.77931],[39.97064,32.7789],[39.97078,32.7783],[39.97089,32.7777],[39.971,32.77694],[39.9711,32.77618],[39.97116,32.77559],[39.97122,32.77499],[39.97161,32.77047],[39.97168,32.76961],[39.97178,32.76838],[39.97185,32.76753],[39.97193,32.76663],[39.972,32.76579],[39.97216,32.76396],[39.97226,32.76278],[39.97237,32.76163],[39.97239,32.7609],[39.97245,32.76021],[39.97269,32.75733],[39.97272,32.7566],[39.97272,32.75597],[39.97267,32.75528],[39.97257,32.75445],[39.97245,32.75385],[39.97182,32.75097],[39.97126,32.74841],[39.97113,32.74787],[39.97048,32.74571],[39.97025,32.74491],[39.97002,32.74411],[39.9695,32.74219],[39.96915,32.7408],[39.96882,32.73961],[39.96856,32.73869],[39.96682,32.73349],[39.9667,32.73309],[39.9666,32.73255],[39.96656,32.73203],[39.96658,32.73158],[39.96664,32.73114],[39.96677,32.73057],[39.96698,32.72969],[39.96709,32.72926],[39.96733,32.72859],[39.96757,32.72812],[39.96784,32.72759],[39.96824,32.72681]],
    },
    {
      id: "M2", name: "M2 Metro (Kızılay - Çayyolu - Bilkent)", mode: "metro", verified: true,
      source: "OSM/Overpass, EGO Genel Müdürlüğü — 2026-08-14",
      stopIds: ["stop_kizilay", "stop_sogutozu", "stop_umitkoy", "stop_beytepe", "stop_cayyolu", "stop_bilkent"],
      geometry: [[39.92022,32.85384],[39.91923,32.85386],[39.91887,32.85388],[39.9184,32.854],[39.91767,32.85428],[39.91714,32.85448],[39.91675,32.85464],[39.91559,32.85509],[39.91528,32.85519],[39.91492,32.85524],[39.91461,32.85519],[39.91426,32.85501],[39.91398,32.85472],[39.91374,32.85432],[39.91359,32.8539],[39.91347,32.8534],[39.91339,32.85292],[39.91334,32.85249],[39.91334,32.852],[39.91338,32.85159],[39.91345,32.85112],[39.91361,32.85053],[39.91461,32.84721],[39.91481,32.84653],[39.91496,32.84589],[39.91507,32.84533],[39.91521,32.84443],[39.91533,32.84363],[39.91604,32.83912],[39.91611,32.83859],[39.91617,32.83787],[39.91621,32.837],[39.91622,32.836],[39.91621,32.83488],[39.91613,32.83317],[39.91581,32.83026],[39.91563,32.82916],[39.91544,32.82812],[39.91528,32.82722],[39.91514,32.82643],[39.91497,32.82542],[39.91464,32.82374],[39.91108,32.80891],[39.91086,32.80801],[39.91066,32.80723],[39.9105,32.80656],[39.90995,32.80449],[39.90981,32.80382],[39.90968,32.80312],[39.90919,32.8001],[39.90914,32.79961],[39.90909,32.799],[39.90906,32.79843],[39.90902,32.79721],[39.90899,32.79632],[39.90896,32.79545],[39.90893,32.79498],[39.90886,32.79412],[39.90868,32.78863],[39.90867,32.78798],[39.90865,32.78746],[39.90859,32.78673],[39.90853,32.78626],[39.90849,32.78559],[39.90845,32.78457],[39.90842,32.78376],[39.9084,32.7832],[39.9084,32.78267],[39.90842,32.78209],[39.90801,32.76858],[39.90799,32.76799],[39.90795,32.76755],[39.90781,32.76679],[39.90774,32.76634],[39.90764,32.76539],[39.90754,32.76453],[39.90749,32.76399],[39.90747,32.76345],[39.90752,32.7614],[39.90751,32.76019],[39.9072,32.75332],[39.90716,32.75277],[39.90709,32.75201],[39.90705,32.75095],[39.90702,32.75008],[39.90699,32.74923],[39.90696,32.74873],[39.90696,32.74827],[39.90699,32.74777],[39.90699,32.74683],[39.90698,32.74584],[39.90667,32.73785],[39.90664,32.73716],[39.90659,32.73653],[39.90651,32.73585],[39.90645,32.73525],[39.90641,32.73467],[39.90639,32.73422],[39.90632,32.73326],[39.90626,32.73248],[39.90623,32.73206],[39.90621,32.73143],[39.90633,32.73026],[39.90636,32.72984],[39.90612,32.72386],[39.90548,32.70885],[39.90545,32.70786],[39.90541,32.70707],[39.90493,32.69838],[39.9049,32.69796],[39.90483,32.69743],[39.90475,32.69699],[39.90463,32.69647],[39.90449,32.69601],[39.90435,32.6956],[39.90419,32.69517],[39.90403,32.69477],[39.90379,32.69421],[39.9036,32.69384],[39.90256,32.69229],[39.90224,32.69194],[39.90191,32.69169],[39.90146,32.69149],[39.8986,32.69101],[39.89785,32.69094],[39.8972,32.69089],[39.89681,32.69087],[39.89532,32.69037],[39.89426,32.6897],[39.89386,32.68955],[39.89355,32.68953],[39.89139,32.68956],[39.89098,32.68956],[39.8906,32.6895],[39.89029,32.68938],[39.88907,32.6885],[39.88878,32.68826],[39.8885,32.68794],[39.88821,32.68761],[39.88787,32.68722],[39.88746,32.68679],[39.8869,32.68624]],
    },
    {
      id: "M3", name: "M3 Metro (Batıkent - Eryaman/Sincan yönü)", mode: "metro", verified: true,
      source: "OSM/Overpass, EGO Genel Müdürlüğü — 2026-08-14",
      stopIds: ["stop_batikent", "stop_eryaman_m3", "stop_fatih_m3"],
      geometry: [[39.96824,32.72681],[39.96859,32.72613],[39.96899,32.72528],[39.96917,32.7248],[39.96932,32.72414],[39.96939,32.72365],[39.9694,32.72313],[39.96938,32.72266],[39.9693,32.7222],[39.96919,32.72172],[39.96906,32.72124],[39.96879,32.72038],[39.96857,32.71967],[39.96841,32.71915],[39.96826,32.71856],[39.9681,32.71789],[39.96803,32.71749],[39.96785,32.71632],[39.96772,32.71532],[39.96761,32.71453],[39.96751,32.71368],[39.9675,32.71315],[39.96754,32.71268],[39.96766,32.71214],[39.96783,32.71164],[39.96839,32.7107],[39.96864,32.71034],[39.96908,32.70962],[39.9694,32.70905],[39.96969,32.70847],[39.96993,32.70789],[39.97007,32.7075],[39.97021,32.70696],[39.97034,32.70649],[39.97049,32.70605],[39.97073,32.70549],[39.97136,32.70403],[39.97176,32.70313],[39.972,32.70255],[39.97218,32.70217],[39.97238,32.70181],[39.9726,32.70151],[39.97294,32.70113],[39.97331,32.70079],[39.9775,32.69739],[39.97779,32.69711],[39.97949,32.69534],[39.97974,32.69509],[39.98024,32.69469],[39.9808,32.69424],[39.98138,32.69378],[39.98227,32.69307],[39.98261,32.69281],[39.98286,32.69251],[39.9831,32.69208],[39.98329,32.69162],[39.98344,32.69105],[39.98353,32.69054],[39.98359,32.69004],[39.98362,32.6896],[39.98362,32.68909],[39.98358,32.68558],[39.98356,32.68493],[39.98353,32.68452],[39.98346,32.68392],[39.98331,32.68297],[39.98322,32.68236],[39.98311,32.68173],[39.98298,32.68112],[39.98287,32.68066],[39.98277,32.68024],[39.98254,32.6794],[39.98147,32.67577],[39.98087,32.6738],[39.98054,32.67267],[39.98034,32.67194],[39.98019,32.6714],[39.98001,32.6706],[39.97988,32.66992],[39.97976,32.66911],[39.97962,32.66791],[39.97955,32.6672],[39.97952,32.66589],[39.97953,32.66487],[39.9796,32.66366],[39.97967,32.66271],[39.97973,32.66185],[39.98006,32.65782],[39.98018,32.65628],[39.98021,32.6558],[39.98026,32.65489],[39.9803,32.65409],[39.98033,32.65314],[39.98039,32.65148],[39.98048,32.64877],[39.98051,32.64787],[39.98054,32.64688],[39.98064,32.64371],[39.98065,32.64327],[39.98067,32.64253],[39.98073,32.64126],[39.9811,32.62878],[39.98111,32.62833],[39.98114,32.62737],[39.98118,32.62651],[39.98123,32.62429],[39.98125,32.62366],[39.98138,32.61945],[39.98139,32.61879],[39.98145,32.61702],[39.9815,32.61554],[39.98151,32.61504],[39.98153,32.61442],[39.98156,32.61322],[39.98159,32.61237],[39.98162,32.61137],[39.98175,32.60727],[39.98188,32.60284],[39.9819,32.60213],[39.98192,32.60168],[39.98195,32.60127],[39.98203,32.60045],[39.98217,32.59927],[39.98228,32.59839],[39.9824,32.59749],[39.98272,32.59524],[39.98394,32.58637],[39.98409,32.58531],[39.9842,32.58448],[39.98537,32.57586],[39.98545,32.57525],[39.98557,32.57434],[39.98569,32.5735],[39.98584,32.57237],[39.98713,32.56294],[39.98728,32.56193],[39.98764,32.55958],[39.98773,32.55892]],
    },
    {
      id: "M4", name: "M4 Metro (Kızılay - Keçiören)", mode: "metro", verified: true,
      source: "OSM/Overpass, EGO Genel Müdürlüğü — 2026-08-14",
      stopIds: ["stop_kizilay", "stop_gar", "stop_kecioren_belediye"],
      geometry: [[39.91942,32.85302],[39.92008,32.85298],[39.92063,32.85294],[39.92115,32.85298],[39.92161,32.85307],[39.92487,32.85386],[39.92545,32.85398],[39.92595,32.85406],[39.92628,32.85407],[39.92664,32.85406],[39.92733,32.85393],[39.92771,32.8538],[39.92806,32.85362],[39.9284,32.85339],[39.92874,32.85313],[39.92911,32.85279],[39.92955,32.85222],[39.93003,32.85143],[39.93063,32.8505],[39.93105,32.84985],[39.93128,32.84938],[39.93143,32.84896],[39.93168,32.84804],[39.93192,32.84708],[39.93213,32.84632],[39.93232,32.84576],[39.93253,32.84531],[39.93273,32.84492],[39.93324,32.84402],[39.93367,32.84327],[39.93404,32.84263],[39.93447,32.84184],[39.935,32.84086],[39.93522,32.84056],[39.93546,32.84024],[39.93581,32.83991],[39.93625,32.83965],[39.93668,32.83949],[39.93705,32.83941],[39.93753,32.8394],[39.93786,32.83944],[39.93838,32.8397],[39.93885,32.84013],[39.94207,32.84365],[39.94276,32.8444],[39.94327,32.84496],[39.94411,32.84594],[39.94441,32.8463],[39.9455,32.84791],[39.94643,32.84903],[39.94708,32.84977],[39.94771,32.85049],[39.94826,32.8511],[39.95478,32.85809],[39.95539,32.85876],[39.95583,32.85925],[39.95614,32.85957],[39.95647,32.85986],[39.95683,32.86014],[39.95724,32.86039],[39.95781,32.86067],[39.95887,32.86098],[39.95923,32.86112],[39.95955,32.86122],[39.96561,32.86375],[39.96639,32.86405],[39.96703,32.86429],[39.96738,32.86442],[39.96779,32.86442],[39.96825,32.86428],[39.9694,32.86372],[39.96979,32.86357],[39.97087,32.86328],[39.97136,32.8632],[39.97314,32.86297],[39.97356,32.86293],[39.97398,32.86297],[39.97431,32.86301],[39.97462,32.86308],[39.97504,32.8632],[39.97536,32.86332],[39.97569,32.86348],[39.97599,32.86368],[39.97627,32.86393],[39.97653,32.8642],[39.97677,32.86451],[39.97698,32.86486],[39.97718,32.86525],[39.97734,32.86567],[39.97747,32.8661],[39.97774,32.8673],[39.97793,32.86823],[39.9781,32.86908],[39.97857,32.8712],[39.97872,32.8716],[39.9789,32.87194],[39.9815,32.87467],[39.98181,32.87493],[39.98216,32.87512],[39.983,32.87529],[39.98375,32.87538],[39.98434,32.87544],[39.98682,32.87583],[39.98761,32.87594],[39.98823,32.876],[39.98878,32.87594],[39.98935,32.87582],[39.98968,32.87574],[39.99036,32.87551],[39.99098,32.87532],[39.99147,32.87518],[39.99183,32.87512],[39.99229,32.87515],[39.99275,32.87529],[39.99342,32.87562],[39.99385,32.87582],[39.99417,32.87593],[39.99464,32.87606],[39.99697,32.87658],[39.9973,32.87662],[39.99857,32.87625],[39.99895,32.87609],[39.99927,32.87582],[39.99953,32.87547],[39.99973,32.87505],[39.99986,32.87462],[39.99999,32.87397],[40.00006,32.8734],[40.00009,32.87256],[40.00009,32.87211],[40.00005,32.87167],[40.0,32.87126],[39.99984,32.87033],[39.9997,32.86958],[39.99917,32.86706],[39.99909,32.8666],[39.9989,32.86517],[39.99877,32.86463],[39.99858,32.8641],[39.99834,32.86364],[39.99806,32.86324],[39.99782,32.86296],[39.9976,32.86267],[39.99734,32.8623],[39.99702,32.86179],[39.99679,32.86149],[39.99628,32.86087],[39.99589,32.86039],[39.99532,32.85966],[39.99528,32.8596]],
    },
    {
      id: "A1", name: "A1 Ankaray (Bahçelievler - Kızılay - Dikimevi)", mode: "ankaray", verified: true,
      source: "OSM/Overpass, EGO Genel Müdürlüğü — 2026-08-14",
      stopIds: ["stop_besevler", "stop_bahcelievler", "stop_asti", "stop_kizilay", "stop_dikimevi"],
      geometry: [[39.91826,32.81442],[39.91863,32.81442],[39.91895,32.81439],[39.91927,32.81432],[39.91981,32.81429],[39.92014,32.81428],[39.92057,32.81426],[39.92095,32.81429],[39.92156,32.81443],[39.9224,32.81468],[39.92275,32.81478],[39.9232,32.81492],[39.92359,32.81504],[39.92451,32.81529],[39.92514,32.81555],[39.92576,32.81588],[39.92612,32.81608],[39.92652,32.81632],[39.92973,32.81856],[39.9304,32.81909],[39.9307,32.81943],[39.9311,32.81998],[39.93133,32.82032],[39.93179,32.82104],[39.93209,32.82158],[39.93232,32.82211],[39.93256,32.82274],[39.9327,32.82327],[39.93279,32.82381],[39.93283,32.82444],[39.93281,32.82505],[39.93242,32.82681],[39.93236,32.82726],[39.93237,32.82775],[39.93258,32.82853],[39.93275,32.82905],[39.93457,32.83457],[39.93469,32.83503],[39.93478,32.83544],[39.93486,32.83616],[39.93484,32.83669],[39.93474,32.83726],[39.93465,32.83787],[39.93452,32.8385],[39.93423,32.83923],[39.93295,32.84171],[39.93269,32.84213],[39.93245,32.84254],[39.93211,32.84309],[39.93174,32.84365],[39.93123,32.84426],[39.93097,32.84455],[39.93071,32.84479],[39.93018,32.84526],[39.92932,32.84586],[39.92885,32.84612],[39.92615,32.84746],[39.9257,32.84766],[39.9253,32.84784],[39.92483,32.84798],[39.9242,32.84809],[39.92368,32.84832],[39.92165,32.85034],[39.92126,32.8508],[39.92108,32.85116],[39.92088,32.85176],[39.92075,32.85242],[39.92071,32.85292],[39.92068,32.85339],[39.92068,32.85395],[39.92067,32.8545],[39.92068,32.85527],[39.92191,32.85968],[39.92206,32.86007],[39.92228,32.86041],[39.92283,32.86077],[39.92307,32.86104],[39.92336,32.86142],[39.9237,32.86185],[39.92737,32.86679],[39.92777,32.86725],[39.92801,32.86764],[39.92827,32.86845],[39.92843,32.86898],[39.92867,32.86978],[39.92899,32.87116],[39.92918,32.87181],[39.92945,32.8725],[39.92973,32.87304],[39.93002,32.8736],[39.93069,32.87474],[39.93162,32.87633],[39.93191,32.87684],[39.93209,32.87721],[39.93228,32.87758],[39.93253,32.87803]],
    },
    {
      id: "BASKENTRAY", name: "Başkentray (Sincan - Kayaş hattı)", mode: "tren", verified: true,
      source: "OSM/Overpass, TCDD Taşımacılık — 2026-08-14",
      // Not: Başkentray'ın gerçek "Eryaman YHT Gar" durağı M3'ün "Eryaman 1-2"
      // durağına yürüme mesafesindedir (aynı fiziksel peron değil, ama aynı
      // mahalle) — bu yüzden stop_eryaman_m3'ü de bu hatta dahil ediyoruz;
      // aksi halde algoritma Sincan/Etimesgut'tan Eryaman'a giderken anlamsız
      // şekilde şehir merkezine (Kızılay) gidip geri dönen bir rota öneriyordu.
      stopIds: ["stop_sincan", "stop_etimesgut", "stop_eryaman_m3", "stop_elvankent", "stop_gar", "stop_mamak_baskentray"],
      geometry: [[39.91341,32.97014],[39.91355,32.96888],[39.91358,32.96803],[39.91371,32.96372],[39.91374,32.96258],[39.91376,32.96205],[39.91381,32.9614],[39.91395,32.96065],[39.91426,32.95964],[39.91474,32.95823],[39.91498,32.95752],[39.91517,32.95709],[39.91548,32.95655],[39.91613,32.95551],[39.91652,32.95471],[39.91672,32.95413],[39.91682,32.95373],[39.9169,32.95328],[39.917,32.95253],[39.917,32.95193],[39.9169,32.94986],[39.91686,32.94898],[39.91683,32.94829],[39.91681,32.94787],[39.91687,32.94712],[39.91691,32.9467],[39.91794,32.9414],[39.91803,32.94094],[39.91828,32.94007],[39.91861,32.93924],[39.91901,32.93849],[39.91948,32.9378],[39.92002,32.93716],[39.92062,32.93647],[39.92107,32.93582],[39.92148,32.93516],[39.92181,32.93442],[39.92196,32.93404],[39.92288,32.93126],[39.92321,32.9302],[39.92346,32.92946],[39.92379,32.92876],[39.92419,32.92811],[39.92463,32.92747],[39.92505,32.92684],[39.92525,32.92651],[39.92542,32.92615],[39.92559,32.92578],[39.92572,32.9254],[39.92583,32.92501],[39.92596,32.9243],[39.92613,32.92212],[39.92619,32.92133],[39.9263,32.92056],[39.92645,32.91991],[39.92668,32.91917],[39.92698,32.91844],[39.92734,32.91776],[39.92774,32.91719],[39.92956,32.91503],[39.93002,32.91446],[39.93024,32.91413],[39.93064,32.91346],[39.93095,32.91278],[39.93175,32.91087],[39.93213,32.90986],[39.93236,32.90915],[39.93251,32.90843],[39.9327,32.90747],[39.93313,32.90498],[39.9333,32.90417],[39.93377,32.9024],[39.93427,32.90049],[39.93447,32.89973],[39.93478,32.89867],[39.93504,32.89796],[39.93532,32.89734],[39.93573,32.8967],[39.93618,32.89611],[39.93692,32.89542],[39.9372,32.89517],[39.93856,32.89398],[39.93912,32.89341],[39.93963,32.89288],[39.94008,32.89228],[39.94048,32.89162],[39.94077,32.89098],[39.94108,32.89013],[39.94126,32.88938],[39.94137,32.88854],[39.94141,32.88771],[39.9414,32.88727],[39.94136,32.88685],[39.94125,32.88602],[39.94106,32.88522],[39.94094,32.88482],[39.94074,32.88432],[39.9404,32.88361],[39.93991,32.88287],[39.93954,32.88241],[39.93928,32.88212],[39.93876,32.88166],[39.93846,32.88144],[39.93777,32.88104],[39.9368,32.88042],[39.93649,32.88018],[39.93586,32.8796],[39.93534,32.87906],[39.93481,32.87841],[39.93433,32.87781],[39.934,32.8773],[39.93378,32.87692],[39.9336,32.8765],[39.93322,32.87566],[39.933,32.8752],[39.93273,32.87467],[39.93238,32.8742],[39.9318,32.87362],[39.93035,32.87217],[39.92975,32.87142],[39.92944,32.87085],[39.92921,32.87026],[39.92907,32.86968],[39.92899,32.86896],[39.92895,32.86849],[39.92891,32.86723],[39.92889,32.86662],[39.92882,32.86454],[39.92881,32.86402],[39.92879,32.86349],[39.9288,32.86298],[39.92882,32.86251],[39.92904,32.86079],[39.92913,32.8601],[39.92916,32.85954],[39.92917,32.85628],[39.92918,32.85525],[39.92926,32.85389],[39.92931,32.85317],[39.92939,32.85229],[39.92952,32.85169],[39.92968,32.85113],[39.92992,32.8506],[39.93019,32.85012],[39.93054,32.84968],[39.93216,32.84788],[39.9325,32.8475],[39.93285,32.84712],[39.93351,32.84653],[39.93386,32.84617],[39.93422,32.84572],[39.93444,32.84539],[39.93601,32.84249],[39.93658,32.84142],[39.93695,32.84082],[39.93768,32.83982],[39.93802,32.83921],[39.93946,32.83656],[39.93975,32.83601],[39.94007,32.83543],[39.94333,32.82942],[39.94409,32.82799],[39.94461,32.82709],[39.94501,32.82639],[39.94539,32.82562],[39.9457,32.82485],[39.94598,32.82365],[39.94605,32.82325],[39.94613,32.82242],[39.94612,32.82159],[39.94605,32.82076],[39.94589,32.81996],[39.94527,32.81727],[39.94431,32.8132],[39.94396,32.81174],[39.94307,32.80807],[39.94131,32.80058],[39.94064,32.79744],[39.94021,32.79566],[39.94008,32.7951],[39.93995,32.79463],[39.93978,32.79403],[39.93927,32.79262],[39.93912,32.79223],[39.93735,32.78737],[39.93566,32.7825],[39.93459,32.77927],[39.93405,32.7777],[39.9334,32.77589],[39.93292,32.77424],[39.93269,32.77334],[39.93245,32.77234],[39.9322,32.77133],[39.93176,32.76921],[39.93126,32.76645],[39.93109,32.76542],[39.93099,32.76449],[39.93092,32.76354],[39.93091,32.76261],[39.93094,32.76166],[39.93126,32.75694],[39.93131,32.75626],[39.93151,32.75335],[39.93163,32.7518],[39.93163,32.75041],[39.93158,32.74969],[39.93148,32.74899],[39.93139,32.7485],[39.93113,32.74739],[39.9309,32.74659],[39.93062,32.74575],[39.93028,32.7448],[39.92612,32.73288],[39.92573,32.73167],[39.92545,32.73058],[39.92521,32.72937],[39.92503,32.72814],[39.92493,32.72689],[39.92489,32.72508],[39.92494,32.72381],[39.92508,32.7226],[39.92525,32.72147],[39.92655,32.71538],[39.92673,32.71461],[39.92701,32.71365],[39.92735,32.7126],[39.92775,32.71157],[39.9282,32.71059],[39.92875,32.70956],[39.92965,32.70809],[39.93126,32.70606],[39.93282,32.70414],[39.93507,32.70125],[39.93677,32.69909],[39.93808,32.69747],[39.93849,32.69696],[39.93893,32.6963],[39.93933,32.69563],[39.93971,32.69495],[39.94019,32.69398],[39.94053,32.6931],[39.94117,32.69117],[39.94153,32.69025],[39.94206,32.68897],[39.94232,32.68837],[39.94264,32.68761],[39.94395,32.68448],[39.94436,32.68346],[39.94456,32.68293],[39.94489,32.68186],[39.94769,32.67239],[39.94791,32.67151],[39.94812,32.67052],[39.94831,32.66947],[39.9485,32.66831],[39.94923,32.6639],[39.94957,32.66182],[39.94996,32.65941],[39.95012,32.65838],[39.95146,32.65145],[39.95172,32.65008],[39.95207,32.64829],[39.95287,32.64415],[39.95427,32.63713],[39.95451,32.63608],[39.95476,32.63517],[39.95503,32.63413],[39.95538,32.63277],[39.95605,32.62948],[39.95629,32.62831],[39.95644,32.6273],[39.95652,32.62657],[39.95667,32.62516],[39.95689,32.62277],[39.95716,32.61855],[39.95722,32.61763],[39.95732,32.61689],[39.95744,32.61614],[39.95763,32.6153],[39.95783,32.61461],[39.95808,32.61388],[39.95836,32.61317],[39.959,32.61145],[39.95955,32.60994],[39.95973,32.6094],[39.9599,32.60876],[39.96011,32.60795],[39.96027,32.60712],[39.96049,32.60574],[39.96114,32.60166],[39.96141,32.59985],[39.96176,32.59761],[39.96205,32.59573],[39.96214,32.59515],[39.96308,32.5892],[39.9633,32.58813],[39.96349,32.58747],[39.96365,32.587],[39.96412,32.58568],[39.96504,32.58308],[39.96529,32.58233],[39.96546,32.58182],[39.96629,32.57931],[39.96707,32.57692],[39.97112,32.56537]],
    },
    {
      id: "EGO_261_6", name: "EGO 261-6 Otobüsü (Kızılay - Etlik Son Durak)", mode: "otobus", verified: true,
      source: "OSM/Overpass, EGO Genel Müdürlüğü — 2026-08-14",
      stopIds: ["stop_kizilay", "stop_etlik"],
      geometry: [[39.94199,32.85429],[39.94154,32.85441],[39.9405,32.85439],[39.94002,32.85438],[39.93883,32.85437],[39.93776,32.85438],[39.93741,32.85438],[39.93701,32.85437],[39.93667,32.85437],[39.9362,32.85435],[39.93587,32.85432],[39.93548,32.85423],[39.93513,32.85412],[39.93467,32.85392],[39.93398,32.85359],[39.93349,32.85334],[39.93312,32.85323],[39.9328,32.85325],[39.9321,32.85365],[39.93152,32.85408],[39.9311,32.85433],[39.93066,32.85453],[39.93006,32.8547],[39.92973,32.85478],[39.92929,32.85489],[39.92821,32.85521],[39.92764,32.85527],[39.92718,32.85505],[39.92668,32.85503],[39.92618,32.855],[39.92471,32.85464],[39.92439,32.85456],[39.92397,32.85446],[39.92343,32.85431],[39.92304,32.85421],[39.92239,32.85404],[39.92199,32.85397],[39.92159,32.85395],[39.92125,32.85393],[39.92087,32.85391],[39.92035,32.85393],[39.91987,32.854],[39.9192,32.85404],[39.91816,32.85407],[39.9176,32.85409],[39.91703,32.85411],[39.91593,32.85414],[39.91649,32.85431],[39.91702,32.85429],[39.91741,32.85428],[39.91758,32.85495],[39.91762,32.85538],[39.9178,32.85632],[39.91803,32.8573],[39.91825,32.85808],[39.91846,32.85879],[39.91868,32.85966],[39.92018,32.85897],[39.92094,32.85855],[39.92139,32.8583],[39.92201,32.85797],[39.92259,32.85765],[39.92381,32.85698],[39.92491,32.85636],[39.92599,32.8558],[39.92637,32.8556],[39.9268,32.85552],[39.92722,32.85544],[39.92755,32.85535],[39.92772,32.85498],[39.92806,32.85484],[39.92856,32.85472],[39.93035,32.85432],[39.9307,32.85432],[39.93106,32.85419],[39.93147,32.85394],[39.93205,32.85353],[39.9325,32.85321],[39.93287,32.8531],[39.93332,32.85312],[39.93421,32.85353],[39.93502,32.85388],[39.93547,32.85408],[39.93584,32.85416],[39.93628,32.85421],[39.93701,32.85419],[39.93731,32.85438],[39.93767,32.85422],[39.93801,32.85424],[39.93961,32.85425],[39.93993,32.85425],[39.9403,32.85425],[39.9407,32.85424],[39.94153,32.85424],[39.94214,32.85436],[39.94259,32.85447],[39.94303,32.85454],[39.94396,32.85455],[39.94465,32.85455],[39.94503,32.85459],[39.9456,32.85472],[39.94622,32.85488],[39.94663,32.85506],[39.94693,32.85521],[39.94727,32.85539],[39.94782,32.85575],[39.94814,32.85601],[39.94767,32.85577],[39.94722,32.85547],[39.9469,32.8553],[39.94636,32.85506],[39.94579,32.85486],[39.94519,32.85472],[39.94468,32.85464],[39.94423,32.85465],[39.94387,32.85464],[39.94346,32.85463],[39.94309,32.8546],[39.94253,32.85456],[39.942,32.85451],[39.94188,32.85448]],
    },
    {
      id: "EGO_105_1", name: "EGO 105-1 Otobüsü (Gölbaşı - Kızılay - Ulus)", mode: "otobus", verified: true,
      source: "OSM/Overpass, EGO Genel Müdürlüğü — 2026-08-14",
      stopIds: ["stop_golbasi", "stop_kizilay", "stop_ulus"],
      geometry: [[39.76765,32.8159],[39.76771,32.81528],[39.76814,32.81537],[39.76905,32.81558],[39.77008,32.81581],[39.77094,32.8161],[39.77175,32.81639],[39.77272,32.81677],[39.77391,32.81722],[39.77456,32.81743],[39.77498,32.81744],[39.77531,32.81743],[39.77595,32.81736],[39.7764,32.81726],[39.7767,32.81711],[39.7771,32.81685],[39.77738,32.81658],[39.77764,32.8163],[39.77811,32.81579],[39.77843,32.81546],[39.77883,32.81522],[39.77916,32.81511],[39.7796,32.81503],[39.78157,32.81507],[39.7822,32.81511],[39.78251,32.8148],[39.78269,32.81395],[39.78331,32.8113],[39.78349,32.81048],[39.7837,32.80962],[39.78383,32.80914],[39.78395,32.80873],[39.7841,32.80829],[39.78431,32.8079],[39.78467,32.80755],[39.78498,32.80739],[39.78533,32.80727],[39.78582,32.80721],[39.78631,32.80727],[39.78661,32.80803],[39.78707,32.80864],[39.78657,32.81026],[39.78639,32.81082],[39.78622,32.81136],[39.78619,32.81187],[39.78629,32.8124],[39.78643,32.813],[39.78668,32.81406],[39.78653,32.81469],[39.78635,32.81545],[39.78625,32.81599],[39.78601,32.81707],[39.78593,32.81764],[39.78571,32.81834],[39.78542,32.81925],[39.78516,32.82007],[39.78496,32.82057],[39.78452,32.82175],[39.7839,32.82342],[39.78328,32.82512],[39.7826,32.82693],[39.78243,32.82736],[39.78207,32.8283],[39.78173,32.8292],[39.78161,32.82961],[39.78156,32.83016],[39.78153,32.83076],[39.78144,32.83185],[39.78143,32.83226],[39.78141,32.83272],[39.78117,32.83313],[39.78099,32.83361],[39.781,32.83404],[39.78128,32.83426],[39.78157,32.8345],[39.78183,32.83387],[39.78225,32.83288],[39.78303,32.83347],[39.78359,32.83217],[39.78414,32.83069],[39.7854,32.82725],[39.78634,32.82471],[39.78706,32.82284],[39.7876,32.8214],[39.78827,32.81975],[39.78861,32.8188],[39.78873,32.81841],[39.78885,32.81779],[39.78903,32.81636],[39.78927,32.81575],[39.78942,32.81535],[39.78984,32.8142],[39.79012,32.81375],[39.79044,32.81332],[39.79076,32.81297],[39.79124,32.81272],[39.79159,32.81255],[39.79197,32.81237],[39.79161,32.81163],[39.79132,32.81119],[39.79106,32.8109],[39.79077,32.81065],[39.79036,32.81038],[39.7898,32.81003],[39.78939,32.80979],[39.78906,32.8096],[39.78951,32.8069],[39.78965,32.80625],[39.79041,32.80649],[39.79086,32.80661],[39.79161,32.80678],[39.79204,32.80683],[39.79246,32.80688],[39.79286,32.80693],[39.79341,32.80697],[39.79394,32.80694],[39.79447,32.80689],[39.79486,32.80684],[39.7955,32.80672],[39.79607,32.80659],[39.79654,32.80648],[39.79687,32.8064],[39.79754,32.80623],[39.79796,32.80613],[39.79838,32.80602],[39.79912,32.80585],[39.80007,32.80557],[39.80044,32.80543],[39.80157,32.80514],[39.80265,32.80488],[39.80317,32.80476],[39.8039,32.80461],[39.80488,32.80439],[39.80544,32.80425],[39.80684,32.80392],[39.8074,32.80377],[39.80851,32.80341],[39.80915,32.80315],[39.80967,32.80289],[39.81014,32.80263],[39.8106,32.80235],[39.81115,32.80199],[39.81195,32.80137],[39.81454,32.79936],[39.81488,32.79911],[39.81525,32.79882],[39.81563,32.79854],[39.81631,32.79805],[39.81662,32.79784],[39.81692,32.79765],[39.8173,32.79745],[39.81766,32.7973],[39.81798,32.79717],[39.81848,32.79701],[39.81895,32.7969],[39.82111,32.79662],[39.82313,32.79641],[39.82636,32.79602],[39.82667,32.796],[39.82716,32.796],[39.82756,32.79604],[39.82789,32.79611],[39.82828,32.79624],[39.82876,32.79647],[39.82908,32.79663],[39.82992,32.79709],[39.83037,32.79731],[39.8308,32.79746],[39.8312,32.79755],[39.83172,32.79759],[39.83219,32.79756],[39.83266,32.79747],[39.83348,32.7972],[39.83393,32.79709],[39.83432,32.79705],[39.83489,32.79709],[39.83533,32.7972],[39.83581,32.79741],[39.83617,32.79765],[39.83655,32.79798],[39.83686,32.79832],[39.8378,32.79954],[39.8381,32.79995],[39.84007,32.80261],[39.84032,32.80303],[39.84064,32.80343],[39.84103,32.80399],[39.84161,32.80476],[39.84186,32.8051],[39.8424,32.80578],[39.84307,32.8067],[39.84342,32.80718],[39.84378,32.80768],[39.84411,32.80808],[39.84439,32.80829],[39.84467,32.80866],[39.84499,32.80902],[39.84538,32.80942],[39.8459,32.80985],[39.84625,32.81009],[39.84655,32.81038],[39.84699,32.81061],[39.84739,32.81077],[39.84794,32.81093],[39.84832,32.81101],[39.84882,32.81105],[39.84917,32.81106],[39.84962,32.81104],[39.84994,32.811],[39.85028,32.81093],[39.85077,32.8108],[39.85119,32.8106],[39.85156,32.81041],[39.85202,32.8102],[39.85242,32.80996],[39.85311,32.80966],[39.85374,32.80941],[39.85427,32.80926],[39.85479,32.80914],[39.85514,32.80907],[39.8555,32.80903],[39.85595,32.80901],[39.85628,32.80903],[39.8569,32.80906],[39.85739,32.80914],[39.85781,32.80924],[39.85831,32.80938],[39.85918,32.80968],[39.85972,32.80989],[39.86029,32.81008],[39.86074,32.8102],[39.86109,32.81027],[39.86149,32.81033],[39.8619,32.81037],[39.86224,32.81038],[39.86362,32.81033],[39.86407,32.81031],[39.86453,32.8103],[39.86489,32.8103],[39.86526,32.81031],[39.86574,32.81035],[39.86622,32.81041],[39.86834,32.81066],[39.87054,32.81091],[39.87252,32.81112],[39.87547,32.81143],[39.87793,32.81167],[39.88009,32.81191],[39.88065,32.81196],[39.88114,32.81201],[39.88165,32.81207],[39.88251,32.81214],[39.88301,32.81218],[39.88398,32.81225],[39.88443,32.81243],[39.8855,32.81253],[39.88597,32.81258],[39.88639,32.81263],[39.88677,32.81267],[39.88712,32.81271],[39.88847,32.81284],[39.88902,32.8129],[39.88939,32.8129],[39.89035,32.81296],[39.89116,32.81304],[39.89264,32.8132],[39.89301,32.81324],[39.89335,32.81327],[39.89428,32.81338],[39.89474,32.81343],[39.89558,32.81352],[39.89608,32.81357],[39.89815,32.8138],[39.89931,32.81393],[39.89985,32.81398],[39.9004,32.81404],[39.9012,32.81412],[39.90153,32.81416],[39.90203,32.81421],[39.90268,32.81428],[39.90337,32.81435],[39.90482,32.81452],[39.90746,32.81481],[39.90804,32.81485],[39.9087,32.81489],[39.90928,32.81489],[39.90963,32.81487],[39.91071,32.81485],[39.91111,32.81496],[39.91142,32.8151],[39.91173,32.81524],[39.91201,32.81546],[39.91252,32.81593],[39.91304,32.81672],[39.91339,32.81771],[39.9135,32.81816],[39.91394,32.82006],[39.91441,32.82198],[39.91463,32.82313],[39.91484,32.82406],[39.91497,32.82476],[39.91523,32.82607],[39.91531,32.82652],[39.91554,32.82786],[39.91562,32.82836],[39.91571,32.82902],[39.91587,32.83007],[39.91596,32.83062],[39.91601,32.83141],[39.91605,32.83241],[39.9161,32.83452],[39.91608,32.835],[39.91605,32.83572],[39.91599,32.83697],[39.91594,32.83772],[39.91592,32.83814],[39.91583,32.83895],[39.91572,32.83968],[39.91562,32.84034],[39.91554,32.84078],[39.91535,32.842],[39.91523,32.84278],[39.91519,32.84347],[39.91512,32.8439],[39.91496,32.84481],[39.91475,32.84614],[39.9146,32.84673],[39.9145,32.84716],[39.91437,32.84787],[39.91422,32.84862],[39.91414,32.84913],[39.91402,32.84996],[39.91376,32.85191],[39.91371,32.85234],[39.91352,32.8534],[39.91355,32.85384],[39.91379,32.85424],[39.91413,32.85436],[39.91542,32.85431],[39.91592,32.85433],[39.91649,32.85431],[39.91702,32.85429],[39.91741,32.85428],[39.91811,32.85427],[39.91888,32.85426],[39.91923,32.85425],[39.91962,32.85423],[39.91999,32.85422],[39.92031,32.85421],[39.92069,32.85419],[39.92119,32.85418],[39.92159,32.8542],[39.92193,32.85423],[39.92233,32.85429],[39.92266,32.85436],[39.92301,32.85442],[39.92424,32.85473],[39.92506,32.85496],[39.92605,32.85523],[39.92648,32.85535],[39.92691,32.85538],[39.9273,32.85532],[39.92764,32.85527],[39.928,32.8552],[39.92919,32.85502],[39.92973,32.85478],[39.93006,32.8547],[39.93043,32.8546],[39.93091,32.85443],[39.93132,32.85421],[39.9321,32.85365],[39.93257,32.85334],[39.93291,32.85323],[39.93329,32.85327],[39.93398,32.85359],[39.93467,32.85392],[39.93513,32.85412],[39.93548,32.85423],[39.93587,32.85432],[39.9362,32.85435],[39.93667,32.85437],[39.93701,32.85437],[39.93744,32.85427],[39.93721,32.85438]],
    },
    {
      id: "EGO_PURSAKLAR_EST", name: "Yerel EGO otobüs hattı (TAHMİNİ — doğrulanmadı)", mode: "otobus", verified: false,
      source: "Doğrulanamadı — OSM sorgusunda Pursaklar'ı hub'a doğrudan bağlayan isimli bir hat bulunamadı",
      stopIds: ["stop_pursaklar_est", "stop_kizilay"],
    },
  ],

  // Gerçek aktarma merkezleri: M1 hem Batıkent'i hem Kızılay'ı, M4 hem
  // Ankara Gar'ı hem Kızılay'ı aynı sefer içinde geçtiği için bu üç durak
  // birbirine "bindiğin aracı değiştirmeden" ulaşılabilir şekilde bağlıdır.
  hubStopIds: ["stop_kizilay", "stop_batikent", "stop_gar"],
};

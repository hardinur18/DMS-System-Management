# Biofinger AT-301 Integration

Dokumen ini mencatat keputusan dan langkah integrasi Biofinger AT-301 ke DMS System Management.

## Status Terverifikasi

Perangkat sudah terhubung lokal lewat kabel LAN/RJ45 dan berhasil dibaca dari PC.

- Device: Biofinger AT-301
- Serial number: GED7244800117
- IP device: 192.168.1.201
- Protocol port: 4370
- Web panel: http://192.168.1.201/
- MAC: 00:17:61:13:16:ad
- Firmware: Ver 6.60 Apr 13 2022
- Platform: ZLM60_TFT
- User terbaca: 97
- Log absensi terbaca: 32603

Web panel device juga menampilkan kapasitas:

- User capacity: 1000
- Transaction capacity: 80000
- Finger capacity: 500

## Network Lokal

Saat device langsung dicolok ke PC lewat LAN, PC dan Biofinger harus berada di subnet yang sama.

Setting yang sudah cocok:

- PC Ethernet IP: 192.168.1.100
- PC subnet: 255.255.255.0
- Biofinger IP: 192.168.1.201
- Biofinger subnet: 255.255.255.0
- Biofinger port: 4370
- Comm key: 0 atau kosong

Gateway dan DNS tidak penting untuk koneksi langsung PC ke device. Kalau Windows menolak save karena DNS over HTTPS, matikan DNS over HTTPS atau kosongkan DNS untuk adapter Ethernet ini.

## Prinsip Integrasi

Biofinger tidak langsung menulis ke payroll final.

Jalur yang dipakai:

1. `attendance_devices` menyimpan identitas mesin.
2. `attendance_devices.work_location_id` menghubungkan mesin ke Master Data Lokasi Kerja seperti Gudang A/B/C.
3. `employee_attendance_device_links` memetakan `external_user_id` dari mesin ke `employees.id` di DMS.
4. `biofinger_attendance_events` menyimpan raw event dari mesin dengan `source_hash` agar import tidak dobel.
5. Setelah mapping benar, event dikonversi ke `attendance_logs` dengan `source = 'biofinger'` dan `attendance_media = 'fingerprint'`.
6. Attendance valid baru masuk hitungan payroll cycle 26 hari.

Dengan alur ini, log asli dari mesin tetap bisa diaudit walaupun mapping employee atau aturan check-in/check-out berubah.

## Target Tanpa PC Admin

Target live adalah AT-301 online sendiri lewat LAN internet atau WiFi, lalu push ke receiver DMS di VPS.

```text
AT-301
-> LAN/WiFi internet lokasi
-> DMS Biofinger ADMS Receiver di VPS
-> Supabase
-> DMS Management App
```

Receiver awal sudah tersedia di:

```text
scripts/biofinger_adms_receiver.mjs
```

Dokumen operasional receiver ada di:

```text
docs/BIOFINGER_ADMS_CLOUD_RECEIVER.md
```

Status test per 2026-08-24:

- Menu `Pengaturan Server cloud` di AT-301 tersedia dan mode `ADMS` terlihat.
- Receiver lokal berhasil listening di PC, termasuk port `8090`.
- Firewall Windows untuk test `8090` sudah bisa dibuka khusus dari IP device.
- Test lokal direct LAN tidak menerima push karena device belum punya internet route.
- Setelah AT-301 disambungkan ke WiFi internet, ADMS push ke VPS Hostinger `187.77.127.179:8090` confirmed.
- Receiver VPS sudah live mode ke Supabase staging.
- Jalur SDK/pull port `4370` sudah confirmed bisa membaca device, user, dan sample event.

Keputusan produk:

- Cloud receiver VPS adalah target final tanpa PC admin.
- Local pull agent tetap menjadi fallback kalau firmware ADMS belum berhasil push.
- Data yang masuk, baik dari cloud receiver maupun pull agent, tetap masuk tabel staging yang sama.

## Device Registry

Nama tempat seperti `Gudang A`, `Gudang B`, `Gudang C`, `Kantor`, dan `Workshop` masuk ke Master Data Lokasi Kerja.

Mesin fingerprint masuk ke Device Registry Biofinger, bukan dicampur sebagai master lokasi.

Contoh:

```text
Master Data Lokasi Kerja
- Gudang A
- Gudang B
- Gudang C

Device Registry Biofinger
- Gudang A - AT-301 -> work_location_id Gudang A
- Gudang B - AT-301 -> work_location_id Gudang B
- Gudang C - AT-301 -> work_location_id Gudang C
```

Setting ini tersedia di halaman `Biofinger`, panel `Device Registry`.

Untuk menambah mesin baru:

1. Buka `Biofinger > Device`.
2. Klik `Tambah Device`.
3. Isi:
   - Nama display, contoh `Biofinger Gudang A`
   - Kode device, contoh `BIO-AT301-002`
   - Serial number dari menu status/web panel mesin
   - Lokasi kerja dari Master Data
   - Status `active`
4. Simpan device.
5. Setting cloud di mesin ke receiver DMS:
   - Server Mode: `ADMS`
   - Alamat server: `187.77.127.179`
   - Port: `8090`
   - HTTPS: `Off`
   - Proxy: `Off`
6. Sambungkan mesin ke LAN/WiFi internet.
7. Lakukan scan test dan cek `last seen`/raw event di halaman Biofinger.

Receiver membaca serial aktif dari Device Registry sebagai allowlist dinamis. Jadi setelah serial tersimpan di DMS, penambahan mesin baru tidak perlu edit env VPS manual kecuali ada kebijakan firewall/IP khusus.

## Flow Karyawan Baru

Urutan resmi untuk karyawan baru:

1. HR/Admin membuat data karyawan di DMS lebih dulu.
2. DMS menyimpan master karyawan, lokasi kerja, shift, status aktif, dan payroll profile.
3. HR/Admin membuat user di mesin Biofinger AT-301 dan enroll sidik jari.
4. User ID dari mesin muncul di menu Biofinger Management App setelah import user device.
5. HR/Admin mapping User ID mesin ke karyawan DMS.
6. Mapping dibuat `active` setelah employee yang dipilih sudah benar.
7. Raw event fingerprint berikutnya bisa diproses ke staging dan kemudian dikonversi ke `attendance_logs`.

DMS tetap menjadi sumber data utama. Biofinger hanya alat scan dan sumber raw transaction.

## Migration

Fondasi database ada di:

```text
supabase/migrations/20260824000100_biofinger_attendance_foundation.sql
```

Migration tersebut menambah:

- Permission `biofinger.view`
- Permission `biofinger.manage`
- Tabel `attendance_devices`
- Tabel `employee_attendance_device_links`
- Tabel `biofinger_attendance_events`
- Kolom `attendance_logs.attendance_device_id`
- Kolom `attendance_logs.biofinger_event_id`
- Source attendance baru: `biofinger`
- Media attendance baru: `fingerprint`
- Seed device AT-301 pertama: `BIO-AT301-001`

Status Supabase development per 2026-08-24:

- Migration Biofinger sudah diterapkan.
- Device `BIO-AT301-001` sudah ada di `attendance_devices`.
- 97 user device sudah masuk ke `employee_attendance_device_links` dengan status `pending`.
- 32603 raw transaction sudah masuk ke `biofinger_attendance_events` dengan status `pending`.
- Event belum dikonversi ke `attendance_logs` karena mapping karyawan belum diverifikasi.

## Script Read-Only

Script pembaca device ada di:

```text
scripts/biofinger_sync.py
```

Install dependency lokal:

```powershell
python -m venv .local-tools\biofinger-venv
.local-tools\biofinger-venv\Scripts\python.exe -m pip install pyzk
```

Cek koneksi dan baca sample:

```powershell
.local-tools\biofinger-venv\Scripts\python.exe scripts\biofinger_sync.py --host 192.168.1.201 --comm-key 0 --sample-limit 10
```

Export raw event ke file lokal:

```powershell
.local-tools\biofinger-venv\Scripts\python.exe scripts\biofinger_sync.py --host 192.168.1.201 --comm-key 0 --output exports\at301-first-read.biofinger.jsonl --users-output exports\at301-users.biofinger.jsonl
```

File `exports/` dan `*.biofinger.jsonl` sengaja di-ignore dari git karena berisi data absensi nyata.

## Import Ke Staging Database

Setelah migration Biofinger sudah diterapkan ke Supabase development, JSONL bisa diimport ke staging table.

Jika direct Postgres/pooler bisa diakses, gunakan `DATABASE_URL` dan jalankan dry-run dulu:

```powershell
$env:DATABASE_URL="postgresql://..."
npm run biofinger:import -- --users exports\at301-users.biofinger.jsonl --events exports\at301-first-read.biofinger.jsonl --dry-run
```

Jika hasil dry-run sudah masuk akal, jalankan tanpa `--dry-run`:

```powershell
npm run biofinger:import -- --users exports\at301-users.biofinger.jsonl --events exports\at301-first-read.biofinger.jsonl
```

Jika jaringan lokal tidak bisa resolve direct database Supabase, gunakan Supabase Management API. Simpan token hanya di environment terminal, jangan commit ke repo.

Dry-run user:

```powershell
$env:SUPABASE_PROJECT_REF="heibhxempixiiqmalyuf"
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
npm run biofinger:import -- --management-api --users exports\at301-users.biofinger.jsonl --dry-run --chunk-size 100
```

Dry-run event:

```powershell
npm run biofinger:import -- --management-api --events exports\at301-first-read.biofinger.jsonl --dry-run --chunk-size 250 --api-delay-ms 150
```

Import user:

```powershell
npm run biofinger:import -- --management-api --users exports\at301-users.biofinger.jsonl --chunk-size 100
```

Import event:

```powershell
npm run biofinger:import -- --management-api --events exports\at301-first-read.biofinger.jsonl --chunk-size 100 --api-delay-ms 150 --api-retries 7
```

Importer melakukan:

- Upsert user device ke `employee_attendance_device_links` sebagai `pending`.
- Upsert raw attendance ke `biofinger_attendance_events`.
- Menjaga `source_hash` supaya import ulang tidak membuat duplikasi.
- Mengisi `employee_id` hanya kalau link sudah berstatus `active`.

Importer tidak otomatis membuat `attendance_logs` final. Konversi ke attendance utama dilakukan setelah mapping employee diverifikasi.

## Flow Sinkron Operasional

Flow sinkron yang dipakai DMS:

1. Pastikan PC bisa akses web panel AT-301 di `http://192.168.1.201/`.
2. Baca device lokal dengan `scripts/biofinger_sync.py`.
3. Export user device dan raw transaction ke file JSONL lokal.
4. Import user ke `employee_attendance_device_links`.
5. Import raw transaction ke `biofinger_attendance_events`.
6. Buka menu `Biofinger` di Management App.
7. Mapping `User ID Mesin` ke `Karyawan DMS`.
8. Setelah mapping valid, converter boleh membuat `attendance_logs` final dengan `source = 'biofinger'`.

Command sinkron ulang dari mesin:

```powershell
.local-tools\biofinger-venv\Scripts\python.exe scripts\biofinger_sync.py --host 192.168.1.201 --comm-key 0 --output exports\at301-latest.biofinger.jsonl --users-output exports\at301-users-latest.biofinger.jsonl
```

Dry-run sebelum import:

```powershell
npm run biofinger:import -- --management-api --users exports\at301-users-latest.biofinger.jsonl --events exports\at301-latest.biofinger.jsonl --dry-run --chunk-size 100 --api-delay-ms 150
```

Import setelah angka dry-run benar:

```powershell
npm run biofinger:import -- --management-api --users exports\at301-users-latest.biofinger.jsonl --events exports\at301-latest.biofinger.jsonl --chunk-size 100 --api-delay-ms 150 --api-retries 7
```

Import aman dijalankan ulang karena `source_hash` mencegah duplikasi raw event.

## Automation Lokal Windows

Automation Biofinger lokal adalah fallback jika ADMS/cloud push belum aktif. Browser app tidak langsung membaca port `4370`; UI hanya membaca hasil yang sudah masuk ke Supabase.

Simpan env rahasia di `.env.local` atau environment Windows, jangan commit ke repo:

```powershell
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_ACCESS_TOKEN=your-supabase-personal-access-token
BIOFINGER_HOST=192.168.1.201
BIOFINGER_PORT=4370
BIOFINGER_COMM_KEY=0
BIOFINGER_DEVICE_CODE=BIO-AT301-001
```

Atau jalankan helper interaktif:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-biofinger-env.ps1
```

Pastikan dependency Python untuk komunikasi AT-301 tersedia:

```powershell
python -m pip install pyzk
```

Jika memakai Python virtualenv khusus, set `BIOFINGER_PYTHON` di `.env.local` ke path `python.exe` virtualenv tersebut.

Test automation tanpa import:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-biofinger-sync.ps1 -NoImport -MaxEvents 5
```

Test automation dengan dry-run import:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-biofinger-sync.ps1 -DryRun -MaxEvents 20
```

Jalankan sync production lokal:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-biofinger-sync.ps1
```

Daftarkan Windows Task Scheduler setiap 5 menit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-biofinger-sync-task.ps1 -EveryMinutes 5
```

Jika ingin langsung menjalankan task setelah dibuat:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-biofinger-sync-task.ps1 -EveryMinutes 5 -RunNow
```

Output automation:

- Export JSONL: `exports/`
- Log proses: `logs/biofinger-sync/`
- State incremental: `.local-tools/biofinger-sync/`
- Dua folder ini di-ignore dari git karena berisi data operasional nyata.

Setelah task berjalan, buka menu `Biofinger` lalu klik `Refresh Data`. User baru dari mesin akan muncul sebagai `pending` di tab `Mapping User`.

Automation memakai state incremental setelah import sukses. Run pertama tanpa state membaca semua log, run berikutnya memakai overlap default 24 jam supaya import tidak mengulang seluruh histori 32 ribu event.

## Hal Yang Jangan Dilakukan Dulu

- Jangan clear/delete transaction log di device sebelum import pertama selesai dan tervalidasi.
- Jangan langsung jadikan semua log device sebagai payroll valid.
- Jangan percaya mapping nama otomatis 100 persen. User ID device harus dipetakan ke employee DMS.
- Jangan pakai jam device sebagai satu-satunya sumber kebenaran payroll. Simpan waktu device sebagai bukti, lalu proses dengan timestamp import/server.
- Jangan commit data export JSONL ke repo.

## Next Step Produk

Urutan kerja setelah fondasi ini:

1. Apply migration ke Supabase development. Done.
2. Import daftar user device ke `employee_attendance_device_links` sebagai `pending`. Done.
3. Import raw transaction ke `biofinger_attendance_events`. Done.
4. Gunakan menu Biofinger di Management App untuk mapping User ID ke Master Karyawan.
5. Verifikasi arti `punch` dan `status_code` dari AT-301.
6. Buat converter raw event menjadi `attendance_logs`.
7. Review sample payroll sebelum dinyalakan untuk semua karyawan.

## Mapping Awal Punch

Mapping sementara dari protokol ZK:

- `punch = 0`: check-in
- `punch = 1`: check-out
- `punch = 4`: overtime/check-in style event
- `punch = 5`: overtime/check-out style event
- Selain itu: `unknown`

Mapping ini wajib dicek ulang dari sample nyata AT-301 sebelum dipakai untuk payroll final.

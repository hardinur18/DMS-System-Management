# Biofinger ADMS Cloud Receiver

Dokumen ini adalah rencana target agar AT-301 bisa online tanpa PC admin.

## Target Arsitektur

Target live:

```text
AT-301 LAN/WiFi internet lokasi
-> DMS Biofinger ADMS Receiver di VPS
-> Supabase staging
-> convert mapped event ke attendance_logs
-> DMS Management App
```

Artinya browser DMS tidak perlu dibuka terus dan PC admin tidak perlu menyala 24 jam.

## Receiver

Receiver ada di:

```text
scripts/biofinger_adms_receiver.mjs
```

Deployment helper untuk VPS ada di:

```text
deploy/biofinger-adms/
```

Status POC per 2026-08-26:

- VPS Hostinger: `187.77.127.179`
- Service: `dms-biofinger-adms`
- Path: `/opt/dms-biofinger-adms`
- Env: `/etc/dms-biofinger-adms.env`
- Port publik: `8090`
- Mode: `BIOFINGER_RECEIVER_DRY_RUN=false`
- Health check: `http://187.77.127.179:8090/health`
- AT-301 push via WiFi sudah confirmed dari serial `GED7244800117`.
- Receiver live sudah menulis ke Supabase staging dan mengabaikan duplicate histori lewat `source_hash`.
- Receiver sudah bisa meminta ulang daftar user/nama lewat command `DATA QUERY USERINFO` pada firmware AT-301 yang diuji.
- Receiver menerima allowlist dari dua sumber: env `BIOFINGER_ALLOWED_SERIALS` dan Device Registry DMS (`attendance_devices.serial_number`) untuk device berstatus `active` atau `maintenance`.

Mode dry-run hanya dipakai untuk test awal. Saat mode live aktif, data masuk staging Biofinger. Konversi ke `attendance_logs` sebaiknya dijalankan manual dulu dari DMS UI sampai sample valid. Setelah itu `BIOFINGER_CONVERT_ON_IMPORT=true` boleh diaktifkan agar event yang sudah mapped otomatis dibuat menjadi absensi final.

Jalankan lokal untuk test:

```powershell
$env:BIOFINGER_RECEIVER_DRY_RUN="true"
$env:BIOFINGER_ALLOWED_SERIALS="GED7244800117"
npm run biofinger:adms
```

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:8090/health -UseBasicParsing
```

Dry-run tidak menulis ke Supabase. Mode ini hanya membuktikan apakah mesin benar mengirim request ADMS.

## Env Production VPS

Set env server-side ini di VPS atau process manager:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BIOFINGER_ADMS_HOST=0.0.0.0
BIOFINGER_ADMS_PORT=8090
BIOFINGER_TIMEZONE_OFFSET=+07:00
BIOFINGER_DEVICE_NAME="Biofinger AT-301 Main Gate"
BIOFINGER_DEVICE_CODE=BIO-AT301-001
BIOFINGER_DEVICE_CODE_PREFIX=BIO-AT301
BIOFINGER_ALLOWED_SERIALS=GED7244800117
BIOFINGER_ALLOWED_REMOTE_IPS=
BIOFINGER_CONVERT_ON_IMPORT=false
BIOFINGER_CONVERSION_BATCH_SIZE=1000
BIOFINGER_AUTO_USER_SYNC_ENABLED=false
BIOFINGER_AUTO_USER_SYNC_INTERVAL_MS=21600000
BIOFINGER_RECEIVER_DRY_RUN=false
BIOFINGER_RECEIVER_LOG_PAYLOAD=false
```

`SUPABASE_SERVICE_ROLE_KEY` tidak boleh masuk repo, tidak boleh dipakai di browser, dan hanya boleh ada di server/secret manager.

Untuk teks panduan di frontend, receiver bisa diatur lewat env Vite:

```bash
VITE_BIOFINGER_ADMS_RECEIVER_HOST=187.77.127.179
VITE_BIOFINGER_ADMS_RECEIVER_PORT=8090
```

`BIOFINGER_ALLOWED_SERIALS` tetap boleh diisi untuk serial utama/legacy. Untuk penambahan mesin baru, daftarkan serial dari UI `Biofinger > Device > Tambah Device`; receiver akan mengecek registry Supabase dan menerima serial tersebut tanpa perlu edit env VPS selama status device `active` atau `maintenance`.

## Menambah Device Baru

Flow resmi untuk mesin AT-301 tambahan:

1. Buka DMS Management App.
2. Masuk ke `Biofinger > Device`.
3. Klik `Tambah Device`.
4. Isi nama display, kode device, serial number, lokasi kerja, dan status.
5. Simpan device.
6. Setting mesin AT-301 ke receiver:
   - Server Mode: `ADMS`
   - Alamat server: `187.77.127.179`
   - Port server: `8090`
   - HTTPS: `Off`
   - Proxy: `Off`
7. Hubungkan mesin ke LAN/WiFi internet.
8. Setelah user/finger baru dibuat di mesin, lakukan 1 scan jari agar User ID dikirim ke receiver.
9. Jika `Nama di Mesin` belum terkirim, klik `Sync User Mesin` di DMS untuk meminta `USERINFO` lewat polling ADMS.
10. Klik `Refresh Data` di DMS; user baru akan muncul `pending` di tab `Mapping User`.
11. Lakukan mapping ke karyawan DMS, lalu klik `Proses Absensi` jika raw event sudah siap dikonversi.

Dengan flow ini, mesin tidak harus dicolok ke PC admin. PC admin hanya dipakai untuk troubleshooting lokal port `4370` jika ADMS/cloud push bermasalah.

## Setting Mesin AT-301

Di menu `COMM. Settings > Pengaturan Server cloud`:

- Server Mode: `ADMS`
- Aktifkan nama domain: `Off` jika isi IP, `On` jika isi domain
- Alamat server: IP/domain VPS
- Port server: port receiver, default `8090`
- HTTPS: `Off` untuk HTTP test, `On` hanya kalau reverse proxy HTTPS sudah siap
- Proxy: `Off`

Setting POC yang sedang dipakai:

- Alamat server: `187.77.127.179`
- Port server: `8090`
- HTTPS: `Off`
- Koneksi: WiFi internet

Untuk koneksi live, AT-301 wajib punya internet dari LAN atau WiFi:

- IP valid
- Gateway router internet
- DNS valid

## Endpoint Yang Didukung

Receiver mendukung pola umum ADMS/iClock:

- `GET /health`
- `GET /iclock/cdata?SN=...&options=all`
- `GET /iclock/getrequest?SN=...`
- `POST /iclock/cdata?SN=...&table=ATTLOG`
- `POST /iclock/cdata?SN=...&table=USER`
- `POST /iclock/cdata?SN=...&table=USERINFO`
- `POST /iclock/devicecmd?SN=...`

Data `ATTLOG` masuk ke `biofinger_attendance_events`.

Data `USER`/`USERINFO` membuat/memperbarui `employee_attendance_device_links` sebagai `pending` tanpa mengubah mapping aktif yang sudah dipilih admin.

Catatan praktis: beberapa firmware AT-301 tidak langsung mengirim daftar `USER` saat admin baru selesai registrasi fingerprint. Jika user baru belum muncul di DMS, lakukan scan jari sekali dari user tersebut. Receiver juga akan membuat baris `Mapping User` dari `ATTLOG`, sehingga User ID tetap bisa dimapping meski paket `USER` belum dikirim mesin.

Temuan dari AT-301 `GED7244800117`: command `DATA QUERY USERINFO` tanpa `PIN=ALL` dapat mengirim daftar user sebagai `table=OPERLOG` dengan baris `USER PIN=... Name=...`, bukan `table=USER`. Receiver DMS memproses baris `USER` dari `OPERLOG` dan mengabaikan baris template fingerprint `FP`.

## Pull User Dari Mesin

DMS menyediakan tombol `Sync User Mesin` di halaman `Biofinger`. Tombol ini membuat request agar receiver mengirim command ke mesin saat AT-301 polling endpoint:

```text
GET /iclock/getrequest?SN=...
```

Default command yang dikirim receiver:

```text
C:{id}:DATA QUERY USERINFO
```

Default ini meminta daftar user dari mesin. Jika firmware AT-301 membutuhkan format lain, ubah env receiver:

```bash
BIOFINGER_USER_SYNC_PIN=ALL
BIOFINGER_USER_SYNC_COMMAND_TEMPLATE="C:{id}:DATA QUERY USERINFO"
BIOFINGER_ADMS_COMMAND_BATCH_SIZE=3
BIOFINGER_ADMS_COMMAND_RETRY_MS=120000
BIOFINGER_AUTO_USER_SYNC_ENABLED=false
BIOFINGER_AUTO_USER_SYNC_INTERVAL_MS=21600000
```

Status command disimpan di tabel `biofinger_device_commands` jika migration `20260826000100_biofinger_user_sync_commands.sql` sudah diterapkan. Jika tabel/function belum ada, frontend memakai fallback `attendance_devices.metadata.biofinger_user_sync_request`; receiver tetap bisa membaca fallback ini agar POC tidak berhenti.

Alur status:

1. DMS membuat request `pending`.
2. Receiver mengirim command di `/iclock/getrequest`, lalu status menjadi `sent`.
3. Jika mesin mengirim `/iclock/devicecmd`, status menjadi `acknowledged` atau `failed`.
4. Jika mesin mengirim payload `USER`, status menjadi `completed` dan `external_name` pada mapping akan terisi.
5. Jika firmware tidak mendukung command, status akan retry lalu `failed` setelah batas percobaan.

Halaman Biofinger menampilkan status `User Sync`:

- `Belum diminta`: belum ada command sync user.
- `Menunggu mesin`: request sudah dibuat, menunggu AT-301 polling receiver.
- `Dikirim ke mesin`: receiver sudah mengirim command, menunggu balasan `USER`.
- `USER masuk`: mesin berhasil mengirim data user/nama, baik dari `USER`, `USERINFO`, atau `OPERLOG`.
- `Gagal` atau `Kedaluwarsa`: cek format command, firmware, dan log receiver.

`Sync User Mesin` berbeda dari `Refresh Data`:

- `Sync User Mesin`: meminta mesin mengirim data user/nama.
- `Refresh Data`: mengambil ulang data yang sudah masuk ke Supabase.

## Auto-Sync User Mesin

Receiver bisa membuat command `sync_users` otomatis saat AT-301 polling `/iclock/getrequest`, tanpa admin klik tombol `Sync User Mesin`.

Default repo tetap mati:

```bash
BIOFINGER_AUTO_USER_SYNC_ENABLED=false
BIOFINGER_AUTO_USER_SYNC_INTERVAL_MS=21600000
```

Aktifkan hanya setelah command manual `Sync User Mesin` sudah terbukti berhasil di mesin tersebut. Nilai `21600000` berarti 6 jam. Auto-sync ini hanya menarik daftar user/nama mesin; konversi raw event ke `attendance_logs` tetap dikendalikan oleh `BIOFINGER_CONVERT_ON_IMPORT` atau tombol `Proses Absensi`.

## Status Online Device

Halaman Biofinger membaca heartbeat dari kolom `attendance_devices.last_seen_at`.

- `Online`: receiver melihat polling/push mesin dalam 2 menit terakhir.
- `Idle`: receiver melihat mesin dalam 15 menit terakhir, tetapi bukan heartbeat baru.
- `Offline`: receiver belum melihat mesin lebih dari 15 menit.
- `Belum online`: device sudah terdaftar, tetapi receiver belum pernah menerima serial itu.

## Perilaku Database

Receiver melakukan:

1. Cari/auto-register device di `attendance_devices` berdasarkan serial number.
2. Buat link user mesin baru di `employee_attendance_device_links` dengan status `pending`.
3. Jika ada command pending, kirim command ke mesin melalui `/iclock/getrequest`.
4. Insert raw event ke `biofinger_attendance_events` memakai `source_hash`, sehingga event dobel diabaikan.
5. Jika User ID sudah punya mapping `active`, event baru langsung diberi `employee_id` dan `import_status = mapped`.
6. Mapping dari DMS sebaiknya lewat RPC `update_biofinger_user_mapping` agar konflik karyawan dicegah, raw event ikut diperbarui, dan Audit Log tercatat.
7. Jika `BIOFINGER_AUTO_USER_SYNC_ENABLED=true`, receiver membuat command `sync_users` berkala saat interval terakhir sudah lewat.
8. Jika `BIOFINGER_CONVERT_ON_IMPORT=true`, panggil `convert_biofinger_attendance_events` untuk membuat `attendance_logs` dari event yang sudah `mapped`. Default env tetap `false` sampai sample manual sudah valid.
9. Update `last_seen_at`, `last_sync_at`, dan `sync_cursor_at`.

Konversi memakai aturan aman:

- Check-in yang dipakai adalah event `Masuk` paling awal per karyawan per tanggal.
- Check-out yang dipakai adalah event `Pulang` paling akhir per karyawan per tanggal.
- Event duplikat ditandai `ignored` dengan catatan sistem.
- Event yang bentrok dengan attendance dari sumber lain ditandai `error`, bukan menimpa data manual/mobile.
- Setelah konversi, payroll cycle karyawan terkait di-refresh.
- Shift malam lintas tanggal masih perlu policy operasional final; rule saat ini memakai tanggal mesin dari raw event.

Manual convert juga tersedia dari DMS UI tombol `Proses Absensi` atau command:

```powershell
npm run biofinger:convert -- --management-api --ref heibhxempixiiqmalyuf --device-code BIO-AT301-001
```

## Fallback

Kalau ADMS push dari firmware AT-301 belum mengirim request ke receiver, jalur production sementara:

```text
AT-301 LAN
-> mini PC/gateway lokal
-> scripts/run-biofinger-sync.ps1 atau service pull agent
-> Supabase
```

Jalur fallback ini tetap tidak butuh PC admin utama, tetapi butuh gateway kecil yang menyala di lokasi.

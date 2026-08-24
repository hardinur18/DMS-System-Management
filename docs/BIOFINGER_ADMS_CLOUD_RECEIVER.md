# Biofinger ADMS Cloud Receiver

Dokumen ini adalah rencana target agar AT-301 bisa online tanpa PC admin.

## Target Arsitektur

Target live:

```text
AT-301 LAN/WiFi internet lokasi
-> DMS Biofinger ADMS Receiver di VPS
-> Supabase staging
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

Status POC per 2026-08-24:

- VPS Hostinger: `187.77.127.179`
- Service: `dms-biofinger-adms`
- Path: `/opt/dms-biofinger-adms`
- Env: `/etc/dms-biofinger-adms.env`
- Port publik: `8090`
- Mode: `BIOFINGER_RECEIVER_DRY_RUN=false`
- Health check: `http://187.77.127.179:8090/health`
- AT-301 push via WiFi sudah confirmed dari serial `GED7244800117`.
- Receiver live sudah menulis ke Supabase staging dan mengabaikan duplicate histori lewat `source_hash`.

Mode dry-run hanya dipakai untuk test awal. Saat mode live aktif, data tetap masuk staging Biofinger dan belum otomatis menjadi payroll final.

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
BIOFINGER_RECEIVER_DRY_RUN=false
BIOFINGER_RECEIVER_LOG_PAYLOAD=false
```

`SUPABASE_SERVICE_ROLE_KEY` tidak boleh masuk repo, tidak boleh dipakai di browser, dan hanya boleh ada di server/secret manager.

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
- `POST /iclock/devicecmd?SN=...`

Data `ATTLOG` masuk ke `biofinger_attendance_events`.

Data `USER` membuat/memperbarui `employee_attendance_device_links` sebagai `pending` tanpa mengubah mapping aktif yang sudah dipilih admin.

## Perilaku Database

Receiver melakukan:

1. Cari/auto-register device di `attendance_devices` berdasarkan serial number.
2. Buat link user mesin baru di `employee_attendance_device_links` dengan status `pending`.
3. Insert raw event ke `biofinger_attendance_events` memakai `source_hash`, sehingga event dobel diabaikan.
4. Jika User ID sudah punya mapping `active`, event baru langsung diberi `employee_id` dan `import_status = mapped`.
5. Update `last_seen_at`, `last_sync_at`, dan `sync_cursor_at`.

Receiver tidak langsung membuat payroll final. Konversi ke `attendance_logs` tetap tahap berikutnya setelah mapping dan aturan punch valid.

## Fallback

Kalau ADMS push dari firmware AT-301 belum mengirim request ke receiver, jalur production sementara:

```text
AT-301 LAN
-> mini PC/gateway lokal
-> scripts/run-biofinger-sync.ps1 atau service pull agent
-> Supabase
```

Jalur fallback ini tetap tidak butuh PC admin utama, tetapi butuh gateway kecil yang menyala di lokasi.

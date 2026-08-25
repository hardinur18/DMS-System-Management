import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const DEFAULT_DEVICE_CODE = "BIO-AT301-001";
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_API_DELAY_MS = 250;
const DEFAULT_API_RETRIES = 5;
const DEFAULT_CONVERT_LIMIT = 1000;
const SUPABASE_MANAGEMENT_API_BASE_URL = "https://api.supabase.com/v1";

function parseArgs(argv) {
  const args = {
    deviceCode: DEFAULT_DEVICE_CODE,
    eventsPath: null,
    usersPath: null,
    chunkSize: DEFAULT_CHUNK_SIZE,
    dryRun: false,
    convert: false,
    convertLimit: DEFAULT_CONVERT_LIMIT,
    managementApi: false,
    ref: process.env.SUPABASE_PROJECT_REF || "",
    apiDelayMs: DEFAULT_API_DELAY_MS,
    apiRetries: DEFAULT_API_RETRIES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--device-code") {
      args.deviceCode = next();
    } else if (arg === "--events") {
      args.eventsPath = next();
    } else if (arg === "--users") {
      args.usersPath = next();
    } else if (arg === "--chunk-size") {
      args.chunkSize = Number(next());
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--convert") {
      args.convert = true;
    } else if (arg === "--convert-limit") {
      args.convertLimit = Number(next());
    } else if (arg === "--management-api") {
      args.managementApi = true;
    } else if (arg === "--ref") {
      args.ref = next();
    } else if (arg === "--api-delay-ms") {
      args.apiDelayMs = Number(next());
    } else if (arg === "--api-retries") {
      args.apiRetries = Number(next());
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.eventsPath && !args.usersPath) {
    throw new Error("Provide --events and/or --users JSONL path.");
  }
  if (!Number.isInteger(args.chunkSize) || args.chunkSize < 1 || args.chunkSize > 1000) {
    throw new Error("--chunk-size must be an integer from 1 to 1000.");
  }
  if (!Number.isInteger(args.apiDelayMs) || args.apiDelayMs < 0 || args.apiDelayMs > 5000) {
    throw new Error("--api-delay-ms must be an integer from 0 to 5000.");
  }
  if (!Number.isInteger(args.apiRetries) || args.apiRetries < 0 || args.apiRetries > 10) {
    throw new Error("--api-retries must be an integer from 0 to 10.");
  }
  if (!Number.isInteger(args.convertLimit) || args.convertLimit < 1 || args.convertLimit > 5000) {
    throw new Error("--convert-limit must be an integer from 1 to 5000.");
  }
  if (args.managementApi && !args.ref) {
    throw new Error("Set SUPABASE_PROJECT_REF or pass --ref <project-ref> for --management-api.");
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/import-biofinger-jsonl.mjs --events exports\\at301.biofinger.jsonl
  node scripts/import-biofinger-jsonl.mjs --users exports\\at301-users.biofinger.jsonl
  node scripts/import-biofinger-jsonl.mjs --users exports\\at301-users.biofinger.jsonl --events exports\\at301.biofinger.jsonl --dry-run
  node scripts/import-biofinger-jsonl.mjs --management-api --ref heibhxempixiiqmalyuf --users exports\\at301-users.biofinger.jsonl --events exports\\at301.biofinger.jsonl --dry-run

Direct database env:
  DATABASE_URL=postgresql://...

Supabase Management API env:
  SUPABASE_ACCESS_TOKEN=sbp_...
  SUPABASE_PROJECT_REF=heibhxempixiiqmalyuf

Options:
  --device-code      Attendance device code. Default: ${DEFAULT_DEVICE_CODE}
  --events           JSONL file from scripts/biofinger_sync.py --output
  --users            JSONL file from scripts/biofinger_sync.py --users-output
  --chunk-size       Batch size, 1-1000. Default: ${DEFAULT_CHUNK_SIZE}
  --dry-run          Direct DB: rollback transaction. Management API: read-only count check.
  --convert          Convert mapped staging events to attendance_logs after import.
  --convert-limit    Max mapped events converted per run, 1-5000. Default: ${DEFAULT_CONVERT_LIMIT}
  --management-api   Use Supabase Management API instead of DATABASE_URL.
  --ref              Supabase project ref for --management-api.
  --api-delay-ms     Delay between Management API chunks. Default: ${DEFAULT_API_DELAY_MS}
  --api-retries      Retry count for Management API network/429/5xx failures. Default: ${DEFAULT_API_RETRIES}`);
}

async function readJsonl(path) {
  if (!path) {
    return [];
  }

  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON at ${path}:${index + 1} - ${error.message}`);
      }
    });
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeEventType(value) {
  if (value === "check_in" || value === "check_out") {
    return value;
  }
  return "unknown";
}

function buildSourceHash(event) {
  const hashInput = [
    event.device_serial_number || "",
    String(event.external_user_id || ""),
    String(event.device_event_at || ""),
    event.status_code ?? "",
    event.punch ?? "",
  ].join("|");
  return crypto.createHash("sha256").update(hashInput).digest("hex");
}

function extractSerialNumber(events, users) {
  return (
    events.find((event) => event.device_serial_number)?.device_serial_number ||
    users.find((user) => user.device_serial_number)?.device_serial_number ||
    null
  );
}

function prepareUserRecord(user, index) {
  const externalUserId = String(user.user_id ?? "").trim();
  if (!externalUserId) {
    throw new Error(`Missing user_id at users row ${index + 1}.`);
  }

  const externalName = user.name || null;
  return {
    external_user_id: externalUserId,
    external_uid: toNullableInteger(user.uid),
    external_name: externalName,
    privilege: toNullableInteger(user.privilege),
    metadata: {
      group_id: user.group_id ?? null,
      card: user.card ?? null,
      device_serial_number: user.device_serial_number ?? null,
      imported_from: "biofinger_sync.py",
    },
    notes: externalName ? `Imported from Biofinger user "${externalName}".` : "Imported from Biofinger user list.",
  };
}

function prepareEventRecord(event, index) {
  const deviceEventAt = event.device_event_at;
  if (!deviceEventAt) {
    throw new Error(`Missing device_event_at at events row ${index + 1}.`);
  }

  const externalUserId = String(event.external_user_id ?? event.user_id ?? "").trim();
  if (!externalUserId) {
    throw new Error(`Missing external_user_id at events row ${index + 1}.`);
  }

  const normalized = {
    device_serial_number: event.device_serial_number || null,
    external_user_id: externalUserId,
    device_event_at: deviceEventAt,
    attendance_date: event.attendance_date || String(deviceEventAt).slice(0, 10),
    punch: toNullableInteger(event.punch),
    status_code: toNullableInteger(event.status_code),
    normalized_event_type: normalizeEventType(event.normalized_event_type),
    raw_payload: event.raw_payload || event,
  };

  return {
    ...normalized,
    source_hash: event.source_hash || buildSourceHash(normalized),
  };
}

function prepareImportPayload(events, users) {
  const preparedUsers = users.map(prepareUserRecord);
  const eventMap = new Map();

  events.forEach((event, index) => {
    const preparedEvent = prepareEventRecord(event, index);
    if (!eventMap.has(preparedEvent.source_hash)) {
      eventMap.set(preparedEvent.source_hash, preparedEvent);
    }
  });

  return {
    users: preparedUsers,
    events: [...eventMap.values()],
    eventDuplicatesDropped: events.length - eventMap.size,
  };
}

function resultRows(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (!result) {
    return [];
  }
  return [result];
}

function firstResultRow(result) {
  return resultRows(result)[0] || null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function runManagementQuery({ ref, token, query, parameters = [], readOnly = false, label = "query" }) {
  const maxAttempts = Number(process.env.SUPABASE_MANAGEMENT_API_RETRIES || DEFAULT_API_RETRIES) + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetch(`${SUPABASE_MANAGEMENT_API_BASE_URL}/projects/${ref}/database/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          parameters,
          read_only: readOnly,
        }),
      });
    } catch (error) {
      lastError = new Error(`${label} request failed: ${error.cause?.message || error.message}`);
      if (attempt < maxAttempts) {
        await sleep(Math.min(1000 * attempt, 5000));
        continue;
      }
      throw lastError;
    }

    const bodyText = await response.text();
    if (response.ok) {
      return bodyText ? JSON.parse(bodyText) : null;
    }

    const retryable = response.status === 429 || response.status >= 500;
    lastError = new Error(`${label} failed (${response.status}): ${bodyText || query.slice(0, 240)}`);
    if (!retryable || attempt >= maxAttempts) {
      throw lastError;
    }
    await sleep(Math.min(1000 * attempt, 5000));
  }

  throw lastError || new Error(`${label} failed.`);
}

async function findDevice(client, deviceCode, events, users) {
  const serialNumber = extractSerialNumber(events, users);

  const result = await client.query(
    `
      select id, device_code, serial_number
      from public.attendance_devices
      where device_code = $1
         or ($2::text is not null and serial_number = $2)
      order by case when device_code = $1 then 0 else 1 end
      limit 1
    `,
    [deviceCode, serialNumber],
  );

  if (result.rowCount === 0) {
    throw new Error(
      `Device ${deviceCode}${serialNumber ? ` / ${serialNumber}` : ""} belum ada. Apply migration Biofinger dulu.`,
    );
  }

  return result.rows[0];
}

async function findDeviceViaManagementApi({ ref, token, deviceCode, events, users }) {
  const serialNumber = extractSerialNumber(events, users);

  const result = await runManagementQuery({
    ref,
    token,
    readOnly: true,
    label: "find Biofinger device",
    query: `
      select id, device_code, serial_number
      from public.attendance_devices
      where device_code = $1
         or ($2::text is not null and serial_number = $2)
      order by case when device_code = $1 then 0 else 1 end
      limit 1
    `,
    parameters: [deviceCode, serialNumber],
  });
  const device = firstResultRow(result);

  if (!device) {
    throw new Error(
      `Device ${deviceCode}${serialNumber ? ` / ${serialNumber}` : ""} belum ada. Apply migration Biofinger dulu.`,
    );
  }

  return device;
}

async function importUsers(client, deviceId, users, chunkSize) {
  let upserted = 0;

  for (const batch of chunk(users, chunkSize)) {
    const values = [];
    const params = [];

    batch.forEach((user, index) => {
      const base = index * 7;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'pending', 'import', now(), $${base + 6}::jsonb, $${base + 7})`,
      );
      params.push(
        deviceId,
        String(user.user_id || ""),
        toNullableInteger(user.uid),
        user.name || null,
        toNullableInteger(user.privilege),
        JSON.stringify({
          group_id: user.group_id ?? null,
          card: user.card ?? null,
          imported_from: "biofinger_sync.py",
        }),
        user.name ? `Imported from Biofinger user "${user.name}".` : "Imported from Biofinger user list.",
      );
    });

    const result = await client.query(
      `
        insert into public.employee_attendance_device_links (
          attendance_device_id,
          external_user_id,
          external_uid,
          external_name,
          privilege,
          status,
          matched_by,
          last_synced_at,
          metadata,
          notes
        )
        values ${values.join(",\n")}
        on conflict (attendance_device_id, external_user_id) do update set
          external_uid = excluded.external_uid,
          external_name = excluded.external_name,
          privilege = excluded.privilege,
          last_synced_at = now(),
          metadata = public.employee_attendance_device_links.metadata || excluded.metadata,
          status = case
            when public.employee_attendance_device_links.status in ('active', 'ignored', 'inactive')
              then public.employee_attendance_device_links.status
            else 'pending'
          end,
          matched_by = case
            when public.employee_attendance_device_links.matched_by = 'manual'
              then public.employee_attendance_device_links.matched_by
            else 'import'
          end,
          updated_at = now()
        returning id
      `,
      params,
    );

    upserted += result.rowCount;
  }

  return upserted;
}

async function dryRunUsersViaManagementApi({ ref, token, deviceId, users, chunkSize, apiDelayMs }) {
  let wouldInsert = 0;
  let wouldUpdate = 0;

  const batches = chunk(users, chunkSize);
  for (const [batchIndex, batch] of batches.entries()) {
    const result = await runManagementQuery({
      ref,
      token,
      readOnly: true,
      label: `dry-run users batch ${batchIndex + 1}/${batches.length}`,
      query: `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as x(
            external_user_id text,
            external_uid integer,
            external_name text,
            privilege integer,
            metadata jsonb,
            notes text
          )
        )
        select
          count(*) filter (where existing.id is null)::int as would_insert,
          count(*) filter (where existing.id is not null)::int as would_update
        from input
        left join public.employee_attendance_device_links as existing
          on existing.attendance_device_id = $2::uuid
         and existing.external_user_id = input.external_user_id
      `,
      parameters: [JSON.stringify(batch), deviceId],
    });
    const row = firstResultRow(result);
    wouldInsert += toNumber(row?.would_insert);
    wouldUpdate += toNumber(row?.would_update);

    if (apiDelayMs > 0 && batchIndex < batches.length - 1) {
      await sleep(apiDelayMs);
    }
  }

  return { wouldInsert, wouldUpdate };
}

async function importUsersViaManagementApi({ ref, token, deviceId, users, chunkSize, apiDelayMs }) {
  let upserted = 0;
  const batches = chunk(users, chunkSize);

  for (const [batchIndex, batch] of batches.entries()) {
    const result = await runManagementQuery({
      ref,
      token,
      label: `import users batch ${batchIndex + 1}/${batches.length}`,
      query: `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as x(
            external_user_id text,
            external_uid integer,
            external_name text,
            privilege integer,
            metadata jsonb,
            notes text
          )
        ),
        upserted as (
          insert into public.employee_attendance_device_links (
            attendance_device_id,
            external_user_id,
            external_uid,
            external_name,
            privilege,
            status,
            matched_by,
            last_synced_at,
            metadata,
            notes
          )
          select
            $2::uuid,
            input.external_user_id,
            input.external_uid,
            input.external_name,
            input.privilege,
            'pending',
            'import',
            now(),
            coalesce(input.metadata, '{}'::jsonb),
            input.notes
          from input
          on conflict (attendance_device_id, external_user_id) do update set
            external_uid = excluded.external_uid,
            external_name = excluded.external_name,
            privilege = excluded.privilege,
            last_synced_at = now(),
            metadata = public.employee_attendance_device_links.metadata || excluded.metadata,
            status = case
              when public.employee_attendance_device_links.status in ('active', 'ignored', 'inactive')
                then public.employee_attendance_device_links.status
              else 'pending'
            end,
            matched_by = case
              when public.employee_attendance_device_links.matched_by = 'manual'
                then public.employee_attendance_device_links.matched_by
              else 'import'
            end,
            updated_at = now()
          returning id
        )
        select count(*)::int as affected
        from upserted
      `,
      parameters: [JSON.stringify(batch), deviceId],
    });
    const row = firstResultRow(result);
    upserted += toNumber(row?.affected);

    if (apiDelayMs > 0 && batchIndex < batches.length - 1) {
      await sleep(apiDelayMs);
    }
  }

  return upserted;
}

async function importEvents(client, deviceId, events, chunkSize) {
  let upserted = 0;
  let maxEventAt = null;

  for (const batch of chunk(events, chunkSize)) {
    const values = [];
    const params = [];

    batch.forEach((event, index) => {
      const base = index * 10;
      const deviceEventAt = event.device_event_at;
      const sourceHash = event.source_hash || buildSourceHash(event);
      const rawPayload = event.raw_payload || event;

      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::timestamptz, $${base + 5}::date, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}::jsonb)`,
      );
      params.push(
        deviceId,
        event.device_serial_number || null,
        String(event.external_user_id || ""),
        deviceEventAt,
        event.attendance_date || String(deviceEventAt).slice(0, 10),
        toNullableInteger(event.punch),
        toNullableInteger(event.status_code),
        normalizeEventType(event.normalized_event_type),
        sourceHash,
        JSON.stringify(rawPayload),
      );

      const parsedEventAt = new Date(deviceEventAt);
      if (!Number.isNaN(parsedEventAt.valueOf()) && (!maxEventAt || parsedEventAt > maxEventAt)) {
        maxEventAt = parsedEventAt;
      }
    });

    const result = await client.query(
      `
        insert into public.biofinger_attendance_events (
          attendance_device_id,
          device_serial_number,
          external_user_id,
          device_event_at,
          attendance_date,
          punch,
          status_code,
          normalized_event_type,
          source_hash,
          raw_payload
        )
        values ${values.join(",\n")}
        on conflict (source_hash) do update set
          raw_payload = excluded.raw_payload,
          punch = excluded.punch,
          status_code = excluded.status_code,
          normalized_event_type = excluded.normalized_event_type,
          updated_at = now()
        returning id
      `,
      params,
    );

    upserted += result.rowCount;
  }

  const mappedResult = await client.query(
    `
      update public.biofinger_attendance_events as event
      set employee_id = link.employee_id,
          import_status = 'mapped',
          updated_at = now()
      from public.employee_attendance_device_links as link
      where event.attendance_device_id = link.attendance_device_id
        and event.external_user_id = link.external_user_id
        and link.status = 'active'
        and link.employee_id is not null
        and event.attendance_device_id = $1
        and event.import_status in ('pending', 'mapped')
        and event.employee_id is distinct from link.employee_id
      returning event.id
    `,
    [deviceId],
  );

  if (maxEventAt) {
    await client.query(
      `
        update public.attendance_devices
        set last_sync_at = now(),
            sync_cursor_at = greatest(coalesce(sync_cursor_at, '-infinity'::timestamptz), $2::timestamptz),
            updated_at = now()
        where id = $1
      `,
      [deviceId, maxEventAt.toISOString()],
    );
  }

  return {
    upserted,
    mapped: mappedResult.rowCount,
    maxEventAt: maxEventAt?.toISOString() || null,
  };
}

async function dryRunEventsViaManagementApi({ ref, token, deviceId, events, chunkSize, apiDelayMs }) {
  let wouldInsert = 0;
  let wouldUpdate = 0;
  let maxEventAt = null;

  const batches = chunk(events, chunkSize);
  for (const [batchIndex, batch] of batches.entries()) {
    const dryRunBatch = batch.map(({ raw_payload: _rawPayload, ...event }) => event);
    const result = await runManagementQuery({
      ref,
      token,
      readOnly: true,
      label: `dry-run events batch ${batchIndex + 1}/${batches.length}`,
      query: `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as x(
            source_hash text,
            device_serial_number text,
            external_user_id text,
            device_event_at timestamptz,
            attendance_date date,
            punch integer,
            status_code integer,
            normalized_event_type text,
            raw_payload jsonb
          )
        )
        select
          count(*) filter (where existing.id is null)::int as would_insert,
          count(*) filter (where existing.id is not null)::int as would_update,
          max(input.device_event_at)::text as max_event_at
        from input
        left join public.biofinger_attendance_events as existing
          on existing.source_hash = input.source_hash
        where input.external_user_id is not null
          and input.external_user_id <> ''
          and $2::uuid is not null
      `,
      parameters: [JSON.stringify(dryRunBatch), deviceId],
    });
    const row = firstResultRow(result);
    wouldInsert += toNumber(row?.would_insert);
    wouldUpdate += toNumber(row?.would_update);

    const parsedEventAt = row?.max_event_at ? new Date(row.max_event_at) : null;
    if (parsedEventAt && !Number.isNaN(parsedEventAt.valueOf()) && (!maxEventAt || parsedEventAt > maxEventAt)) {
      maxEventAt = parsedEventAt;
    }

    if ((batchIndex + 1) % 10 === 0 || batchIndex === batches.length - 1) {
      console.log(`events dry-run ${batchIndex + 1}/${batches.length}`);
    }

    if (apiDelayMs > 0 && batchIndex < batches.length - 1) {
      await sleep(apiDelayMs);
    }
  }

  return {
    wouldInsert,
    wouldUpdate,
    maxEventAt: maxEventAt?.toISOString() || null,
  };
}

async function importEventsViaManagementApi({ ref, token, deviceId, events, chunkSize, apiDelayMs }) {
  let upserted = 0;
  let maxEventAt = null;
  const batches = chunk(events, chunkSize);

  for (const [batchIndex, batch] of batches.entries()) {
    const result = await runManagementQuery({
      ref,
      token,
      label: `import events batch ${batchIndex + 1}/${batches.length}`,
      query: `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as x(
            source_hash text,
            device_serial_number text,
            external_user_id text,
            device_event_at timestamptz,
            attendance_date date,
            punch integer,
            status_code integer,
            normalized_event_type text,
            raw_payload jsonb
          )
        ),
        upserted as (
          insert into public.biofinger_attendance_events (
            attendance_device_id,
            device_serial_number,
            external_user_id,
            device_event_at,
            attendance_date,
            punch,
            status_code,
            normalized_event_type,
            source_hash,
            raw_payload
          )
          select
            $2::uuid,
            input.device_serial_number,
            input.external_user_id,
            input.device_event_at,
            input.attendance_date,
            input.punch,
            input.status_code,
            input.normalized_event_type,
            input.source_hash,
            coalesce(input.raw_payload, '{}'::jsonb)
          from input
          where input.external_user_id is not null
            and input.external_user_id <> ''
          on conflict (source_hash) do update set
            raw_payload = excluded.raw_payload,
            punch = excluded.punch,
            status_code = excluded.status_code,
            normalized_event_type = excluded.normalized_event_type,
            updated_at = now()
          returning id, device_event_at
        )
        select
          count(*)::int as affected,
          max(device_event_at)::text as max_event_at
        from upserted
      `,
      parameters: [JSON.stringify(batch), deviceId],
    });
    const row = firstResultRow(result);
    upserted += toNumber(row?.affected);

    const parsedEventAt = row?.max_event_at ? new Date(row.max_event_at) : null;
    if (parsedEventAt && !Number.isNaN(parsedEventAt.valueOf()) && (!maxEventAt || parsedEventAt > maxEventAt)) {
      maxEventAt = parsedEventAt;
    }

    if ((batchIndex + 1) % 10 === 0 || batchIndex === batches.length - 1) {
      console.log(`events import ${batchIndex + 1}/${batches.length}`);
    }

    if (apiDelayMs > 0 && batchIndex < batches.length - 1) {
      await sleep(apiDelayMs);
    }
  }

  const mappedResult = await runManagementQuery({
    ref,
    token,
    label: "map imported Biofinger events",
    query: `
      with mapped as (
        update public.biofinger_attendance_events as event
        set employee_id = link.employee_id,
            import_status = 'mapped',
            updated_at = now()
        from public.employee_attendance_device_links as link
        where event.attendance_device_id = link.attendance_device_id
          and event.external_user_id = link.external_user_id
          and link.status = 'active'
          and link.employee_id is not null
          and event.attendance_device_id = $1::uuid
          and event.import_status in ('pending', 'mapped')
          and event.employee_id is distinct from link.employee_id
        returning event.id
      )
      select count(*)::int as mapped
      from mapped
    `,
    parameters: [deviceId],
  });
  const mapped = toNumber(firstResultRow(mappedResult)?.mapped);

  if (maxEventAt) {
    await runManagementQuery({
      ref,
      token,
      label: "update Biofinger device sync cursor",
      query: `
        update public.attendance_devices
        set last_sync_at = now(),
            sync_cursor_at = greatest(coalesce(sync_cursor_at, '-infinity'::timestamptz), $2::timestamptz),
            updated_at = now()
        where id = $1::uuid
      `,
      parameters: [deviceId, maxEventAt.toISOString()],
    });
  }

  return {
    upserted,
    mapped,
    maxEventAt: maxEventAt?.toISOString() || null,
  };
}

async function convertEventsViaManagementApi({ ref, token, deviceId, limit }) {
  const result = await runManagementQuery({
    ref,
    token,
    label: "convert Biofinger staging events",
    query: `
      select *
      from public.convert_biofinger_attendance_events($1::uuid, $2::integer)
    `,
    parameters: [deviceId, limit],
  });

  return firstResultRow(result) || null;
}

async function convertEventsDirectDatabase(client, deviceId, limit) {
  const result = await client.query(
    `
      select *
      from public.convert_biofinger_attendance_events($1::uuid, $2::integer)
    `,
    [deviceId, limit],
  );

  return result.rows[0] || null;
}

async function runManagementApiImport(args, events, users) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Set SUPABASE_ACCESS_TOKEN for --management-api.");
  }
  process.env.SUPABASE_MANAGEMENT_API_RETRIES = String(args.apiRetries);

  const payload = prepareImportPayload(events, users);
  const device = await findDeviceViaManagementApi({
    ref: args.ref,
    token,
    deviceCode: args.deviceCode,
    events,
    users,
  });

  const usersResult = payload.users.length > 0
    ? args.dryRun
      ? await dryRunUsersViaManagementApi({
        ref: args.ref,
        token,
        deviceId: device.id,
        users: payload.users,
        chunkSize: args.chunkSize,
        apiDelayMs: args.apiDelayMs,
      })
      : { upserted: await importUsersViaManagementApi({
        ref: args.ref,
        token,
        deviceId: device.id,
        users: payload.users,
        chunkSize: args.chunkSize,
        apiDelayMs: args.apiDelayMs,
      }) }
    : args.dryRun
      ? { wouldInsert: 0, wouldUpdate: 0 }
      : { upserted: 0 };

  const eventResult = payload.events.length > 0
    ? args.dryRun
      ? await dryRunEventsViaManagementApi({
        ref: args.ref,
        token,
        deviceId: device.id,
        events: payload.events,
        chunkSize: args.chunkSize,
        apiDelayMs: args.apiDelayMs,
      })
      : await importEventsViaManagementApi({
        ref: args.ref,
        token,
        deviceId: device.id,
        events: payload.events,
        chunkSize: args.chunkSize,
        apiDelayMs: args.apiDelayMs,
      })
    : args.dryRun
      ? { wouldInsert: 0, wouldUpdate: 0, maxEventAt: null }
      : { upserted: 0, mapped: 0, maxEventAt: null };
  const conversionResult = args.convert && !args.dryRun
    ? await convertEventsViaManagementApi({
      ref: args.ref,
      token,
      deviceId: device.id,
      limit: args.convertLimit,
    })
    : null;

  console.log(JSON.stringify({
    mode: "management_api",
    dry_run: args.dryRun,
    device,
    users_read: users.length,
    users_prepared: payload.users.length,
    users_would_insert: usersResult.wouldInsert,
    users_would_update: usersResult.wouldUpdate,
    users_upserted: usersResult.upserted,
    events_read: events.length,
    events_prepared: payload.events.length,
    events_duplicates_dropped: payload.eventDuplicatesDropped,
    events_would_insert: eventResult.wouldInsert,
    events_would_update: eventResult.wouldUpdate,
    events_upserted: eventResult.upserted,
    events_mapped: eventResult.mapped,
    conversion: conversionResult,
    max_event_at: eventResult.maxEventAt,
  }, null, 2));
}

async function runDirectDatabaseImport(args, events, users) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL belum diset.");
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("begin");
    const device = await findDevice(client, args.deviceCode, events, users);
    const usersUpserted = users.length > 0 ? await importUsers(client, device.id, users, args.chunkSize) : 0;
    const eventResult = events.length > 0
      ? await importEvents(client, device.id, events, args.chunkSize)
      : { upserted: 0, mapped: 0, maxEventAt: null };
    const conversionResult = args.convert
      ? await convertEventsDirectDatabase(client, device.id, args.convertLimit)
      : null;

    if (args.dryRun) {
      await client.query("rollback");
    } else {
      await client.query("commit");
    }

    console.log(JSON.stringify({
      mode: "direct_database",
      dry_run: args.dryRun,
      device,
      users_read: users.length,
      users_upserted: usersUpserted,
      events_read: events.length,
      events_upserted: eventResult.upserted,
      events_mapped: eventResult.mapped,
      conversion: conversionResult,
      max_event_at: eventResult.maxEventAt,
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [events, users] = await Promise.all([readJsonl(args.eventsPath), readJsonl(args.usersPath)]);

  if (args.managementApi) {
    await runManagementApiImport(args, events, users);
  } else {
    await runDirectDatabaseImport(args, events, users);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

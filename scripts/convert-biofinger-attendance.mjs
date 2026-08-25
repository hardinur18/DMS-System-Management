#!/usr/bin/env node
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const DEFAULT_LIMIT = 1000;
const SUPABASE_MANAGEMENT_API_BASE_URL = "https://api.supabase.com/v1";

function parseArgs(argv) {
  const args = {
    deviceCode: "",
    serialNumber: "",
    deviceId: "",
    limit: DEFAULT_LIMIT,
    dryRun: false,
    managementApi: false,
    ref: process.env.SUPABASE_PROJECT_REF || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--device-code") {
      args.deviceCode = next();
    } else if (arg === "--serial-number") {
      args.serialNumber = next();
    } else if (arg === "--device-id") {
      args.deviceId = next();
    } else if (arg === "--limit") {
      args.limit = Number(next());
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--management-api") {
      args.managementApi = true;
    } else if (arg === "--ref") {
      args.ref = next();
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 5000) {
    throw new Error("--limit must be an integer from 1 to 5000.");
  }
  if (args.managementApi && !args.ref) {
    throw new Error("Set SUPABASE_PROJECT_REF or pass --ref <project-ref> for --management-api.");
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/convert-biofinger-attendance.mjs
  node scripts/convert-biofinger-attendance.mjs --device-code BIO-AT301-001 --limit 1000
  node scripts/convert-biofinger-attendance.mjs --management-api --ref heibhxempixiiqmalyuf --device-code BIO-AT301-001

Direct database env:
  DATABASE_URL=postgresql://...

Supabase Management API env:
  SUPABASE_ACCESS_TOKEN=sbp_...
  SUPABASE_PROJECT_REF=heibhxempixiiqmalyuf

Options:
  --device-code      Convert one attendance_devices.device_code.
  --serial-number    Convert one attendance_devices.serial_number.
  --device-id        Convert one attendance_devices.id.
  --limit            Max mapped events converted per run, 1-5000. Default: ${DEFAULT_LIMIT}
  --dry-run          Direct DB only: rollback transaction after conversion.
  --management-api   Use Supabase Management API instead of DATABASE_URL.
  --ref              Supabase project ref for --management-api.`);
}

function firstRow(result) {
  if (Array.isArray(result)) return result[0] || null;
  return result || null;
}

async function runManagementQuery({ ref, token, query, parameters = [], label = "query" }) {
  const response = await fetch(`${SUPABASE_MANAGEMENT_API_BASE_URL}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, parameters, read_only: false }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${bodyText || query.slice(0, 240)}`);
  }

  return bodyText ? JSON.parse(bodyText) : null;
}

async function resolveDeviceIdDirect(client, args) {
  if (args.deviceId) return args.deviceId;
  if (!args.deviceCode && !args.serialNumber) return null;

  const result = await client.query(
    `
      select id
      from public.attendance_devices
      where ($1::text <> '' and device_code = $1)
         or ($2::text <> '' and serial_number = $2)
      order by updated_at desc
      limit 1
    `,
    [args.deviceCode, args.serialNumber],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Device tidak ditemukan di attendance_devices.");
  return row.id;
}

async function resolveDeviceIdManagementApi({ ref, token, args }) {
  if (args.deviceId) return args.deviceId;
  if (!args.deviceCode && !args.serialNumber) return null;

  const result = await runManagementQuery({
    ref,
    token,
    label: "resolve Biofinger device",
    query: `
      select id
      from public.attendance_devices
      where ($1::text <> '' and device_code = $1)
         or ($2::text <> '' and serial_number = $2)
      order by updated_at desc
      limit 1
    `,
    parameters: [args.deviceCode, args.serialNumber],
  });

  const row = firstRow(result);
  if (!row) throw new Error("Device tidak ditemukan di attendance_devices.");
  return row.id;
}

async function runDirectDatabase(args) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL belum diset.");

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("begin");
    const deviceId = await resolveDeviceIdDirect(client, args);
    const result = await client.query(
      `
        select *
        from public.convert_biofinger_attendance_events($1::uuid, $2::integer)
      `,
      [deviceId, args.limit],
    );

    if (args.dryRun) {
      await client.query("rollback");
    } else {
      await client.query("commit");
    }

    console.log(JSON.stringify({
      mode: "direct_database",
      dry_run: args.dryRun,
      device_id: deviceId,
      conversion: result.rows[0] || null,
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function runManagementApi(args) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Set SUPABASE_ACCESS_TOKEN for --management-api.");
  if (args.dryRun) throw new Error("--dry-run hanya tersedia untuk direct DATABASE_URL.");

  const deviceId = await resolveDeviceIdManagementApi({ ref: args.ref, token, args });
  const result = await runManagementQuery({
    ref: args.ref,
    token,
    label: "convert Biofinger attendance events",
    query: `
      select *
      from public.convert_biofinger_attendance_events($1::uuid, $2::integer)
    `,
    parameters: [deviceId, args.limit],
  });

  console.log(JSON.stringify({
    mode: "management_api",
    dry_run: false,
    device_id: deviceId,
    conversion: firstRow(result),
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.managementApi) {
    await runManagementApi(args);
  } else {
    await runDirectDatabase(args);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

#!/usr/bin/env node
import { createHash } from "node:crypto";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_PORT = 8090;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_TIMEZONE_OFFSET = "+07:00";
const DEFAULT_DEVICE_PORT = 4370;
const DEFAULT_COMMAND_RESPONSE = "OK\n";
const REGISTRY_ALLOWLIST_CACHE_MS = 60_000;
const DEFAULT_CONVERSION_BATCH_SIZE = 1000;
const DEFAULT_COMMAND_BATCH_SIZE = 3;
const DEFAULT_COMMAND_RETRY_MS = 120_000;
const DEFAULT_USER_SYNC_PIN = "ALL";
const DEFAULT_USER_SYNC_COMMAND_TEMPLATE = "C:{id}:DATA QUERY USERINFO";
const DEFAULT_AUTO_USER_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RECEIVER_VERSION = "2026-08-26-auto-user-sync-v2";

const env = process.env;

const config = {
  host: env.BIOFINGER_ADMS_HOST || DEFAULT_HOST,
  port: toInteger(env.BIOFINGER_ADMS_PORT || env.PORT, DEFAULT_PORT),
  timezoneOffset: env.BIOFINGER_TIMEZONE_OFFSET || DEFAULT_TIMEZONE_OFFSET,
  deviceCode: env.BIOFINGER_DEVICE_CODE || "",
  deviceCodePrefix: env.BIOFINGER_DEVICE_CODE_PREFIX || "BIO-AT301",
  deviceName: env.BIOFINGER_DEVICE_NAME || "Biofinger AT-301",
  deviceModel: env.BIOFINGER_DEVICE_MODEL || "AT-301",
  allowedSerials: parseCsv(env.BIOFINGER_ALLOWED_SERIALS),
  allowedRemoteIps: parseCsv(env.BIOFINGER_ALLOWED_REMOTE_IPS),
  receiverToken: env.BIOFINGER_RECEIVER_TOKEN || "",
  convertOnImport: ["1", "true", "yes", "on"].includes(String(env.BIOFINGER_CONVERT_ON_IMPORT || "false").trim().toLowerCase()),
  conversionBatchSize: toInteger(env.BIOFINGER_CONVERSION_BATCH_SIZE, DEFAULT_CONVERSION_BATCH_SIZE),
  commandBatchSize: toInteger(env.BIOFINGER_ADMS_COMMAND_BATCH_SIZE, DEFAULT_COMMAND_BATCH_SIZE),
  commandRetryMs: toInteger(env.BIOFINGER_ADMS_COMMAND_RETRY_MS, DEFAULT_COMMAND_RETRY_MS),
  userSyncPin: env.BIOFINGER_USER_SYNC_PIN || DEFAULT_USER_SYNC_PIN,
  userSyncCommandTemplate: env.BIOFINGER_USER_SYNC_COMMAND_TEMPLATE || DEFAULT_USER_SYNC_COMMAND_TEMPLATE,
  autoUserSync: parseBoolean(env.BIOFINGER_AUTO_USER_SYNC_ENABLED),
  autoUserSyncIntervalMs: toInteger(env.BIOFINGER_AUTO_USER_SYNC_INTERVAL_MS, DEFAULT_AUTO_USER_SYNC_INTERVAL_MS),
  dryRun: parseBoolean(env.BIOFINGER_RECEIVER_DRY_RUN),
  logPayload: parseBoolean(env.BIOFINGER_RECEIVER_LOG_PAYLOAD),
  supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || "",
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
};

const supabase = config.dryRun
  ? null
  : createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey);

const requestLogPrefix = () => new Date().toISOString();
const registrySerialCache = new Map();
let commandQueueTableAvailable = true;
let commandQueueMissingLogged = false;

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function toInteger(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createSupabaseClient(supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY untuk menjalankan receiver non-dry-run.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function jsonResponse(response, body, status = 200) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    Connection: "close",
  });
  response.end(payload);
}

function textResponse(response, body = DEFAULT_COMMAND_RESPONSE, status = 200) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    Connection: "close",
  });
  response.end(body);
}

function getRemoteIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || request.socket.remoteAddress || "";
  return normalizeIp(String(raw).split(",")[0].trim());
}

function normalizeIp(value) {
  if (value.startsWith("::ffff:")) return value.slice(7);
  if (value === "::1") return "127.0.0.1";
  return value;
}

function getRequestUrl(request) {
  return new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
}

function getSerialFromUrl(url) {
  return (
    url.searchParams.get("SN")
    || url.searchParams.get("sn")
    || url.searchParams.get("device_sn")
    || url.searchParams.get("serial")
    || ""
  ).trim();
}

async function isSerialAllowedByRegistry(serialNumber) {
  if (!serialNumber || config.dryRun || !supabase) return false;

  const cached = registrySerialCache.get(serialNumber);
  const now = Date.now();
  if (cached && now - cached.checkedAt < REGISTRY_ALLOWLIST_CACHE_MS) {
    return cached.allowed;
  }

  const { data, error } = await supabase
    .from("attendance_devices")
    .select("id, status")
    .eq("serial_number", serialNumber)
    .maybeSingle();

  if (error) {
    console.error(`${requestLogPrefix()} registry allowlist lookup failed serial=${serialNumber} ${error.message || error}`);
    registrySerialCache.set(serialNumber, { allowed: false, checkedAt: now });
    return false;
  }

  const allowed = Boolean(data && (data.status === "active" || data.status === "maintenance"));
  registrySerialCache.set(serialNumber, { allowed, checkedAt: now });
  return allowed;
}

async function assertRequestAllowed({ request, url, serialNumber, remoteIp }) {
  if (config.allowedSerials.length && (!serialNumber || !config.allowedSerials.includes(serialNumber))) {
    const registryAllowed = await isSerialAllowedByRegistry(serialNumber);
    if (!registryAllowed) {
      return { ok: false, status: 403, message: "Serial device tidak diizinkan." };
    }
  }

  if (config.allowedRemoteIps.length && (!remoteIp || !config.allowedRemoteIps.includes(remoteIp))) {
    return { ok: false, status: 403, message: "Remote IP tidak diizinkan." };
  }

  if (config.receiverToken) {
    const token = url.searchParams.get("token") || "";
    const headerToken = String(request.headers["x-biofinger-token"] || request.headers["x-token"] || "");
    const authToken = String(request.headers.authorization || "");
    const supplied = token || headerToken || authToken.replace(/^Bearer\s+/i, "");
    if (supplied !== config.receiverToken) {
      return { ok: false, status: 401, message: "Receiver token tidak valid." };
    }
  }

  return { ok: true };
}

function parseTimezoneOffset(value) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("BIOFINGER_TIMEZONE_OFFSET harus seperti +07:00.");

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);
  return sign * ((hours * 60) + minutes);
}

function parseDeviceDateTime(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const directDate = new Date(normalized.replace(" ", "T"));
    return Number.isNaN(directDate.valueOf()) ? null : directDate;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
  if (!match) {
    const fallbackDate = new Date(normalized);
    return Number.isNaN(fallbackDate.valueOf()) ? null : fallbackDate;
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const offsetMinutes = parseTimezoneOffset(config.timezoneOffset);
  const utcMillis = Date.UTC(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hour, 10),
    Number.parseInt(minute, 10),
    Number.parseInt(second, 10),
  ) - (offsetMinutes * 60 * 1000);

  return new Date(utcMillis);
}

function formatDateKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function formatDeviceTimestampForHash(date) {
  const offsetMinutes = parseTimezoneOffset(config.timezoneOffset);
  const localMillis = date.getTime() + (offsetMinutes * 60 * 1000);
  const localDate = new Date(localMillis);
  const pad = (value) => String(value).padStart(2, "0");
  const year = localDate.getUTCFullYear();
  const month = pad(localDate.getUTCMonth() + 1);
  const day = pad(localDate.getUTCDate());
  const hour = pad(localDate.getUTCHours());
  const minute = pad(localDate.getUTCMinutes());
  const second = pad(localDate.getUTCSeconds());

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${config.timezoneOffset}`;
}

function normalizeEventType(punch) {
  const code = toInteger(punch, null);
  if (code === 0 || code === 4) return "check_in";
  if (code === 1 || code === 5) return "check_out";
  return "unknown";
}

function buildSourceHash({ serialNumber, externalUserId, deviceEventAt, statusCode, punch }) {
  return createHash("sha256")
    .update([
      serialNumber || "",
      externalUserId || "",
      deviceEventAt || "",
      statusCode === null || statusCode === undefined ? "" : String(statusCode),
      punch === null || punch === undefined ? "" : String(punch),
    ].join("|"))
    .digest("hex");
}

function parseKeyValueLine(line) {
  const values = {};
  const regex = /(\w+)=("[^"]*"|'[^']*'|.*?)(?=\s+\w+=|\t\w+=|$)/g;
  let match = regex.exec(line);
  while (match) {
    values[match[1].toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, "");
    match = regex.exec(line);
  }
  return values;
}

function parseAttendanceLine(line, serialNumber) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\t+/).map((part) => part.trim());
  if (parts.length < 2) return null;

  const externalUserId = parts[0];
  const deviceDate = parseDeviceDateTime(parts[1]);
  if (!externalUserId || !deviceDate) return null;

  const punch = toInteger(parts[2], null);
  const statusCode = toInteger(parts[3], toInteger(parts[2], null));
  const deviceEventAt = deviceDate.toISOString();
  const deviceEventAtForHash = formatDeviceTimestampForHash(deviceDate);

  return {
    device_serial_number: serialNumber || null,
    external_user_id: externalUserId,
    device_event_at: deviceEventAt,
    attendance_date: formatDateKey(deviceDate),
    punch,
    status_code: statusCode,
    normalized_event_type: normalizeEventType(punch),
    source_hash: buildSourceHash({
      serialNumber,
      externalUserId,
      deviceEventAt: deviceEventAtForHash,
      statusCode,
      punch,
    }),
    raw_payload: {
      source: "adms-cloud",
      raw_line: line,
      fields: parts,
    },
  };
}

function parseUserLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const keyValues = parseKeyValueLine(trimmed);
  const pin = keyValues.pin || keyValues.userid || keyValues.user_id || keyValues.uid || "";
  if (pin) {
    return {
      external_user_id: String(pin),
      external_uid: toInteger(keyValues.uid, null),
      external_name: keyValues.name || keyValues.user_name || null,
      privilege: toInteger(keyValues.pri || keyValues.privilege, null),
      metadata: {
        source: "adms-cloud",
        raw_line: line,
      },
    };
  }

  const parts = trimmed.split(/\t+/).map((part) => part.trim());
  if (!parts[0]) return null;
  return {
    external_user_id: parts[0],
    external_uid: toInteger(parts[0], null),
    external_name: parts[1] || null,
    privilege: toInteger(parts[4], null),
    metadata: {
      source: "adms-cloud",
      raw_line: line,
      fields: parts,
    },
  };
}

function parsePayloadLines(body) {
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isUserOperlogLine(line) {
  return /^USER\s+/i.test(String(line || "").trim());
}

function buildDeviceCode(serialNumber) {
  if (config.deviceCode && (!config.allowedSerials.length || config.allowedSerials.includes(serialNumber))) {
    return config.deviceCode;
  }

  const serialSuffix = String(serialNumber || "UNKNOWN")
    .replace(/[^a-z0-9-]/gi, "")
    .slice(-12)
    .toUpperCase() || "UNKNOWN";
  return `${config.deviceCodePrefix}-${serialSuffix}`;
}

async function ensureDevice({ serialNumber, remoteIp }) {
  if (config.dryRun) {
    return {
      id: "00000000-0000-0000-0000-000000000000",
      device_code: buildDeviceCode(serialNumber),
      serial_number: serialNumber,
      sync_cursor_at: null,
      metadata: {},
    };
  }

  const deviceCode = buildDeviceCode(serialNumber);
  const metadata = {
    source: "adms-cloud",
    last_remote_ip: remoteIp || null,
    receiver_port: config.port,
  };

  let query = supabase
    .from("attendance_devices")
    .select("id, device_code, serial_number, sync_cursor_at, metadata")
    .limit(1);

  query = serialNumber ? query.eq("serial_number", serialNumber) : query.eq("device_code", deviceCode);

  const { data: existingDevice, error: selectError } = await query.maybeSingle();
  if (selectError) throw selectError;

  if (existingDevice) {
    const { data, error } = await supabase
      .from("attendance_devices")
      .update({
        protocol: "adms-cloud",
        status: "active",
        last_seen_at: new Date().toISOString(),
        metadata: {
          ...(existingDevice.metadata || {}),
          ...metadata,
        },
      })
      .eq("id", existingDevice.id)
      .select("id, device_code, serial_number, sync_cursor_at, metadata")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("attendance_devices")
    .insert({
      device_code: deviceCode,
      name: serialNumber ? `${config.deviceName} - ${serialNumber}` : config.deviceName,
      vendor: "Biofinger",
      model: config.deviceModel,
      serial_number: serialNumber || null,
      ip_address: remoteIp || null,
      port: DEFAULT_DEVICE_PORT,
      protocol: "adms-cloud",
      status: "active",
      last_seen_at: new Date().toISOString(),
      metadata,
      notes: "Auto-registered by DMS Biofinger ADMS receiver.",
    })
    .select("id, device_code, serial_number, sync_cursor_at, metadata")
    .single();

  if (error) throw error;
  return data;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isMissingCommandQueueError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || message.includes("biofinger_device_commands")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

function noteCommandQueueError(error) {
  if (!isMissingCommandQueueError(error)) return false;

  commandQueueTableAvailable = false;
  if (!commandQueueMissingLogged) {
    console.warn(`${requestLogPrefix()} command queue table unavailable, using attendance_devices.metadata fallback`);
    commandQueueMissingLogged = true;
  }
  return true;
}

function normalizeAdmsCommandLine(value) {
  return String(value || "").replace(/\r?\n/g, " ").trim();
}

function buildUserSyncCommandLine({ requestId, pin }) {
  const commandPin = String(pin || config.userSyncPin || DEFAULT_USER_SYNC_PIN).trim() || DEFAULT_USER_SYNC_PIN;
  return normalizeAdmsCommandLine(
    config.userSyncCommandTemplate
      .replace(/\{id\}/g, String(requestId))
      .replace(/\{pin\}/g, commandPin),
  );
}

function getMetadataUserSyncRequest(metadata) {
  if (!isPlainObject(metadata)) return null;
  const request = metadata.biofinger_user_sync_request;
  if (!isPlainObject(request)) return null;
  return request;
}

async function updateDeviceSyncRequestMetadata({ device, request }) {
  if (config.dryRun || !supabase) return;
  const metadata = isPlainObject(device.metadata) ? device.metadata : {};
  const nextMetadata = {
    ...metadata,
    biofinger_user_sync_request: request,
  };

  const { error } = await supabase
    .from("attendance_devices")
    .update({ metadata: nextMetadata })
    .eq("id", device.id);

  if (error) throw error;
  device.metadata = nextMetadata;
}

async function claimMetadataUserSyncCommand(device) {
  const request = getMetadataUserSyncRequest(device.metadata);
  if (!request) return null;

  const status = String(request.status || "");
  if (!["pending", "retry"].includes(status)) return null;

  const expiresAt = request.expires_at ? Date.parse(String(request.expires_at)) : null;
  if (expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    await updateDeviceSyncRequestMetadata({
      device,
      request: {
        ...request,
        status: "expired",
        last_error: "Request expired before device poll.",
        responded_at: new Date().toISOString(),
      },
    });
    return null;
  }

  const attempts = toInteger(request.attempts, 0);
  const maxAttempts = toInteger(request.max_attempts, 3);
  if (attempts >= maxAttempts) {
    await updateDeviceSyncRequestMetadata({
      device,
      request: {
        ...request,
        status: "failed",
        last_error: "Max attempts reached before device acknowledged request.",
        responded_at: new Date().toISOString(),
      },
    });
    return null;
  }

  const requestId = toInteger(request.request_id, null) || (Date.now() % 2_147_483_647);
  const commandText = buildUserSyncCommandLine({ requestId, pin: request.pin });
  await updateDeviceSyncRequestMetadata({
    device,
    request: {
      ...request,
      status: "sent",
      request_id: requestId,
      command_text: commandText,
      attempts: attempts + 1,
      sent_at: new Date().toISOString(),
      last_error: null,
    },
  });

  return {
    source: "metadata",
    requestId,
    commandText,
  };
}

async function resetStaleCommandQueueRows(deviceId) {
  if (config.dryRun || !supabase || !commandQueueTableAvailable) return;

  const cutoffIso = new Date(Date.now() - Math.max(config.commandRetryMs || DEFAULT_COMMAND_RETRY_MS, 30_000)).toISOString();
  const { data, error } = await supabase
    .from("biofinger_device_commands")
    .select("id, attempts, max_attempts")
    .eq("attendance_device_id", deviceId)
    .eq("status", "sent")
    .lt("sent_at", cutoffIso)
    .limit(25);

  if (error) {
    if (noteCommandQueueError(error)) return;
    throw error;
  }

  const retryIds = [];
  const failedIds = [];
  for (const row of data || []) {
    const attempts = toInteger(row.attempts, 0);
    const maxAttempts = toInteger(row.max_attempts, 3);
    if (attempts < maxAttempts) retryIds.push(row.id);
    else failedIds.push(row.id);
  }

  if (retryIds.length) {
    const { error: retryError } = await supabase
      .from("biofinger_device_commands")
      .update({ status: "pending", last_error: "Retry after device did not acknowledge command." })
      .in("id", retryIds);
    if (retryError) throw retryError;
  }

  if (failedIds.length) {
    const { error: failedError } = await supabase
      .from("biofinger_device_commands")
      .update({ status: "failed", last_error: "Device did not acknowledge command after max attempts.", responded_at: new Date().toISOString() })
      .in("id", failedIds);
    if (failedError) throw failedError;
  }
}

async function claimCommandQueueRows(device) {
  if (config.dryRun || !supabase || !commandQueueTableAvailable) return [];

  await resetStaleCommandQueueRows(device.id);
  if (!commandQueueTableAvailable) return [];

  const nowIso = new Date().toISOString();
  const { error: expireError } = await supabase
    .from("biofinger_device_commands")
    .update({ status: "expired", last_error: "Command expired before device poll.", responded_at: nowIso })
    .eq("attendance_device_id", device.id)
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  if (expireError) {
    if (noteCommandQueueError(expireError)) return [];
    throw expireError;
  }

  const { data, error } = await supabase
    .from("biofinger_device_commands")
    .select("id, request_no, command_type, command_text, pin, attempts, max_attempts")
    .eq("attendance_device_id", device.id)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("requested_at", { ascending: true })
    .limit(Math.max(1, Math.min(config.commandBatchSize || DEFAULT_COMMAND_BATCH_SIZE, 10)));

  if (error) {
    if (noteCommandQueueError(error)) return [];
    throw error;
  }

  const commands = [];
  for (const row of data || []) {
    const attempts = toInteger(row.attempts, 0);
    const maxAttempts = toInteger(row.max_attempts, 3);
    if (attempts >= maxAttempts) {
      const { error: failedError } = await supabase
        .from("biofinger_device_commands")
        .update({ status: "failed", last_error: "Max attempts reached before device poll.", responded_at: nowIso })
        .eq("id", row.id);
      if (failedError) throw failedError;
      continue;
    }

    const requestId = toInteger(row.request_no, null);
    if (!requestId) continue;

    const commandText = normalizeAdmsCommandLine(row.command_text)
      || (row.command_type === "sync_users" ? buildUserSyncCommandLine({ requestId, pin: row.pin }) : "");
    if (!commandText) continue;

    const { error: updateError } = await supabase
      .from("biofinger_device_commands")
      .update({
        status: "sent",
        command_text: commandText,
        attempts: attempts + 1,
        sent_at: nowIso,
        last_error: null,
      })
      .eq("id", row.id);

    if (updateError) throw updateError;

    commands.push({
      source: "queue",
      id: row.id,
      requestId,
      commandText,
    });
  }

  return commands;
}

async function createAutoUserSyncCommand(device) {
  if (config.dryRun || !supabase || !commandQueueTableAvailable || !config.autoUserSync) return false;
  if (!device?.id) return false;

  const intervalMs = Math.max(config.autoUserSyncIntervalMs || DEFAULT_AUTO_USER_SYNC_INTERVAL_MS, 5 * 60 * 1000);
  const cutoffIso = new Date(Date.now() - intervalMs).toISOString();
  const { data: recentCommands, error: recentError } = await supabase
    .from("biofinger_device_commands")
    .select("id")
    .eq("attendance_device_id", device.id)
    .eq("command_type", "sync_users")
    .in("status", ["pending", "sent", "acknowledged", "completed"])
    .gt("requested_at", cutoffIso)
    .limit(1);

  if (recentError) {
    if (noteCommandQueueError(recentError)) return false;
    throw recentError;
  }

  if (recentCommands?.length) return false;

  const { error: insertError } = await supabase
    .from("biofinger_device_commands")
    .insert({
      attendance_device_id: device.id,
      serial_number: device.serial_number || null,
      command_type: "sync_users",
      pin: config.userSyncPin || DEFAULT_USER_SYNC_PIN,
      status: "pending",
      metadata: {
        source: "receiver-auto",
        interval_ms: intervalMs,
        device_code: device.device_code || "",
      },
    });

  if (insertError) {
    if (noteCommandQueueError(insertError)) return false;
    throw insertError;
  }

  return true;
}

async function claimAdmsCommands(device) {
  let queueCommands = await claimCommandQueueRows(device);
  if (!queueCommands.length && await createAutoUserSyncCommand(device)) {
    queueCommands = await claimCommandQueueRows(device);
  }
  const metadataCommand = await claimMetadataUserSyncCommand(device);
  return metadataCommand ? [...queueCommands, metadataCommand] : queueCommands;
}

function parseDeviceCommandResult(body, url) {
  const values = {};
  for (const [key, value] of url.searchParams.entries()) {
    values[key.toLowerCase()] = value;
  }

  const bodyText = String(body || "").trim();
  if (bodyText) {
    for (const part of bodyText.split(/[&\r\n]+/)) {
      const index = part.indexOf("=");
      if (index <= 0) continue;
      const key = part.slice(0, index).trim().toLowerCase();
      const rawValue = part.slice(index + 1).trim();
      try {
        values[key] = decodeURIComponent(rawValue.replace(/\+/g, " "));
      } catch {
        values[key] = rawValue;
      }
    }

    const looseValues = parseKeyValueLine(bodyText.replace(/[&\r\n]+/g, " "));
    Object.assign(values, looseValues);
  }

  return {
    requestId: toInteger(values.id || values.command_id || values.request_id, null),
    returnCode: toInteger(values.return || values.ret || values.result, null),
    command: values.cmd || values.command || "",
    responseText: bodyText,
  };
}

async function markCommandQueueResult({ deviceId, requestId, returnCode, responseText }) {
  if (config.dryRun || !supabase || !commandQueueTableAvailable || !requestId) return false;

  const { data, error } = await supabase
    .from("biofinger_device_commands")
    .select("id, status")
    .eq("attendance_device_id", deviceId)
    .eq("request_no", requestId)
    .order("requested_at", { ascending: false })
    .limit(1);

  if (error) {
    if (noteCommandQueueError(error)) return false;
    throw error;
  }

  const row = data?.[0];
  if (!row) return false;

  const status = returnCode === null || returnCode === 0
    ? row.status === "completed" ? "completed" : "acknowledged"
    : "failed";
  const { error: updateError } = await supabase
    .from("biofinger_device_commands")
    .update({
      status,
      response_code: returnCode,
      response_text: responseText || null,
      responded_at: new Date().toISOString(),
      last_error: status === "failed" ? `Device returned ${returnCode}` : null,
    })
    .eq("id", row.id);

  if (updateError) throw updateError;
  return true;
}

async function markMetadataUserSyncResult({ device, requestId, returnCode, responseText }) {
  const request = getMetadataUserSyncRequest(device.metadata);
  if (!request || !requestId || toInteger(request.request_id, null) !== requestId) return false;

  const status = returnCode === null || returnCode === 0
    ? String(request.status || "") === "completed" ? "completed" : "acknowledged"
    : "failed";
  await updateDeviceSyncRequestMetadata({
    device,
    request: {
      ...request,
      status,
      response_code: returnCode,
      response_text: responseText || null,
      responded_at: new Date().toISOString(),
      last_error: status === "failed" ? `Device returned ${returnCode}` : null,
    },
  });
  return true;
}

async function markDeviceCommandResult({ device, result }) {
  const queueMarked = await markCommandQueueResult({
    deviceId: device.id,
    requestId: result.requestId,
    returnCode: result.returnCode,
    responseText: result.responseText,
  });
  const metadataMarked = await markMetadataUserSyncResult({
    device,
    requestId: result.requestId,
    returnCode: result.returnCode,
    responseText: result.responseText,
  });

  return { queueMarked, metadataMarked };
}

async function markRecentUserSyncCompleted({ device, usersSeen }) {
  const completedAt = new Date().toISOString();

  if (!config.dryRun && supabase && commandQueueTableAvailable) {
    const { data, error } = await supabase
      .from("biofinger_device_commands")
      .select("id")
      .eq("attendance_device_id", device.id)
      .eq("command_type", "sync_users")
      .in("status", ["sent", "acknowledged"])
      .order("sent_at", { ascending: false })
      .limit(3);

    if (error) {
      if (!noteCommandQueueError(error)) throw error;
    } else if (data?.length) {
      const { error: updateError } = await supabase
        .from("biofinger_device_commands")
        .update({
          status: "completed",
          response_code: 0,
          response_text: `USER payload received (${usersSeen} row).`,
          responded_at: completedAt,
          last_error: null,
        })
        .in("id", data.map((row) => row.id));
      if (updateError) throw updateError;
    }
  }

  const request = getMetadataUserSyncRequest(device.metadata);
  if (request && ["sent", "acknowledged"].includes(String(request.status || ""))) {
    await updateDeviceSyncRequestMetadata({
      device,
      request: {
        ...request,
        status: "completed",
        response_code: 0,
        response_text: `USER payload received (${usersSeen} row).`,
        responded_at: completedAt,
        last_error: null,
      },
    });
  }
}

async function upsertPendingUsers({ deviceId, users }) {
  if (!users.length) return { created: 0, seen: 0 };
  if (config.dryRun) return { created: users.length, seen: users.length };

  const userIds = [...new Set(users.map((user) => user.external_user_id).filter(Boolean))];
  const { data: existingLinks, error: linksError } = await supabase
    .from("employee_attendance_device_links")
    .select("id, external_user_id")
    .eq("attendance_device_id", deviceId)
    .in("external_user_id", userIds);

  if (linksError) throw linksError;

  const existingIds = new Set((existingLinks || []).map((link) => String(link.external_user_id)));
  const missingUsers = users.filter((user) => user.external_user_id && !existingIds.has(user.external_user_id));

  if (missingUsers.length) {
    const { error: insertError } = await supabase
      .from("employee_attendance_device_links")
      .insert(missingUsers.map((user) => ({
        attendance_device_id: deviceId,
        external_user_id: user.external_user_id,
        external_uid: user.external_uid,
        external_name: user.external_name,
        privilege: user.privilege,
        status: "pending",
        matched_by: "import",
        last_seen_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        metadata: user.metadata || { source: "adms-cloud" },
      })));

    if (insertError) throw insertError;
  }

  for (const user of users.filter((item) => existingIds.has(item.external_user_id))) {
    const { error: updateError } = await supabase
      .from("employee_attendance_device_links")
      .update({
        external_name: user.external_name || undefined,
        external_uid: user.external_uid,
        privilege: user.privilege,
        last_seen_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .eq("attendance_device_id", deviceId)
      .eq("external_user_id", user.external_user_id);

    if (updateError) throw updateError;
  }

  return { created: missingUsers.length, seen: userIds.length };
}

async function getActiveLinksByUserId({ deviceId, externalUserIds }) {
  if (!externalUserIds.length || config.dryRun) return new Map();

  const { data, error } = await supabase
    .from("employee_attendance_device_links")
    .select("external_user_id, employee_id, status")
    .eq("attendance_device_id", deviceId)
    .in("external_user_id", externalUserIds);

  if (error) throw error;

  return new Map((data || []).map((link) => [String(link.external_user_id), link]));
}

async function insertAttendanceEvents({ device, events }) {
  if (!events.length) return { inserted: 0, maxEventAt: null, conversion: null };
  if (config.dryRun) {
    const maxEventAt = events.reduce((latest, event) => {
      const parsed = new Date(event.device_event_at);
      return !latest || parsed > latest ? parsed : latest;
    }, null);
    return { inserted: events.length, maxEventAt, conversion: null };
  }

  const externalUserIds = [...new Set(events.map((event) => event.external_user_id).filter(Boolean))];
  await upsertPendingUsers({
    deviceId: device.id,
    users: externalUserIds.map((externalUserId) => ({ external_user_id: externalUserId, metadata: { source: "adms-cloud-attlog" } })),
  });

  const activeLinks = await getActiveLinksByUserId({
    deviceId: device.id,
    externalUserIds,
  });

  const rows = events.map((event) => {
    const link = activeLinks.get(event.external_user_id);
    const isMapped = link?.status === "active" && link.employee_id;
    return {
      attendance_device_id: device.id,
      device_serial_number: event.device_serial_number,
      external_user_id: event.external_user_id,
      employee_id: isMapped ? link.employee_id : null,
      device_event_at: event.device_event_at,
      attendance_date: event.attendance_date,
      punch: event.punch,
      status_code: event.status_code,
      normalized_event_type: event.normalized_event_type,
      import_status: isMapped ? "mapped" : "pending",
      source_hash: event.source_hash,
      raw_payload: event.raw_payload,
    };
  });

  const { data, error } = await supabase
    .from("biofinger_attendance_events")
    .upsert(rows, { onConflict: "source_hash", ignoreDuplicates: true })
    .select("id, device_event_at");

  if (error) throw error;

  const maxEventAt = events.reduce((latest, event) => {
    const parsed = new Date(event.device_event_at);
    return !latest || parsed > latest ? parsed : latest;
  }, null);

  if (maxEventAt) {
    const previousCursor = device.sync_cursor_at ? new Date(device.sync_cursor_at) : null;
    const nextCursor = !previousCursor || maxEventAt > previousCursor ? maxEventAt.toISOString() : previousCursor.toISOString();
    const { error: deviceError } = await supabase
      .from("attendance_devices")
      .update({
        last_sync_at: new Date().toISOString(),
        sync_cursor_at: nextCursor,
      })
      .eq("id", device.id);

    if (deviceError) throw deviceError;
  }

  const conversion = config.convertOnImport
    ? await convertMappedEvents({ deviceId: device.id })
    : null;

  return { inserted: data?.length || 0, maxEventAt, conversion };
}

async function convertMappedEvents({ deviceId }) {
  if (config.dryRun || !supabase) return null;

  const batchSize = Math.min(Math.max(config.conversionBatchSize || DEFAULT_CONVERSION_BATCH_SIZE, 1), 5000);
  const { data, error } = await supabase.rpc("convert_biofinger_attendance_events", {
    target_device_id: deviceId,
    target_limit: batchSize,
  });

  if (error) {
    console.warn(`${requestLogPrefix()} conversion skipped device=${deviceId} ${error.message || error}`);
    return { error: error.message || String(error) };
  }

  const summary = Array.isArray(data) ? data[0] : data;
  return summary || null;
}

function buildOptionsResponse(serialNumber) {
  return [
    `GET OPTION FROM: ${serialNumber || ""}`,
    "Stamp=0",
    "OpStamp=0",
    "ErrorDelay=60",
    "Delay=10",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=1111000000",
    "Realtime=1",
    "Encrypt=0",
    "",
  ].join("\n");
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleIClockRequest(request, response, { url, serialNumber, remoteIp }) {
  const pathname = url.pathname.toLowerCase();
  const table = (url.searchParams.get("table") || "").toUpperCase();

  if (request.method === "GET") {
    const device = await ensureDevice({ serialNumber, remoteIp });
    if (pathname.endsWith("/cdata") && (url.searchParams.get("options") || "").toLowerCase() === "all") {
      console.log(`${requestLogPrefix()} options serial=${serialNumber || "-"} device=${device.device_code}`);
      return textResponse(response, buildOptionsResponse(serialNumber));
    }

    if (pathname.endsWith("/getrequest")) {
      const commands = await claimAdmsCommands(device);
      if (commands.length) {
        console.log(`${requestLogPrefix()} command serial=${serialNumber || "-"} count=${commands.length} ids=${commands.map((command) => command.requestId).join(",")}`);
        return textResponse(response, `${commands.map((command) => command.commandText).join("\n")}\n`);
      }
    }

    console.log(`${requestLogPrefix()} poll serial=${serialNumber || "-"} path=${url.pathname}`);
    return textResponse(response);
  }

  if (request.method !== "POST") {
    return textResponse(response, "Method not allowed\n", 405);
  }

  const body = await readRequestBody(request);
  if (config.logPayload) {
    const preview = body.replace(/\s+/g, " ").slice(0, 240);
    console.log(`${requestLogPrefix()} payload serial=${serialNumber || "-"} table=${table || "-"} bytes=${Buffer.byteLength(body)} preview=${preview}`);
  }

  const device = await ensureDevice({ serialNumber, remoteIp });
  const lines = parsePayloadLines(body);

  if (pathname.endsWith("/devicecmd")) {
    const result = parseDeviceCommandResult(body, url);
    const marked = await markDeviceCommandResult({ device, result });
    console.log(`${requestLogPrefix()} devicecmd serial=${serialNumber || "-"} id=${result.requestId || "-"} return=${result.returnCode ?? "-"} queue=${marked.queueMarked ? "yes" : "no"} metadata=${marked.metadataMarked ? "yes" : "no"}`);
    return textResponse(response);
  }

  if (table === "USER" || table === "USERINFO") {
    const users = lines.map(parseUserLine).filter(Boolean);
    const result = await upsertPendingUsers({ deviceId: device.id, users });
    await markRecentUserSyncCompleted({ device, usersSeen: result.seen });
    console.log(`${requestLogPrefix()} user serial=${serialNumber || "-"} table=${table} seen=${result.seen} created=${result.created}`);
    return textResponse(response);
  }

  if (table === "OPERLOG") {
    const userLines = lines.filter(isUserOperlogLine);
    if (userLines.length) {
      const users = userLines.map(parseUserLine).filter(Boolean);
      const result = await upsertPendingUsers({ deviceId: device.id, users });
      await markRecentUserSyncCompleted({ device, usersSeen: result.seen });
      console.log(`${requestLogPrefix()} operlog-user serial=${serialNumber || "-"} seen=${result.seen} created=${result.created}`);
    } else {
      console.log(`${requestLogPrefix()} ack serial=${serialNumber || "-"} table=${table || "-"} lines=${lines.length}`);
    }
    return textResponse(response);
  }

  if (table === "ATTLOG") {
    const events = lines.map((line) => parseAttendanceLine(line, serialNumber)).filter(Boolean);
    const result = await insertAttendanceEvents({ device, events });
    const conversionText = result.conversion
      ? ` converted=${result.conversion.events_converted ?? 0} ignored=${result.conversion.events_ignored ?? 0} error=${result.conversion.events_error ?? 0}`
      : "";
    console.log(`${requestLogPrefix()} attlog serial=${serialNumber || "-"} events=${events.length} inserted=${result.inserted}${conversionText}`);
    return textResponse(response);
  }

  console.log(`${requestLogPrefix()} ack serial=${serialNumber || "-"} table=${table || "-"} lines=${lines.length}`);
  return textResponse(response);
}

async function handleRequest(request, response) {
  const url = getRequestUrl(request);
  const remoteIp = getRemoteIp(request);
  const serialNumber = getSerialFromUrl(url);

  try {
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      return jsonResponse(response, {
        ok: true,
        version: RECEIVER_VERSION,
        dryRun: config.dryRun,
        port: config.port,
        allowedSerials: config.allowedSerials.length,
        registryAllowlist: !config.dryRun,
        commandQueue: commandQueueTableAvailable ? "available" : "fallback-metadata",
        commandBatchSize: config.commandBatchSize,
        autoUserSync: config.autoUserSync,
        autoUserSyncIntervalMs: config.autoUserSyncIntervalMs,
      });
    }

    const allowed = await assertRequestAllowed({ request, url, serialNumber, remoteIp });
    if (!allowed.ok) {
      console.log(`${requestLogPrefix()} reject status=${allowed.status} reason=${allowed.message} path=${url.pathname} serial=${serialNumber || "-"} remote=${remoteIp || "-"}`);
      return textResponse(response, `${allowed.message}\n`, allowed.status);
    }

    if (url.pathname.toLowerCase().startsWith("/iclock/")) {
      return await handleIClockRequest(request, response, { url, serialNumber, remoteIp });
    }

    console.log(`${requestLogPrefix()} unknown path=${url.pathname} method=${request.method} serial=${serialNumber || "-"} remote=${remoteIp || "-"}`);
    return textResponse(response);
  } catch (error) {
    console.error(`${requestLogPrefix()} error path=${url.pathname} serial=${serialNumber || "-"} remote=${remoteIp || "-"} ${error.stack || error}`);
    return textResponse(response, "ERROR\n", 500);
  }
}

const server = http.createServer((request, response) => {
  handleRequest(request, response);
});

server.listen(config.port, config.host, () => {
  console.log(`${requestLogPrefix()} DMS Biofinger ADMS receiver listening on ${config.host}:${config.port}`);
  console.log(`${requestLogPrefix()} version=${RECEIVER_VERSION}`);
  console.log(`${requestLogPrefix()} dryRun=${config.dryRun} allowedSerials=${config.allowedSerials.join(",") || "*"}`);
  console.log(`${requestLogPrefix()} convertOnImport=${config.convertOnImport} conversionBatchSize=${config.conversionBatchSize}`);
  console.log(`${requestLogPrefix()} commandBatchSize=${config.commandBatchSize} userSyncTemplate=${config.userSyncCommandTemplate}`);
  console.log(`${requestLogPrefix()} autoUserSync=${config.autoUserSync} autoUserSyncIntervalMs=${config.autoUserSyncIntervalMs}`);
});

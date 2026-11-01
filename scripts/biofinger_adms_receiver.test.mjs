import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const receiverPath = fileURLToPath(new URL("./biofinger_adms_receiver.mjs", import.meta.url));
const serial = "TEST-ADMS-TIMEZONE-ONLY";
const host = "127.0.0.1";
const timeoutMs = 5_000;

async function withTimeout(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function availableLocalPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startReceiver(offset, port) {
  const child = spawn(process.execPath, [receiverPath], {
    cwd: projectRoot,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: "",
      SUPABASE_URL: "",
      VITE_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      BIOFINGER_ADMS_HOST: host,
      BIOFINGER_ADMS_PORT: String(port),
      BIOFINGER_TIMEZONE_OFFSET: offset,
      BIOFINGER_ALLOWED_SERIALS: serial,
      BIOFINGER_ALLOWED_REMOTE_IPS: host,
      BIOFINGER_RECEIVER_TOKEN: "",
      BIOFINGER_RECEIVER_DRY_RUN: "true",
      BIOFINGER_RECEIVER_LOG_PAYLOAD: "false",
      BIOFINGER_CONVERT_ON_IMPORT: "false",
      BIOFINGER_AUTO_USER_SYNC_ENABLED: "false",
      BIOFINGER_USER_SYNC_COMMAND_TEMPLATE: "C:{id}:DATA QUERY USERINFO",
    },
  });

  let stdout = "";
  let stderr = "";
  let resolveStartup;
  const startup = new Promise((resolve) => { resolveStartup = resolve; });
  child.stdout.on("data", (chunk) => {
    stdout = (stdout + chunk.toString()).slice(-8_192);
    if (stdout.includes(`listening on ${host}:${port}`)) resolveStartup({ listening: true });
  });
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-8_192); });
  const closed = new Promise((resolve) => {
    child.once("error", (error) => {
      const result = { listening: false, error };
      resolveStartup(result);
      resolve(result);
    });
    child.once("close", (code, signal) => {
      const result = { listening: false, code, signal };
      resolveStartup(result);
      resolve(result);
    });
  });

  return {
    startup,
    closed,
    diagnostics: () => `${stdout}\n${stderr}`,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await withTimeout(closed, "receiver shutdown");
    },
  };
}

for (const [offset, expectedZone] of [["+07:00", 7], ["-05:00", -5], ["+05:30", 330]]) {
  test(`ADMS handshake encodes ${offset} as ${expectedZone} and keeps HTTP Date in GMT`, { timeout: 20_000 }, async () => {
    const port = await availableLocalPort();
    const receiver = startReceiver(offset, port);
    try {
      const started = await withTimeout(receiver.startup, "receiver startup");
      assert.equal(started.listening, true, receiver.diagnostics());
      const origin = `http://${host}:${port}`;
      const response = await fetch(`${origin}/iclock/cdata?SN=${serial}&options=all`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      assert.equal(response.status, 200);
      const options = (await response.text()).trim().split(/\r?\n/);
      assert.equal(options[0], `GET OPTION FROM: ${serial}`);
      assert.deepEqual(options.filter((line) => line.startsWith("TimeZone=")), [`TimeZone=${expectedZone}`]);
      for (const preservedOption of ["Stamp=0", "OpStamp=0", "Realtime=1", "Encrypt=0"]) {
        assert.ok(options.includes(preservedOption), `missing ${preservedOption}`);
      }

      const httpDate = response.headers.get("date");
      assert.match(httpDate || "", /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
      assert.ok(Math.abs(Date.parse(httpDate) - Date.now()) < 10_000, "HTTP Date must remain the current UTC instant");

      const healthResponse = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(timeoutMs) });
      assert.equal(healthResponse.status, 200);
      const health = await healthResponse.json();
      assert.equal(health.dryRun, true);
      assert.equal(health.timezoneOffset, offset);
      assert.equal(health.admsTimeZone, String(expectedZone));
    } finally {
      await receiver.stop();
    }
  });
}

for (const offset of ["+07:99", "+15:00", "+00:30"]) {
  test(`invalid ADMS offset ${offset} exits before listening`, { timeout: 15_000 }, async () => {
    const receiver = startReceiver(offset, 0);
    try {
      const started = await withTimeout(receiver.startup, "invalid-offset validation");
      assert.equal(started.listening, false, "invalid offset unexpectedly started a server");
      const exited = await withTimeout(receiver.closed, "invalid-offset exit");
      assert.equal(exited.error, undefined, "receiver must start successfully before validating configuration");
      assert.equal(exited.signal, null);
      assert.notEqual(exited.code, 0);
      assert.match(receiver.diagnostics(), /BIOFINGER_TIMEZONE_OFFSET/);
      assert.doesNotMatch(receiver.diagnostics(), /listening on/);
    } finally {
      await receiver.stop();
    }
  });
}

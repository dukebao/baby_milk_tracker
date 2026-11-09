// Browser review with sample records only. All API requests are intercepted.
// Run: node scripts/review-ui.cjs [http://localhost:3000]
const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const assert = require("assert");
const http = require("node:http");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reviewPages = process.argv[2] === "--pages";
let base = reviewPages ? "" : process.argv[2] || "http://localhost:3000";
const envFile = fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8");
const supabaseUrl = envFile.match(/^REACT_APP_SUPABASE_URL=(.+)$/m)?.[1].trim();
if (!supabaseUrl) throw new Error("Configure the Supabase project URL before running this offline browser review.");
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const folder = path.resolve(__dirname, "../review-artifacts");

function sampleApi(projectRef) {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const setupMode = sessionStorage.getItem("review-setup-mode") === "true";
  const savedFamily = JSON.parse(sessionStorage.getItem("review-sample-family") || "null");
  const household = savedFamily?.household || { id: 999, name: setupMode ? "My family" : "Sample family", created_by: 999, setup_completed: !setupMode };
  const baby = savedFamily?.baby || { id: 999, name: setupMode ? "Baby" : "Aria", household_id: 999 };
  const user = { id: 999, email: "sample@example.com", aud: "authenticated", role: "authenticated", created_at: new Date().toISOString() };
  const auth = { user, babies: [baby], households: [household], milk_amounts: [80, 200, -50] };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "999", exp: expires, iat: expires - 3600, aud: "authenticated" })}.sample-signature`, refresh_token: "sample-only", token_type: "bearer", expires_at: expires, expires_in: 3600, user };
  localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(session));
  localStorage.setItem("milk-tracker-baby-id", "999");
  const row = { id: 1, baby_id: 999, date, created_at: new Date().toISOString() };
  const tables = {
    tracker_milk_entries: [{ ...row, amount: 120, notes: "Morning bottle" }],
    tracker_pee_logs: [{ ...row }], tracker_poop_logs: [], tracker_breastfeeding_logs: [],
    tracker_daily_goals: [{ ...row, goal: 700 }], tracker_measurements: [{ ...row, weight: 5.2, height: 60 }],
  };
  const originalFetch = window.fetch;
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.hostname.endsWith(".supabase.co")) return originalFetch(input, options);
    // Intercept every Supabase request, including Auth, before it can reach real data.
    const pathname = url.pathname;
    const body = options.body ? JSON.parse(options.body) : {};
    const headers = new Headers(options.headers || (typeof input !== "string" ? input.headers : undefined));
    const single = headers.get("Accept")?.includes("vnd.pgrst.object");
    let result = {};
    if (pathname === "/auth/v1/user") result = user;
    else if (pathname === "/auth/v1/token") result = session;
    else if (pathname.endsWith("/rpc/tracker_initialize")) result = null;
    else if (pathname.endsWith("/rpc/tracker_members")) result = [{ user_id: 999, email: user.email, role: "owner" }];
    else if (pathname.endsWith("/rpc/tracker_create_invite")) result = { join_path: "/join/sample-token", expires_at: "2099-01-01T00:00:00Z" };
    else if (pathname.endsWith("/rpc/tracker_preview_invite")) result = { household: { name: household.name }, expires_at: "2099-01-01T00:00:00Z" };
    else if (pathname.endsWith("/rpc/tracker_accept_invite")) result = 999;
    else if (pathname.endsWith("/rpc/tracker_complete_setup")) {
      Object.assign(household, { name: body.household_name, setup_completed: true });
      Object.assign(baby, { name: body.baby_name });
      result = { household, baby };
      sessionStorage.setItem("review-sample-family", JSON.stringify(result));
    } else if (pathname === "/rest/v1/tracker_preferences") {
      if (options.method === "PATCH") auth.milk_amounts = body.milk_amounts;
      result = [{ milk_amounts: auth.milk_amounts }];
    } else if (pathname === "/rest/v1/tracker_households") result = auth.households;
    else if (pathname === "/rest/v1/tracker_babies") result = auth.babies;
    else if (pathname.startsWith("/rest/v1/")) {
      const table = pathname.split("/").pop();
      if (options.method === "POST") {
        const record = { ...row, id: tables[table].length + 1, ...body };
        tables[table].push(record); result = [record];
      } else if (options.method === "PATCH") {
        if (body.created_at && sessionStorage.getItem("review-deny-time-save") === "true") {
          return new Response(JSON.stringify({ code: "42501", message: `permission denied for table ${table}` }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        result = (tables[table] || []).filter((record) => String(record.id) === id);
        result.forEach((record) => Object.assign(record, body));
      } else result = tables[table] || [];
    }
    if (single && Array.isArray(result)) result = result[0] || {};
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

(async () => {
  let preview;
  if (reviewPages) {
    const build = path.resolve(__dirname, "../build");
    const basePath = "/baby_milk_tracker";
    preview = http.createServer((request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (!pathname.startsWith(`${basePath}/`)) { response.writeHead(404); response.end(); return; }
      const file = path.resolve(build, `.${decodeURIComponent(pathname.slice(basePath.length))}`);
      if (file !== build && !file.startsWith(`${build}${path.sep}`)) { response.writeHead(404); response.end(); return; }
      const target = file === build ? path.join(build, "index.html") : file;
      const exists = fs.existsSync(target) && fs.statSync(target).isFile();
      const asset = exists ? target : path.join(build, "404.html");
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" }[path.extname(asset)] || "application/octet-stream";
      response.writeHead(exists || file === build ? 200 : 404, { "Content-Type": mime });
      fs.createReadStream(asset).pipe(response);
    });
    await new Promise((resolve) => preview.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${preview.address().port}${basePath}/`;
  }
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
  if (!chrome) throw new Error("Chrome or Edge is required for the browser review.");
  fs.mkdirSync(folder, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "milk-ui-review-"));
  const port = await new Promise((resolve) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(() => resolve(value)); }); });
  const browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket;
  try {
    let targets;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await delay(100); }
    }
    if (!targets) throw new Error("Browser did not start.");
    socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const pending = new Map(); let id = 0; const errors = [];
    socket.on("message", (raw) => {
      const message = JSON.parse(raw);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
      if (pending.has(message.id)) { const call = pending.get(message.id); pending.delete(message.id); clearTimeout(call.timer); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const next = ++id;
      const timer = setTimeout(() => { pending.delete(next); reject(new Error(`Timed out: ${method}`)); }, 15000);
      pending.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(expression)) return; await delay(200); }
      await screenshot("review-failure.png");
      throw new Error(`UI did not become ready: ${expression}\n${await evaluate("document.body.innerText.slice(0, 1600)")}\nRuntime errors: ${JSON.stringify(errors)}`);
    };
    const click = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === ${JSON.stringify(text)} || button.textContent.trim() === ${JSON.stringify(text)})?.click()`);
    const screenshot = async (name) => { const result = await command("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(folder, name), Buffer.from(result.data, "base64")); };
    const noOverflow = async () => assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"), "Page overflows horizontally");
    const stableLogActions = async (width) => {
      const rows = await evaluate(`Array.from(document.querySelectorAll('.log-item')).map(row => {
        const actions = row.querySelector('.log-actions');
        if (!actions) return null;
        const bounds = row.getBoundingClientRect();
        const buttons = actions.getBoundingClientRect();
        const content = row.querySelector('.log-main').getBoundingClientRect();
        return {
          label: row.querySelector('.log-title').textContent,
          placement: buttons.top >= content.bottom ? 'below' : 'beside',
          left: buttons.left - bounds.left,
          right: bounds.right - buttons.right,
          contained: buttons.left >= bounds.left && buttons.right <= bounds.right && bounds.left >= 0 && bounds.right <= innerWidth,
          textContained: content.right <= bounds.right && row.querySelector('.log-main').scrollWidth <= row.querySelector('.log-main').clientWidth,
        };
      }).filter(Boolean)`);
      assert(rows.length >= 3, "Button layout review needs several log types");
      assert(rows.every(row => row.contained && row.textContained), `Log controls overflow at ${width}px: ${JSON.stringify(rows)}`);
      assert(rows.every(row => row.placement === rows[0].placement && Math.abs(row.left - rows[0].left) < 1 && Math.abs(row.right - rows[0].right) < 1), `Log button positions vary with entry text at ${width}px: ${JSON.stringify(rows)}`);
    };
    await command("Runtime.enable"); await command("Page.enable");
    await command("Page.addScriptToEvaluateOnNewDocument", { source: `(${sampleApi.toString()})(${JSON.stringify(projectRef)});` });
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await command("Page.navigate", { url: base });
    await waitFor("document.body.innerText.includes('Weekly totals') && document.body.innerText.includes('120 ml')");
    await noOverflow(); await screenshot("phone-calendar.png");
    assert(await evaluate("getComputedStyle(document.querySelector('.calendar-toolbar .btn')).borderTopWidth === '2px'"), "Calendar navigation is not visibly button-shaped");
    assert(await evaluate("getComputedStyle(document.querySelector('.calendar-day')).borderTopWidth === '2px'"), "Calendar dates lack visible boundaries");
    await click("Settings"); await waitFor("document.querySelector('dialog')?.open && document.body.innerText.includes('Create invite link')");
    assert(await evaluate("document.querySelector('.settings-drawer').scrollWidth <= 390"), "Drawer overflows horizontally");
    await screenshot("phone-settings.png");
    await click("Create invite link");
    await waitFor("!!document.getElementById('invite-link')");
    assert.strictEqual(await evaluate("document.getElementById('invite-link').value"), `${base.replace(/\/$/, "")}/join/sample-token`, "Invite URL is missing the hosting base path");
    assert(await evaluate("getComputedStyle(document.querySelector('dialog .btn-outline-dark')).borderTopWidth === '2px'"), "Settings buttons have no visible border");
    assert(await evaluate("getComputedStyle(document.getElementById('settings-baby')).backgroundColor !== getComputedStyle(document.querySelector('.settings-drawer')).backgroundColor"), "Baby dropdown blends into drawer");
    await click("Edit amounts");
    await evaluate("(() => { const input = document.getElementById('milk-amount-0'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '95'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await click("Save amounts"); await waitFor("document.body.innerText.includes('Milk buttons saved.')");
    await click("Close"); await click("Log today");
    await waitFor("document.body.innerText.includes('Daily summary') && document.body.innerText.includes('Morning bottle')");
    assert(await evaluate("document.body.innerText.includes('95 ml')"), "Saved preferences do not reach tracker");
    await evaluate("document.querySelector('[aria-label=\"Log breastfeeding\"]').click()");
    await waitFor("document.body.innerText.includes('Breastfeeding time saved.') && document.body.innerText.includes('Breastfeeds: 1')");
    assert(await evaluate("!document.querySelector('.top-bar select') && !document.body.innerText.toLowerCase().includes('time only')"), "Header selector or time-only label is still visible");
    assert(await evaluate("!document.querySelector('[aria-label=\"Delete breastfeeding entry 1\"]').closest('li').innerText.includes('ml')"), "Breastfeeding incorrectly shows an amount");
    assert(await evaluate("document.querySelector('.stat-value').textContent.trim() === '120 ml'"), "Breastfeeding changed milk total");
    await noOverflow(); await screenshot("phone-tracker.png");
    await click("Poop"); await waitFor("document.body.innerText.includes('Poop saved.')");
    for (const type of ["milk", "pee", "poop", "breastfeeding"]) {
      const edit = `[aria-label="Edit ${type} entry 1"]`;
      await waitFor(`document.querySelector(${JSON.stringify(edit)})?.disabled === false`);
      await evaluate(`document.querySelector(${JSON.stringify(edit)}).click()`);
      await waitFor("!!document.getElementById('log-time')");
      const time = await evaluate("document.getElementById('log-time').value === '08:15' ? '08:16' : '08:15'");
      await evaluate(`(() => { const input = document.getElementById('log-time'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(time)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      assert(await evaluate("(() => { const form = document.querySelector('.log-edit-form'); const rect = form.getBoundingClientRect(); const row = form.closest('.log-item').getBoundingClientRect(); return rect.left >= row.left && rect.right <= row.right && form.scrollWidth <= form.clientWidth; })()"), `${type} time editor overflows its log row`);
      if (type === "milk") {
        await evaluate("document.querySelector('.log-edit-form').scrollIntoView({ block: 'center' })");
        await waitFor("(() => { const rect = document.querySelector('.log-edit-form').getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; })()");
        await noOverflow(); await screenshot("phone-log-time-editor.png");
      }
      if (type === "milk") {
        await evaluate("sessionStorage.setItem('review-deny-time-save', 'true')");
        await click("Save entry");
        await waitFor("document.querySelector('.log-edit-form [role=alert]')?.textContent.includes(\"Time changes aren't enabled yet\")");
        assert(await evaluate(`document.getElementById('log-time').value === ${JSON.stringify(time)}`), "Denied time correction lost its draft");
        assert(await evaluate(`document.querySelector(${JSON.stringify(edit)}) === null`), "Denied time correction closed the editor");
        await evaluate("sessionStorage.removeItem('review-deny-time-save')");
      }
      await click("Save entry");
      await waitFor("!document.getElementById('log-time') && document.body.innerText.includes('entry updated.')");
      assert(await evaluate("document.querySelector('.stat-value').textContent.trim() === '120 ml'"), "Time correction changed milk total");
      await evaluate(`document.querySelector(${JSON.stringify(edit)}).click()`);
      assert(await evaluate(`document.getElementById('log-time').value === ${JSON.stringify(time)}`), `${type} time correction did not persist after refresh`);
      await click("Cancel edit");
    }
    assert(await evaluate("getComputedStyle(document.querySelector('.quick-actions .btn-success')).borderTopWidth === '2px'"), "Feed action blends into informational cards");
    assert(await evaluate("getComputedStyle(document.getElementById('custom-amount')).borderTopWidth === '2px'"), "Milk input lacks a visible border");
    assert(await evaluate("!document.querySelector('label[for=custom-amount]').classList.contains('visually-hidden')"), "Custom milk field label is hidden");
    await waitFor("document.getElementById('custom-amount')?.disabled === false");
    await evaluate("document.getElementById('custom-amount').focus(); document.querySelector('.custom-entry-grid').scrollIntoView({ block: 'center' })");
    const focusState = await evaluate("({ active: document.activeElement.id, disabled: document.getElementById('custom-amount').disabled, outline: getComputedStyle(document.getElementById('custom-amount')).outlineWidth })");
    assert(focusState.active === "custom-amount" && parseFloat(focusState.outline) >= 2, `Milk input keyboard focus is unclear: ${JSON.stringify(focusState)}`);
    await noOverflow(); await screenshot("phone-tracker-fields.png");
    await click("Goals & measurements");
    await waitFor("!!document.getElementById('daily-goal')");
    await evaluate("document.querySelector('.daily-details').scrollIntoView({ block: 'start' })");
    await noOverflow(); await screenshot("phone-tracker-details.png");
    await click("Close goals & measurements");
    await evaluate("window.scrollTo(0, 0)");
    await evaluate("document.querySelector('[aria-label=\"Delete milk entry 1\"]').click()");
    await waitFor("document.body.innerText.includes('Confirm delete')");
    await click("Keep record");
    for (const width of [320, 390, 420, 421, 480, 600, 820, 1280]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 821 });
      await stableLogActions(width);
      if (width === 390 || width === 480) {
        await evaluate("window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })");
        await screenshot(`log-buttons-${width}.png`);
      }
    }
    await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await noOverflow(); await screenshot("desktop-tracker.png");
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await click("Settings"); await waitFor("document.querySelector('dialog')?.open");
    await evaluate("document.getElementById('dark-mode-toggle').click()");
    await waitFor("document.documentElement.dataset.theme === 'dark'");
    await waitFor("document.getElementById('household-name')?.disabled === false");
    assert(await evaluate("localStorage.getItem('milk-tracker-theme') === 'dark'"), "Dark mode is not saved");
    assert(await evaluate("getComputedStyle(document.querySelector('.settings-drawer')).backgroundColor === 'rgb(27, 32, 43)'"), "Dark mode stylesheet not loaded");
    await screenshot("phone-settings-dark.png");
    await click("Close"); await screenshot("phone-tracker-dark.png");
    await evaluate("document.getElementById('custom-amount').focus(); document.querySelector('.custom-entry-grid').scrollIntoView({ block: 'center' })");
    await noOverflow(); await screenshot("phone-tracker-fields-dark.png");
    await command("Page.navigate", { url: base });
    await waitFor("document.body.innerText.includes('Weekly totals')");
    assert(await evaluate("document.documentElement.dataset.theme === 'dark'"), "Dark mode is lost on reload");
    await noOverflow(); await screenshot("phone-calendar-dark.png");
    assert(await evaluate("!document.querySelector('#selected-baby-name') && !document.querySelector('#new-baby-name')"), "Baby-name entry is visible outside settings");
    await click("Settings"); await waitFor("document.querySelector('dialog')?.open && !!document.querySelector('#selected-baby-name')");
    assert(await evaluate("!!document.querySelector('dialog #settings-baby')"), "Baby selection is not available in Settings");
    await evaluate("document.getElementById('dark-mode-toggle').click()");
    await waitFor("document.documentElement.dataset.theme === 'light'");
    await click("Log out"); await waitFor("document.body.innerText.includes('Register')");
    await click("Register");
    assert(await evaluate("!document.body.innerText.includes('Baby name') && !document.querySelector('input[placeholder=\"Baby\"]')"), "Registration still asks for baby name");
    await evaluate("sessionStorage.setItem('review-setup-mode', 'true')");
    await command("Page.navigate", { url: base });
    await waitFor("!!document.getElementById('setup-household')");
    await noOverflow(); await screenshot("phone-setup.png");
    await evaluate("(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; for (const [id, value] of [['setup-household', 'Chen family'], ['setup-baby', 'Aria Rose']]) { const input = document.getElementById(id); setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); } })()");
    await click("Save & start tracking");
    await waitFor("document.body.innerText.includes('Weekly totals') && document.body.innerText.includes('Aria Rose')");
    await command("Page.navigate", { url: base });
    await waitFor("document.body.innerText.includes('Weekly totals')");
    assert(await evaluate("!document.getElementById('setup-household')"), "Completed setup repeats on reload");
    await command("Page.navigate", { url: `${base.replace(/\/$/, "")}/join/sample-token` });
    await waitFor("document.body.innerText.includes('Join Household')");
    await click("Join Household");
    await waitFor("document.body.innerText.includes('Weekly totals')");
    if (reviewPages) {
      const session = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(`sb-${projectRef}-auth-token`)}))`);
      const hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: "3600", token_type: "bearer" });
      await command("Page.navigate", { url: `${base}#${hash}` });
      await waitFor("document.body.innerText.includes('Weekly totals')");
      assert(await evaluate("!location.hash.includes('access_token')"), "OAuth callback fragment was not processed");
    }
    assert.deepStrictEqual(errors, [], "Browser runtime errors");
    console.log("Browser checks passed: phone/desktop layouts, visible Settings controls, shared preferences, light/dark modes, first-login setup and saved completion, caregiver controls, tracking, time corrections for all four log types, and consistent log button alignment at eight screen widths. Supabase requests use sample records only.");
    console.log(`Screenshots: ${folder}`);
  } finally { socket?.close(); browser.kill(); preview?.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });

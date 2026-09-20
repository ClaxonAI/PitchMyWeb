// PM2 process list for the production box (EC2 t3.large, ap-south-1).
//
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup     # survive a reboot
//
// Secrets are NOT defined here — this file is committed. The processes read
// their configuration from the environment PM2 inherits; see
// docs/production-setup.md for loading it from SSM Parameter Store.
//
// All seven entries matter. The three web services are the visible half; if
// any of the four workers is missing the dashboard still looks healthy while
// campaigns quietly stop moving:
//   whatsapp   nothing sends
//   discovery  searches sit queued forever
//   recorder   no demo videos, so pitches have nothing to link to
//   jobs       stuck runs never expire and failed pitches are never retried
//
// max_memory_restart budgets fit 8 GB with room for the OS and nginx. The
// recorder gets by far the largest share because it drives headless Chromium.

const base = {
  exec_mode: "fork",
  instances: 1,
  autorestart: true,
  max_restarts: 10,
  restart_delay: 4000,
  merge_logs: true,
  time: true,
};

const web = (name, cwd, maxMemory) => ({
  ...base,
  name,
  cwd,
  script: "npm",
  args: "start",
  max_memory_restart: maxMemory,
});

const worker = (name, cwd, maxMemory, extra = {}) => ({
  ...base,
  name,
  cwd,
  script: "npm",
  args: "start",
  max_memory_restart: maxMemory,
  ...extra,
});

module.exports = {
  apps: [
    // --- public web services (nginx terminates TLS in front of these) ------
    web("pmw-web", "./apps/web", "600M"), // :3000  pitchmyweb.in
    web("pmw-api", "./apps/api", "600M"), // :4000  api.pitchmyweb.in
    web("pmw-sites", "./apps/sites", "450M"), // :3200  sites.pitchmyweb.in

    // --- background workers ------------------------------------------------
    // Holds a live WhatsApp socket per linked account. Safe to restart: auth
    // state lives encrypted in Postgres, not on this disk.
    worker("pmw-whatsapp", "./apps/whatsapp-worker", "600M"),

    worker("pmw-discovery", "./apps/discovery-worker", "450M"),

    // Headless Chromium. By far the heaviest process here, and the one to look
    // at first if the box starts swapping.
    worker("pmw-recorder", "./apps/recorder-worker", "2048M", { kill_timeout: 30000 }),

    // Must stay a single instance: two schedulers would double every job run.
    worker("pmw-jobs", "./apps/api", "200M", { args: "run jobs" }),
  ],
};

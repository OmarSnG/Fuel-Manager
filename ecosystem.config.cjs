module.exports = {
  apps: [
    {
      name: "fuel-server",
      cwd: "./Server",
      script: "index.js",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      max_memory_restart: "800M",
      max_restarts: 10,
      min_uptime: "10s",
      error_file: "./logs/server-error.log",
      out_file: "./logs/server-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
    {
      name: "fuel-client",
      cwd: "./Client",
      script: "node_modules/serve/build/main.js",
      args: "-s dist -l tcp://0.0.0.0:5173 --no-clipboard",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
      max_restarts: 10,
      min_uptime: "10s",
      error_file: "./logs/client-error.log",
      out_file: "./logs/client-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};

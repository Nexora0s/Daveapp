module.exports = {
  apps: [{
    name: "daveapp-backend",
    script: "./server/server.js",
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: 3001
    },
    error_file: "./server/data/pm2-error.log",
    out_file: "./server/data/pm2-out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
}

module.exports = {
  apps: [
    {
      name: "feefree",
      script: "node_modules/next/dist/bin/next",
      args: "dev --port 3001",
      cwd: "C:\\FeeFreeOrderingSystems",
      interpreter: "node",
      env: {
        NODE_ENV: "development",
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};

module.exports = {
  apps: [
    {
      name: "kicyoudaikou",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "/var/www/kicyoudaikou",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};

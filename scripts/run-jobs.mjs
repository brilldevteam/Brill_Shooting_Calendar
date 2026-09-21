import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.APP_URL || !process.env.CRON_SECRET)
  throw new Error("APP_URL and CRON_SECRET are required");
const response = await fetch(`${process.env.APP_URL}/api/jobs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});
if (!response.ok) throw new Error(`Worker failed (${response.status})`);
console.log(await response.json());

import { exec } from "child_process";

const p = exec("npm run dev -- --host 0.0.0.0", { shell: true });

p.stdout.on("data", data => console.log(data));
p.stderr.on("data", data => console.error(data));

process.on("SIGINT", () => p.kill());

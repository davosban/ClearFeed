import { spawn } from "child_process";

const child = spawn("node", ["server.ts"], {
  env: { ...process.env, PORT: "3003", NODE_ENV: "production" }
});

child.stdout.on("data", (data) => console.log(data.toString()));
child.stderr.on("data", (data) => console.log("STDERR:", data.toString()));
child.on("close", (code) => console.log("Exited with code", code));

setTimeout(() => {
  child.kill();
  process.exit(0);
}, 3000);

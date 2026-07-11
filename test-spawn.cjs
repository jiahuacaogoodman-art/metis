const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const outputFile = path.join(process.cwd(), "test-subagent.log");
const outFd = fs.openSync(outputFile, "a");

const child = spawn("node", ["dist/cli.js", "--print", "Please execute the following task, and provide a final summary report:", "echo hello"], {
	cwd: process.cwd(),
	detached: true,
	stdio: ["ignore", outFd, outFd],
	env: { ...process.env, METIS_OFFLINE: "1" }
});

fs.closeSync(outFd);

child.on("close", () => {
	const content = fs.readFileSync(outputFile, "utf-8");
	console.log("File content length:", content.length);
	console.log("File content:", content);
});

<p align="center">
  <img src="src/modes/interactive/assets/metis-pixel-mark.svg" width="144" alt="Metis pixel mark" />
</p>

<p align="center">
  <strong>Help coding models finish work faster, remember what matters, and verify the result.</strong>
</p>

<p align="center">
  <a href="#why-metis">Why Metis</a> ·
  <a href="#what-makes-it-reliable">Reliability</a> ·
  <a href="#quick-start">Quick start</a>
</p>

---

## Why Metis

Metis is an agent layer for coding models. It does not replace the model. It gives the model a better way to search, remember, work, and check its own result.

That means less time spent repeating context, fewer missed requirements, and more completed tasks.

<p align="center">
  <img src="docs/images/metis-speed.svg" width="100%" alt="User test comparing Metis and OpenCode task completion time" />
</p>

In one user test with the same task:

- **Metis finished in 1 minute 30 seconds.**
- **OpenCode finished in 3 minutes 30 seconds.**
- No accuracy difference was observed in that test.

Metis used about 57% less time in this comparison. This is one user test, not a universal benchmark; results depend on the task, model, tools, and environment.

## What makes it reliable

<p align="center">
  <img src="docs/images/metis-capabilities.svg" width="100%" alt="Metis memory, Dream, search, and verification features" />
</p>

### Memory and Lessons

Metis checks its brain map before starting technical work. It can reuse relevant decisions, project knowledge, and technical lessons from earlier sessions instead of rediscovering them every time.

### Dream

Dream reviews completed work and consolidates useful notes into structured memories and lessons. Temporary task context becomes reusable knowledge, while low-value details can be cleaned up.

### Search before action

Metis investigates before making changes. It searches the repository first and uses web research when needed to check authoritative documentation, known solutions, release notes, or security information.

### Logs and verification

Metis records meaningful errors and completion summaries. Before it says a task is finished, it compares the result with the user's original prompt and checks every requirement, constraint, and later clarification. It also runs relevant builds, tests, and functional checks when available.

Together, these behaviors help the same coding model work with better context, fewer assumptions, and a stronger completion loop.

## How it works

<p align="center">
  <img src="docs/images/metis-workflow.svg" width="100%" alt="Metis workflow: Understand, Build, Verify" />
</p>

1. **Understand** — read the request, recall relevant lessons, and investigate the codebase.
2. **Build** — make focused changes and keep a useful work record.
3. **Verify** — test the result and compare it with the original request.

## Quick start

Requires Node.js `>=22.19.0` and npm.

```bash
git clone https://github.com/Wholiver/metis.git
cd metis
npm install
npm run build
node dist/cli.js
```

To see available options:

```bash
node dist/cli.js --help
```

<details>
<summary><strong>Developer information</strong></summary>

### Interfaces

Metis supports an interactive terminal, print and JSON output, RPC integration, and an SDK for Node.js applications.

The package exports the SDK from `@wholiver_hu/metis` and the RPC entry point from `@wholiver_hu/metis/rpc-entry`.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript and copy runtime assets. |
| `npm test` | Run the Vitest test suite. |
| `npm run clean` | Remove compiled output. |
| `npm run build:binary` | Build the standalone binary. |

</details>

## License

Distributed under the [MIT License](LICENSE).

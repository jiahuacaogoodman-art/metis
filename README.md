<p align="center">
  <img src="src/modes/interactive/assets/metis-pixel-mark.svg" width="144" alt="Metis pixel mark" />
</p>

<p align="center">
  A terminal-first coding agent for understanding repositories,<br />
  making focused changes, and validating results.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#workflow">Workflow</a> ·
  <a href="#capabilities">Capabilities</a> ·
  <a href="#interfaces">Interfaces</a> ·
  <a href="#development">Development</a>
</p>

---

## Overview

Metis works where code lives: inside a repository, alongside its files, tools, and tests. It combines file operations, shell execution, session management, and an interactive terminal workflow in one CLI.

The goal is a practical coding loop: inspect before acting, keep changes scoped, and validate the result with the repository's own tooling.

## Quick start

Requires Node.js `>=22.19.0` and npm.

```bash
git clone https://github.com/Wholiver/metis.git
cd metis
npm install
npm run build
```

Start Metis from the repository:

```bash
node dist/cli.js
```

View available command-line options:

```bash
node dist/cli.js --help
```

## Workflow

Metis grounds each task in repository context, carries it through focused implementation, then closes the loop with validation.

<p align="center">
  <img src="docs/images/metis-workflow.svg" width="100%" alt="Metis workflow: Understand, Build, Verify" />
</p>

The workflow stays consistent across small fixes, larger features, and exploratory repository work. Each phase uses evidence from the codebase rather than assumptions about it.

## Capabilities

Core tools stay close to the work: repository inspection, command execution, agent coordination, and reviewable output.

<p align="center">
  <img src="docs/images/metis-capabilities.svg" width="100%" alt="Metis core capabilities" />
</p>

Metis can read, search, create, and edit files; run shell commands; manage coding sessions and bounded subagent work; and export artifacts for review or follow-up.

## Interfaces

Use the same agent workflow through the interface that fits your environment.

<p align="center">
  <img src="docs/images/metis-modes.svg" width="100%" alt="Interactive, Print and JSON, RPC, and SDK interfaces" />
</p>

- **Interactive** provides a guided terminal experience for hands-on coding sessions.
- **Print and JSON** support scripts, pipelines, and machine-readable automation.
- **RPC** provides an entry point for process integration and external orchestration.
- **SDK** embeds Metis in another Node.js application.

The package exports the SDK from `@wholiver_hu/metis` and the RPC entry point from `@wholiver_hu/metis/rpc-entry`.

## Development

Install dependencies once with `npm install`, then use the project scripts below.

### Common commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Remove `dist/`, compile TypeScript, and copy runtime assets. |
| `npm test` | Run the Vitest test suite. |
| `npm run clean` | Remove compiled output. |
| `npm run shrinkwrap` | Regenerate the package shrinkwrap. |
| `npm run build:binary` | Build the standalone binary and bundled assets. |

### Project layout

```text
src/          CLI, agent workflow, terminal UI, and core features
docs/         User and developer documentation
examples/     Example extensions and integrations
test/         Automated tests and fixtures
vendor/       Bundled local dependencies
dist/         Generated build output
```

## Contributing

Keep changes focused and aligned with existing project patterns. When behavior changes, add or update tests and run the most relevant validation before opening a pull request. For larger work, begin with an issue or short proposal to align on direction.

## License

Distributed under the [MIT License](LICENSE).

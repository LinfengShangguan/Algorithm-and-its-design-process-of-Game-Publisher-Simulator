# Game-Publisher-Simulator

A standalone TypeScript simulation algorithm in project **Game Publisher Simulator alpha.4**

This is a game rules model, not a tool for predicting actual industry sales.

##How to Run?

Environment：Node.js 24、pnpm 11.19.0。

```sh
pnpm install --frozen-lockfile
pnpm check
```

You can also run the following commands separately：

```sh
pnpm typecheck
pnpm test
pnpm demo
```

This example simulates quote generation, waiting for a response, contract signing, and early release, running through Day 120 and outputting the company’s cash, sales volume, and accounts receivable. It demonstrates how to use the interface and does not represent a recommended business strategy. 

## Project Structure

| Path | Content |
| --- | --- |
| src/domain | Types, structural validation, amounts, and calendar |
| src/config | Raw parameter baselines |
| src/simulation | Deterministic randomization, proposals, contracts, development, sales, and finance |
| src/application/projection.ts | Restricted data view provided to players |
| src/infrastructure/save-store.ts | Optional Node.js archive adapter |
| src/index.ts | Public entry point for simulation algorithms |
| src/node.ts | Public entry point for Node.js archive |
| examples/career.ts | Runnable business process example |
| tests | Unit, integration, and fixed-seed regression tests |

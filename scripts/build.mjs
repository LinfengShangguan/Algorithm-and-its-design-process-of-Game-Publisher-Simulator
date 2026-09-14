import {build} from 'esbuild';
await build({entryPoints:{index:'src/index.ts',node:'src/node.ts',demo:'examples/career.ts'},outdir:'dist',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',sourcemap:true});

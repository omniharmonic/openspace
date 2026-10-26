#!/usr/bin/env node
import { processIo } from "./io";
import { run } from "./program";

process.exitCode = await run(process.argv.slice(2), processIo());

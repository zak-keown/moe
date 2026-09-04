import { getMemoryDataDir } from "./paths.js";
import { abortRollback } from "./rollback/abort.js";
import { prepareRollback } from "./rollback/prepare.js";
import { RollbackStateError, readRollbackState } from "./rollback/state.js";

const HELP = `moe-memory rollback - manage rollback to a previous version

USAGE:
  moe-memory rollback <subcommand> [options]

SUBCOMMANDS:
  prepare --to <version>   Prepare a safe rollback (currently only 0.1.5)
  abort                    Abort a pending rollback (only before swap)
  status                   Show current rollback state

OPTIONS:
  --to <version>   Target version for rollback (required for prepare)
  --help, -h       Show this help message
`;

export async function runRollback(args: string[]): Promise<number> {
  const subcommand = args[0];

  switch (subcommand) {
    case "prepare": {
      const toIndex = args.indexOf("--to");
      if (toIndex === -1 || toIndex + 1 >= args.length) {
        console.error("Error: --to <version> is required for rollback prepare");
        return 1;
      }
      const targetVersion = args[toIndex + 1]!;

      try {
        console.log(`Preparing rollback to ${targetVersion}...`);
        const result = prepareRollback({ to: targetVersion });
        console.log(`Rollback ${result.phase}.`);
        if (result.phase === "swapped") {
          console.log(`Active database: ${result.activeDatabase}`);
          console.log(`Retained v3 database: ${result.retainedV3Database}`);
          console.log(`\nThe database is now safe for the 0.1.5 runtime.`);
          console.log(`Downgrade the host plugin to complete the rollback.`);
        }
        return 0;
      } catch (error) {
        if (error instanceof RollbackStateError) {
          console.error(`Rollback error [${error.code}]: ${error.message}`);
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        return 1;
      }
    }

    case "abort": {
      try {
        const result = abortRollback();
        console.log(result.message);
        return result.aborted ? 0 : 0;
      } catch (error) {
        if (error instanceof RollbackStateError) {
          console.error(`Abort error [${error.code}]: ${error.message}`);
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        return 1;
      }
    }

    case "status": {
      const dataDir = getMemoryDataDir();
      const state = readRollbackState(dataDir);
      if (!state) {
        console.log("No rollback in progress.");
      } else {
        console.log(`Rollback state:`);
        console.log(`  Phase: ${state.phase}`);
        console.log(`  Database ID: ${state.databaseId}`);
        console.log(`  Staged database: ${state.stagedDatabase}`);
        console.log(`  Retained v3: ${state.retainedV3Database}`);
      }
      return 0;
    }

    case "--help":
    case "-h":
    case "help":
    case undefined:
      console.log(HELP);
      return 0;

    default:
      console.error(`Unknown rollback subcommand: ${subcommand}`);
      console.error("Try: moe-memory rollback --help");
      return 1;
  }
}

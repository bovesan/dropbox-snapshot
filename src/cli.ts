import commander from 'commander';
import environment from './config';
import DSnapshot from './index';

function runPromiseAndExit(promise: Promise<any>) {
    let keepAlive = setInterval(() => {
        // process.stdout.write('.');
    }, 1000);
    promise.then(() => {
        process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exit(1);
    }).finally(() => {
        clearInterval(keepAlive);
    });
}

const program = new commander.Command();
program
    .version('1.0.0')
    .description("Downloads and creates local snapshots of a user's Dropbox account.")
    .option('-c, --configPath <path>', 'Config file path.', environment.config_path)
    // .option('-l, --localRoot <path>', 'Local root folder.')
    // .option('-r, --rotations', 'Maximum number of local snapshots before the oldest will be discarded.')
    // .option('-v, --verbose', 'Verbose output.')
    // .option('-d, --debug', 'Extra verbose output.')
    // .option('-n, --do-nothing', 'Do not write anything to disk. Only show what would be done.')
    // .option('-o, --own', 'Only download files owned by current Dropbox user.')
    // .option('-a, --all', 'Download all files in shared resources (opposite of -o).')
    // .arguments('[remoteFolders...]');

program
    .command('authenticate')
    .description('Authenticate dropbox user.')
    .action(function(cmd, options) {
        runPromiseAndExit(new DSnapshot(console.log, program as any).authenticate());
    });

program
    .command('status')
    .description('Show remote and local status.')
    .action(function(cmd, options) {
        runPromiseAndExit(new DSnapshot(console.log, program as any).status());
    });

program
    .command('config <key> [newValue]')
    .description('Get or set a config value')
    .action(function(key, newValue) {
        new DSnapshot(console.log, program as any).configure(key, newValue);
    });

program
    .command('snapshot')
    .description('Create a new snapshot and download updated files.')
    .action(function(cmd, options) {
        runPromiseAndExit(new DSnapshot(console.log, program as any).snapshot());
    });

program.parse(process.argv);
if (process.argv.length < 3) {
    program.outputHelp();
}
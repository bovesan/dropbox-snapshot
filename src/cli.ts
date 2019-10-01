import commander from 'commander';
import environment from './config';
import DSnapshot from './index';
import { Status } from './index';
import prettyBytes from 'pretty-bytes';
import log from './log';
import { etl } from './stats';

// const log = Debug('cli');

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

function monitor(status: Status){
    const line = '  ' + Object.entries(status).map(([key, value]) => {
        if (value.status) {
            return key + ': '+(value.status).padEnd(50);
        }
        if (value.progress) {
            return key + ': ' + ((value.progress * 100).toPrecision(3) + '%').padEnd(10) + ' ETL: ' + (etl(value.starttime, value.updatetime, value.progress).padEnd(20));
        }
    }).join('') + (`Memory usage: ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(20)) + '\r';
    process.env.linebuffer = line;
    process.stdout.write(line)
}

const program = new commander.Command();
program
    .version('1.0.0')
    .description("Downloads and creates local snapshots of a user's Dropbox account.")
    .option('-c, --configPath <path>', 'Config file path.', environment.config_path)
    // .option('-l, --localRoot <path>', 'Local root folder.')
    .option('-r, --remoteFolder <path>', 'Only process this remote folder')
    // .option('-r, --rotations', 'Maximum number of local snapshots before the oldest will be discarded.')
    .option('-v, --verbose', 'Verbose output.', ()=>log.enable('verbose'))
    .option('-d, --debug', 'Extra verbose output.', () => log.enable('verbose').enable('debug'))
    // .option('-n, --do-nothing', 'Do not write anything to disk. Only show what would be done.')
    // .option('-o, --own', 'Only download files owned by current Dropbox user.')
    // .option('-a, --all', 'Download all files in shared resources (opposite of -o).')
    // .arguments('[remoteFolder...]');

program
    .on

program
    .command('authenticate')
    .description('Authenticate dropbox user.')
    .action(function(cmd, options) {
        runPromiseAndExit(new DSnapshot(program as any, monitor).authenticate());
    });

program
    .command('info')
    .description('Show remote and local information.')
    .action(function(cmd, options) {
        runPromiseAndExit(new DSnapshot(program as any, monitor).info());
    });

program
    .command('config <key> [newValue]')
    .description('Get or set a config value')
    .action(function(key, newValue) {
        new DSnapshot(program as any, monitor).configure(key, newValue);
    });

program
    .command('snapshot')
    .description('Create a new snapshot and download updated files.')
    .action(function(cmd, options) {
        runPromiseAndExit(new DSnapshot(program as any, monitor).snapshot());
    });

program.parse(process.argv);
if (process.argv.length < 3) {
    program.outputHelp();
}
import commander from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Dropbox from 'dropbox';
import prettyBytes from 'pretty-bytes';
import fetch from 'isomorphic-fetch';
import { getToken } from './authenticate';
import environment from './config';
import * as diskusage from 'diskusage';
import prompt from './prompt';
import bfj from 'bfj';

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
interface Config {
    token: string,
    localRoot: string,
    rotations: number,
    // remoteFolders: string[],
    [key: string]: any,
}
interface Job {
    bytesIndexed: 0,
    bytesTotal: number,
    cursor?: Dropbox.files.ListFolderCursor,
    remoteIndex: any[],
    startTime: number,
    timestamp: string,
}
class Client {
    dropbox: DropboxTypes.Dropbox;
    authenticated = false;
    configPath: string;
    config: Config;
    _job?: Job;
    log: (string?: string) => void;
    // remoteIndex: {
    //     path: string,
    //     size?: number,
    //     date?: string,
    //     hash?: string,
    // }[] = [];
    constructor(log: (string?: string) => void , { configPath }: { configPath: string }) {
        this.log = log;
        this.configPath = configPath;
        if (fs.existsSync(this.configPath)) {
            this.config = JSON.parse(fs.readFileSync(this.configPath).toString());
        } else {
            this.config = {} as Config;
        }
        this.dropbox = new Dropbox.Dropbox({ clientId: environment.clientId, fetch });
    }
    configure(key: string, newValue?: string){
        if (newValue !== undefined) {
            if (['rotations'].includes(key)) {
                this.config[key] = parseInt(newValue);
            } else {
                this.config[key] = newValue;
            }
            fs.mkdirSync(path.dirname(this.configPath), {
                recursive: true,
                mode: 0o700,
            });
            if (fs.existsSync(this.configPath)) {
                const configOnDisk = JSON.parse(fs.readFileSync(this.configPath).toString());
                configOnDisk[key] = newValue;
                fs.writeFileSync(this.configPath, JSON.stringify(configOnDisk, null, '\t'));
            } else {
                fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, '\t'));
            }
        } else if (this.config[key]){
            this.log(this.config[key]);
        } else {
            this.log(`${key} is not configured`);
        }
    }
    validateConfig() {
        let errors: string[] = [];
        if (!this.config.localRoot) {
            errors.push('localRoot not set. Please run dsnapshot config localRoot <path>');
        }
        if (!this.config.token) {
            errors.push('No access token set. Please run dsnapshot authenticate or set token manually with dsnapshot config token <token>');
        } else {
            this.dropbox.setAccessToken(this.config.token);
        }
        if (errors.length > 0){
            errors.forEach(line => {
                this.log(line);
            })
            process.exit(2);
        }
    }
    authenticate() {
        return new Promise(async (resolve, reject) => {
            if (!this.config.token) {
                return getToken(this.dropbox).then((token) => {
                    this.configure('token', token);
                });
            }
        }).then(() => {
            this.dropbox.setAccessToken(this.config.token);
            return this.dropbox.usersGetCurrentAccount().then(user => {
                this.log('Authenticated as: ' + user.name.display_name);
                this.authenticated = true;
            });
        });
    }
    status() {
        this.validateConfig();
        const promises: Promise<string>[] = [];
        promises.push(this.dropbox.usersGetCurrentAccount().then(data => {
            return 'Dropbox account: ' + data.name.display_name;
        }));
        promises.push(this.dropbox.usersGetSpaceUsage().then(data => {
            return 'Remote usage: ' + prettyBytes(data.used);
        }));
        promises.push(diskusage.check(this.config.localRoot).then(data => {
            const used = data.total - data.free;
            return `Local usage: ${prettyBytes(used)}/${prettyBytes(data.total)} (${((used/data.total)*100).toPrecision(4)}%)`;
           }));
        return Promise.all(promises).then((lines)=>{
            lines.forEach(line => {
                this.log(line);
            })
        });
    }
    get job(): Job {
        if (!this._job) {
            const startTime = Date.now();
            const timestamp = new Date(startTime).toISOString().split('T')[0];
            this._job = {
                bytesTotal: 0,
                bytesIndexed: 0,
                startTime,
                timestamp,
                remoteIndex: [],
            }
            fs.writeFileSync(this.jobPath, JSON.stringify(this._job, null, 2));
            this.log('Job '.padEnd(20) + this.jobPath);
        }
        return this._job;
    }
    get jobPath() {
        return path.join(this.config.localRoot, this.job.timestamp + '.job');
    }
    get indexPath() {
        return path.join(this.config.localRoot, this.job.timestamp + '.index');
    }
    mapRemote() {
        this.validateConfig();
        const job = this.job;
        return new Promise(async (resolve, reject) => {
            this.job.bytesTotal = await this.dropbox.usersGetSpaceUsage().then(data => data.used);
            let listFolderResult: Dropbox.files.ListFolderResult | undefined;
            while (!listFolderResult || listFolderResult.has_more) {
                try {
                    if (job.cursor) {
                        listFolderResult = await this.dropbox.filesListFolderContinue({
                            cursor: job.cursor,
                        });
                    } else {
                        listFolderResult = await this.dropbox.filesListFolder({
                            path: '/Hangover',
                            recursive: true,
                        });
                    }
                    job.cursor = listFolderResult!.cursor;
                    listFolderResult.entries.forEach((entry: any) => {
                        if (entry.size) {
                            job.bytesIndexed += (entry as Dropbox.files.FileMetadataReference).size;
                        }
                    });
                    job.remoteIndex.push(...listFolderResult.entries);
                    // const timeSpent = Date.now() - startTime;
                    // const timeLeft = timeSpent * (1.0 - bytesIndexed / bytesUsed);
                    process.stdout.write('\rMapping remote'.padEnd(21) + (`${((job.bytesIndexed / job.bytesTotal) * 100).toPrecision(3)}%`).padEnd(20) + `Memory usage ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(30));
                    // process.stdout.write(`\rGetting remote file info: ${prettyBytes(bytesIndexed)} / ${prettyBytes(bytesUsed)} ${((bytesIndexed / bytesUsed) * 100).toPrecision(3)}%. Memory usage: ${prettyBytes(process.memoryUsage().heapUsed)}     `);
                } catch (error) {
                    reject(error);
                }
            }
            process.stdout.write('\rMapping remote'.padEnd(21) + '100%'.padEnd(50));
            this.log();
            fs.writeFileSync(this.jobPath, JSON.stringify(job, null, 2));
            await bfj.write(this.indexPath, job.remoteIndex).catch(error => reject(error));
            resolve();
        });
    }
    snapshot() {
        this.validateConfig();
        const job = this.job;
        const promises: Promise<any>[] = [];
        promises.push(this.mapRemote());
        return Promise.all(promises);
    }
    // async wait() {
    //     return Promise.all(this.promises);
    // }
    
}

if (require.main === module) {
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
            runPromiseAndExit(new Client(console.log, program as any).authenticate());
        });

    program
        .command('status')
        .description('Show remote and local status.')
        .action(function(cmd, options) {
            runPromiseAndExit(new Client(console.log, program as any).status());
        });

    program
        .command('config <key> [newValue]')
        .description('Get or set a config value')
        .action(function(key, newValue) {
            new Client(console.log, program as any).configure(key, newValue);
        });

    program
        .command('snapshot')
        .description('Create a new snapshot and download updated files.')
        .action(function(cmd, options) {
            runPromiseAndExit(new Client(console.log, program as any).snapshot());
        });

    program.parse(process.argv);
    if (process.argv.length < 3) {
        program.outputHelp();
    }
}

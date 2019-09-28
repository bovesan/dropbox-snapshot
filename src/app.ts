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
    [key: string]: any,
}
class Client {
    dropbox: DropboxTypes.Dropbox;
    authenticated = false;
    configPath: string;
    config: Config;
      // promises: Promise<any>[] = [];
    constructor({configPath}: {configPath: string}) {
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
            this.config[key] = newValue;
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
            console.log(this.config[key]);
        } else {
            console.log(`${key} is not configured`);
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
                console.error(line);
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
                console.log('Authenticated as: ' + user.name.display_name);
                this.authenticated = true;
            });
        });
    }
    status() {
        this.validateConfig();
        const promises: Promise<string>[] = [];
        promises.push(this.dropbox.usersGetSpaceUsage().then(data => {
            return 'Remote usage: ' + prettyBytes(data.used);
        }));
        promises.push(diskusage.check(this.config.localRoot).then(data => {
            const used = data.total - data.free;
            return `Local usage: ${prettyBytes(used)}/${prettyBytes(data.total)} (${((used/data.total)*100).toPrecision(4)}%)`;
           }));
        return Promise.all(promises).then((lines)=>{
            lines.forEach(line => {
                console.log(line);
            })
        });
    }
    snapshot() {
        this.validateConfig();
        return this.dropbox.filesListFolder({ path: '' })
            .then(function(response) {
                console.log(response);
            })
            .catch(function(error) {
                console.log(error);
            });
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
        .option('-l, --localRoot <path>', 'Local root folder.')
        .option('-r, --rotations', 'Maximum number of local snapshots before the oldest will be discarded.')
        .option('-v, --verbose', 'Verbose output.')
        .option('-d, --debug', 'Extra verbose output.')
        .option('-n, --do-nothing', 'Do not write anything to disk. Only show what would be done.')
        .option('-o, --own', 'Only download files owned by current Dropbox user.')
        .option('-a, --all', 'Download all files in shared resources (opposite of -o).')
        .arguments('[remoteFolders...]');

    program
        .command('authenticate')
        .description('Authenticate dropbox user.')
        .action(function(cmd, options) {
            runPromiseAndExit(new Client(program as any).authenticate());
        });

    program
        .command('status')
        .description('Show remote and local status.')
        .action(function(cmd, options) {
            runPromiseAndExit(new Client(program as any).status());
        });

    program
        .command('config <key> [newValue]')
        .description('Get or set a config value')
        .action(function(key, newValue) {
            new Client(program as any).configure(key, newValue);
        });

    program
        .command('snapshot')
        .description('Create a new snapshot and download updated files.')
        .action(function(cmd, options) {
            runPromiseAndExit(new Client(program as any).snapshot());
        });

    program.parse(process.argv);
    if (process.argv.length < 3) {
        program.outputHelp();
    }
}

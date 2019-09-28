import commander from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Dropbox from 'dropbox';
import prettyBytes from 'pretty-bytes';
import fetch from 'isomorphic-fetch';
import authenticate from './authenticate';
import config from './config';

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

class Client {
    dropbox: DropboxTypes.Dropbox;
    authenticated = false;
      // promises: Promise<any>[] = [];
    constructor() {
        this.dropbox = new Dropbox.Dropbox({ clientId: config.clientId, fetch });
    }
    authenticate() {
        return authenticate(this.dropbox).then(() => {
            return this.dropbox.usersGetCurrentAccount().then(user => {
                console.log('Authenticated as: ' + user.name.display_name);
                this.authenticated = true;
            });
        });
    }
    status() {
        return this.authenticate().then(() => {
            const promises: Promise<string>[] = [];
            let remoteSpaceUsed;
            promises.push(this.dropbox.usersGetSpaceUsage().then(data => {
                return 'Remote space used: ' + prettyBytes(data.used);
            }));
            return Promise.all(promises).then((lines)=>{
                lines.forEach(line => {
                    console.log(line);
                })
            });
        });
    }
    snapshot() {
        return this.authenticate().then(() => {
            return this.dropbox.filesListFolder({ path: '' })
                .then(function(response) {
                    console.log(response);
                })
                .catch(function(error) {
                    console.log(error);
                });
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
        .option('-c, --config <path>', 'Config file path.', config.config_path)
        .option('-d, --destination <path>', 'Local root folder.')
        .option('-r, --rotations', 'Maximum number of local snapshots before the oldest will be discarded.')
        .option('-v, --verbose', 'Verbose output.')
        .option('-d, --debug', 'Extra verbose output.')
        .option('-n, --do-nothing', 'Do not write anything to disk. Only show what would be done.')
        .option('-o, --own', 'Only download files owned by current Dropbox user.')
        .option('-a, --all', 'Download all files in shared resources (opposite of -o).')
        .arguments('[remoteFolders...]');

    program
        .command('status')
        .description('Show remote and local status.')
        .action(function(cmd, options) {
            runPromiseAndExit(new Client().status());
        });

    program
        .command('snapshot')
        .description('Create a new snapshot and download updated files.')
        .action(function(cmd, options) {
            runPromiseAndExit(new Client().snapshot());
        });

    program.parse(process.argv);
    if (process.argv.length < 3) {
        program.outputHelp();
    }
}

import commander from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Dropbox from 'dropbox';
import fetch from 'isomorphic-fetch';
import { authorize } from './auth';
import config from './config';

//@ts-ignore
process.on('SIGINT', () => console.log(process._getActiveHandles()));

class Client {
    dropbox: DropboxTypes.Dropbox;
    auth: Promise<any>;
    // promises: Promise<any>[] = [];
    constructor() {
        this.dropbox = new Dropbox.Dropbox({ clientId: config.clientId, fetch });
        this.auth = authorize(this.dropbox).then(() => {
            console.log('Authorized')
        });
    }
    pull() {
        return Promise.all([this.auth]).then(() => {
            return this.dropbox.filesListFolder({ path: '' })
                .then(function(response) {
                    console.log(response);
                })
                .catch(function(error) {
                    console.log(error);
                });
        }).catch(error => {
            delete this.dropbox;
            console.log(error);
        });
    }
    // async wait() {
    //     return Promise.all(this.promises);
    // }
    
}

// const program = new commander.Command();
// program
//     .version('1.0.0')
//     .description("Downloads and creates local snapshots of a user's Dropbox account.")
//     .option('-c, --config <path>', 'Config file path.', config.config_path)
//     .option('-d, --destination <path>', 'Local root folder.')
//     .option('-r, --rotations', 'Maximum number of local snapshots before the oldest will be discarded.')
//     .option('-v, --verbose', 'Verbose output.')
//     .option('-d, --debug', 'Extra verbose output.')
//     .option('-n, --do-nothing', 'Do not write anything to disk. Only show what would be done.')
//     .option('-o, --own', 'Only download files owned by current Dropbox user.')
//     .option('-a, --all', 'Download all files in shared resources (opposite of -o).')
//     .arguments('[remoteFolders...]')
//     // .arguments('If specified, only these remote folders will be pulled.')
//     .parse(process.argv);

let keepAlive = setInterval(()=>{
    // process.stdout.write('.');
}, 1000);

new Client().pull().then(() => {
    process.exit(0);
}).catch(error => {
    console.error(error);
    process.exit(1);
}).finally(() => {
    clearInterval(keepAlive);
});

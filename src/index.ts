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
import Job from './job';
import Debug from 'debug';

const log = Debug('dsnapshot');
// log.log = function(...args: any[]){

// }

interface Config {
    token: string,
    localRoot: string,
    rotations: number,
    // remoteFolders: string[],
    [key: string]: any,
}
export interface Monitor {
    (status: Status): void
}
export interface Status {
    [key: string]: {
        progress?: number,
    },
}
export default class DSnapshot {
    dropbox: DropboxTypes.Dropbox;
    authenticated = false;
    configPath: string;
    config: Config;
    _job?: Job;
    status: Status = {};
    monitor?: Monitor;
    remoteFolder?: string;
    constructor({ configPath, remoteFolder }: { configPath: string, remoteFolder?: string }, monitor?: Monitor) {
        if (remoteFolder) {
            this.remoteFolder = remoteFolder;
            log('Remote folder: ' + remoteFolder)
        }
        this.monitor = monitor;
        this.configPath = configPath;
        if (fs.existsSync(this.configPath)) {
            this.config = JSON.parse(fs.readFileSync(this.configPath).toString());
        } else {
            this.config = {} as Config;
        }
        this.dropbox = new Dropbox.Dropbox({ clientId: environment.clientId, fetch });
    }
    get job(){
        if (!this._job){
            this._job = new Job(this.config.localRoot);
        }
        return this._job;
    }
    updateStatus(operation: string, key: 'progress', value: any){
        if (!this.monitor){
            return;
        }
        if (!this.status[operation]){
            this.status[operation] = {};
        }
        this.status[operation][key] = value;
        this.monitor(this.status);
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
            log(this.config[key]);
        } else {
            log(`${key} is not configured`);
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
                log(line);
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
                log('Authenticated as: ' + user.name.display_name);
                this.authenticated = true;
            });
        });
    }
    info() {
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
                log(line);
            })
        });
    }
    mapRemote() {
        this.validateConfig();
        const job = this.job;
        return new Promise(async (resolve, reject) => {
            this.job.bytesTotal = await this.dropbox.usersGetSpaceUsage().then(data => data.used);
            let listFolderResult: Dropbox.files.ListFolderResult | undefined;
            log(`Mapping remote (${prettyBytes(this.job.bytesTotal)})`)
            while (!listFolderResult || listFolderResult.has_more) {
                try {
                    if (job.cursor) {
                        listFolderResult = await this.dropbox.filesListFolderContinue({
                            cursor: job.cursor,
                        });
                    } else {
                        listFolderResult = await this.dropbox.filesListFolder({
                            path: this.remoteFolder || '',
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
                    this.updateStatus('Mapping remote', 'progress', job.bytesIndexed / job.bytesTotal);
                                        // const timeSpent = Date.now() - startTime;
                    // const timeLeft = timeSpent * (1.0 - bytesIndexed / bytesUsed);
                    // log('\rMapping remote'.padEnd(21) + (`${((job.bytesIndexed / job.bytesTotal) * 100).toPrecision(3)}%`).padEnd(20) + `Memory usage ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(30), true);
                    // process.stdout.write('\rMapping remote'.padEnd(21) + (`${((job.bytesIndexed / job.bytesTotal) * 100).toPrecision(3)}%`).padEnd(20) + `Memory usage ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(30));
                    // process.stdout.write(`\rGetting remote file info: ${prettyBytes(bytesIndexed)} / ${prettyBytes(bytesUsed)} ${((bytesIndexed / bytesUsed) * 100).toPrecision(3)}%. Memory usage: ${prettyBytes(process.memoryUsage().heapUsed)}     `);
                } catch (error) {
                    reject(error);
                }
            }
            // process.stdout.write('\rMapping remote'.padEnd(21) + '100%'.padEnd(50));
            // log('');
            fs.writeFileSync(this.job.jobPath, JSON.stringify(job, null, 2));
            await bfj.write(this.job.indexPath, job.remoteIndex).catch(error => reject(error));
            log('Remote map: ' + this.job.indexPath);
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

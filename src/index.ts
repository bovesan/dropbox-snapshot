import fs from 'fs';
import path from 'path';
import os from 'os';
import Dropbox from 'dropbox';
import prettyBytes from 'pretty-bytes';
import fetch from 'isomorphic-fetch';
import { getToken } from './sources/dropbox/authenticate';
import environment from './config';
import * as diskusage from 'diskusage';
import prompt from './prompt';
import Job from './job';
import https from 'https';
import http from 'http';
import log from './log';
import Stats from './stats';
import { humanDuration } from './stats';
import DropboxContentHasher from 'dropbox-api-content-hasher/js-node/dropbox-content-hasher';
// log.log = function(...args: any[]){

// }
function getHash(path: string) {
    return new Promise((resolve, reject) => {
        const hasher = DropboxContentHasher.create();
        const f = fs.createReadStream(path);
        f.on('data', function(buf) {
            hasher.update(buf);
        });
        f.on('end', function(err) {
            const hexDigest = hasher.digest('hex');
            resolve(hexDigest);
        });
        f.on('error', function(err) {
            reject("Error reading from file: " + err);
        });
    });
}

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
        starttime: number,
        updatetime: number,
        progress?: number,
        status?: string,
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
            log.info('Remote folder: ' + remoteFolder)
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
    get job() {
        if (!this._job) {
            this._job = new Job(this.config.localRoot);
        }
        return this._job;
    }
    updateStatus(operation: string, key: 'progress' | 'status', value: any) {
        if (!this.monitor) {
            return;
        }
        if (!this.status[operation]) {
            const time = Date.now();
            this.status[operation] = {
                starttime: time,
                updatetime: time,
            };
        }
        //@ts-ignore
        this.status[operation][key] = value;
        this.status[operation].updatetime = Date.now();
        this.monitor(this.status);
    }
    configure(key: string, newValue?: string) {
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
        } else if (this.config[key]) {
            log.info(this.config[key]);
        } else {
            log.info(`${key} is not configured`);
        }
    }
    validateConfig() {
        let errors: string[] = [];
        if (!this.config.localRoot) {
            errors.push('localRoot not set. Please run dsnapshot config localRoot <path>');
        } else {
            if (!fs.existsSync(this.config.localRoot)) {
                errors.push('localRoot does not exist: ' + this.config.localRoot);
            }
        }
        if (!this.config.token) {
            errors.push('No access token set. Please run dsnapshot authenticate or set token manually with dsnapshot config token <token>');
        } else {
            this.dropbox.setAccessToken(this.config.token);
        }
        if (errors.length > 0) {
            errors.forEach(line => {
                log.info(line);
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
                log.info('Authenticated as: ' + user.name.display_name);
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
            return `Local usage: ${prettyBytes(used)}/${prettyBytes(data.total)} (${((used / data.total) * 100).toPrecision(4)}%)`;
        }));
        return Promise.all(promises).then((lines) => {
            lines.forEach(line => {
                log.info(line);
            })
        });
    }
    mapRemote() {
        this.validateConfig();
        const job = this.job;
        return new Promise(async (resolve, reject) => {
            if (!job.mapComplete && fs.existsSync(job.mapPath)){
                job.readMap(itemsParsed => {
                    this.updateStatus('Reading map', 'progress', itemsParsed / job.mapLength);
                }, () => {
                    if (job.bytesIndexed !== job.bytesTotal){
                        reject('Stored map does not match job.bytesTotal');
                    } else {
                        resolve();
                    }
                });
            } else {
                this.job.bytesTotal = await this.dropbox.usersGetSpaceUsage().then(data => data.used);
                let listFolderResult: Dropbox.files.ListFolderResult | undefined;
                log.info(`Mapping remote (${prettyBytes(this.job.bytesTotal)})`)
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
                        job.map.push(...listFolderResult.entries);
                        this.updateStatus('Mapping remote', 'progress', job.bytesIndexed / job.bytesTotal);
                        // const timeSpent = Date.now() - startTime;
                        // const timeLeft = timeSpent * (1.0 - bytesIndexed / bytesUsed);
                        // log('\rMapping remote'.padEnd(21) + (`${((job.bytesIndexed / job.bytesTotal) * 100).toPrecision(3)}%`).padEnd(20) + `Memory usage ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(30), true);
                        // process.stdout.write('\rMapping remote'.padEnd(21) + (`${((job.bytesIndexed / job.bytesTotal) * 100).toPrecision(3)}%`).padEnd(20) + `Memory usage ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(30));
                        // process.stdout.write(`\rGetting remote file info: ${prettyBytes(bytesIndexed)} / ${prettyBytes(bytesUsed)} ${((bytesIndexed / bytesUsed) * 100).toPrecision(3)}%. Memory usage: ${prettyBytes(process.memoryUsage().heapUsed)}     `);
                    } catch (error) {
                        reject(error);
                    }
                    job.mapLength = job.map.length;
                }
                // process.stdout.write('\rMapping remote'.padEnd(21) + '100%'.padEnd(50));
                // log('');
                job.mapComplete = true;
                fs.writeFileSync(job.jobPath, JSON.stringify(job, null, 2));
                log.info(`Writing map to disk ...`)
                await job.writeMap().catch(error => reject(error));
                log.info('Wrote map: ' + job.mapPath);
                resolve();
            }
        });
    }
    processMap() {
        this.validateConfig();
        const job = this.job;
        return new Promise(async (resolve, reject) => {
            let bytesDownloadedTotal = 0;
            const stats = new Stats();
            stats.onUpdate = (value) => {
                const progress = value / job.bytesTotal;
                // log.debug(JSON.stringify({value, jobBytesTotal: job.bytesTotal, progress}));
                let status = (progress * 100).toPrecision(3) + '%';
                status += ' @ ' + prettyBytes(Math.floor(stats.lastMinute / 60)) + 'ps ETL: ' + stats.etl(progress);
                this.updateStatus('Resolving files', 'status', status);
            }
            while (job.processIndex < job.map.length) {
                const entry = job.map[job.processIndex];
                if (entry.path_display && entry.path_lower) {
                    const localPath = path.join(job.folder, entry.path_display!);
                    switch (entry['.tag']) {
                        case 'folder':
                            fs.mkdirSync(localPath, { recursive: true });
                            break;
                        case 'file':
                            if (fs.existsSync(localPath) && fs.statSync(localPath).size === entry.size) {
                                log.verbose(entry.path_display + ' Already resolved');
                                job.bytesProcessed += entry.size;
                                break;
                            }
                            log.debug(`${entry.path_display} ${entry.size} ${entry.server_modified}`);
                            if (job.previousSnapshot) {
                                const previousLocalPath = path.join(job.rootFolder, job.previousSnapshot, entry.path_display!);
                                if (fs.existsSync(previousLocalPath)) {
                                    const stat = fs.statSync(previousLocalPath);
                                    log.debug(`${entry.path_display} ${previousLocalPath} ${stat.size} ${stat.mtime.toISOString()}`);
                                    if (stat.size === entry.size) {
                                        if (stat.mtime.toISOString() === entry.server_modified) {
                                            log.verbose(`${entry.path_display} -> ${previousLocalPath}`);
                                            fs.link(previousLocalPath, localPath, () => { });
                                            job.bytesProcessed += entry.size;
                                            break;
                                        } else {
                                            log.debug(`${entry.path_display} Calculating content hash of existing file`);
                                            const previousHash = await getHash(previousLocalPath);
                                            if (previousHash === entry.content_hash) {
                                                log.debug(`${entry.path_display} content hash match`);
                                                log.verbose(`${entry.path_display} -> ${previousLocalPath}`);
                                                fs.link(previousLocalPath, localPath, () => {
                                                    const time = new Date(entry.server_modified);
                                                    log.debug(`${entry.path_display} correct time: ${entry.server_modified}`);
                                                    fs.utimes(localPath, time, time, () => { });
                                                });
                                                job.bytesProcessed += entry.size;
                                                break;
                                            } else {
                                                log.debug(`${entry.path_display} content hash mismatch: ${previousHash} != ${entry.content_hash}`);
                                            }
                                        }
                                    }
                                } else {
                                    log.debug(`${entry.path_display} Does not exist in previous snapshot.`);
                                }
                            }
                            log.verbose(`${entry.path_display} Downloading ${prettyBytes(entry.size)}`);
                            const metadata = {
                                server_modified: new Date(entry.server_modified),
                            }
                            await new Promise((resolveDownload: (value:number) => void, rejectDownload) => {
                                let downloadedBytes = 0;
                                const request = https.get('https://content.dropboxapi.com/2/files/download', {
                                    headers: {
                                        'Authorization': `Bearer ${this.config.token}`,
                                        'Dropbox-API-Arg': JSON.stringify({ path: entry.id }),
                                    },

                                }, (response) => {
                                    if (response.statusCode === 200) {
                                        log.debug(`${entry.path_display} Receiving ...`);
                                        fs.mkdirSync(path.dirname(localPath), { recursive: true });
                                        const writeStream = fs.createWriteStream(localPath);
                                        response.pipe(writeStream);
                                        response.on('data', data => {
                                            downloadedBytes += data.length;
                                            stats.log(job.bytesProcessed + downloadedBytes);
                                        });
                                        response.on('end', () => {
                                            log.debug(`${entry.path_display} received. Setting times.`);
                                            fs.utimes(localPath, metadata.server_modified, metadata.server_modified, () => { });
                                            resolveDownload(downloadedBytes);
                                        });
                                    } else if (response.statusCode){
                                        response.on('data', data => {
                                            log.info(entry.path_display+' '+data.toString());
                                            rejectDownload();
                                        });
                                    } else {
                                        log.info(entry.path_display+' No response from server.');
                                        rejectDownload();
                                    }
                                });
                            }).then(bytes => {
                                job.bytesProcessed += bytes;
                                bytesDownloadedTotal += bytes;
                            }).catch(error => {
                                job.bytesProcessed += entry.size;
                            });
                            break;

                        default:
                            // code...
                            break;
                    }
                }
                stats.log(job.bytesProcessed);
                job.processIndex++;
            }
            if (!job.mapComplete) {
                log.debug(`mapComplete: ${job.mapComplete} bytesIndexed: ${job.bytesIndexed}/${job.bytesTotal} map.length: ${job.map.length} processIndex: ${job.processIndex} Waiting for map to catch up.`)
                setTimeout(() => {
                    resolve(this.processMap());
                }, 1000);
            } else {
                if (job.bytesProcessed >= job.bytesTotal){
                    job.completeFolder();
                }
                log.info(`Resolved ${prettyBytes(job.bytesProcessed)} (${prettyBytes(bytesDownloadedTotal)} downloaded) in ${stats.elapsed}`);
                resolve();
            }
        });
    }
    snapshot() {
        this.validateConfig();
        const job = this.job;
        const promises: Promise<any>[] = [];
        promises.push(this.mapRemote());
        promises.push(this.processMap());
        return Promise.all(promises);
    }
    // async wait() {
    //     return Promise.all(this.promises);
    // }

}

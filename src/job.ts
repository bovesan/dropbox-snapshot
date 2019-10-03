import Dropbox from 'dropbox';
import fs from 'fs';
import path from 'path';
import bfj from 'bfj';
import log from './log';
import os from 'os';
import { readArray } from './arrayio';

export default class Job {
    rootFolder: string;
    bytesTotal = 0;
    bytesIndexed = 0;
    bytesProcessed = 0;
    cursor?: Dropbox.files.ListFolderCursor;
    map: (Dropbox.files.FileMetadataReference | Dropbox.files.FolderMetadataReference | Dropbox.files.DeletedMetadataReference)[] = [];
    startTime: number;
    timestamp: string;
    previousSnapshot?: string;
    mapComplete = false;
    mapLength = 0;
    processIndex = 0;
    folder: string;
    constructor(rootFolder: string) {
        process.on('SIGINT', ()=>{
            this.write();
            log.info('Aborted by user');
            process.exit(0);
        });
        this.rootFolder = rootFolder;
        this.startTime = Date.now();
        this.timestamp = new Date(this.startTime).toISOString().split('T')[0];
        if (fs.existsSync(this.jobPath)){
            this.read();
            log.info('Resuming existing job: ' + this.jobPath);
        } else {
            if (fs.existsSync(this.mapPath)) {
                log.info('Reading existing map: ' + this.mapPath);
                this.readMap();
            }
            const existingJobs = fs.readdirSync(rootFolder).sort();
            existingJobs.forEach(basename => {
                const filePath = path.join(rootFolder, basename);
                if (fs.statSync(filePath).isDirectory()) {
                    if (basename.endsWith('.incomplete')) {
                        log.debug('Incomplete snapshot: ' + basename);
                        return;
                    }
                    log.debug('Existing folder: ' + basename);
                    try {
                        const timestamp = basename.match(/^\d{4}\-\d{2}\-\d{2}/)![0];
                        if (timestamp === this.timestamp) {
                            // throw Error('A folder with this timestamp already exists: ' + basename);
                        } else {
                            this.previousSnapshot = basename;
                            log.verbose('Existing timestamp: ' + this.previousSnapshot);
                        }
                    } catch {
                        // Not a timestamped directory
                    }
                }
            });
            if (this.previousSnapshot) {
                log.info('Previous snapshot: ' + this.previousSnapshot);
            }
            this.write();
            this.folder = path.join(this.rootFolder, this.timestamp + '.incomplete');
            log.info('path: ' + this.jobPath);
        }
    }
    toJSON() {
        // return JSON.stringify(this, function(this, key, value){
        //     if (key === 'remoteIndex'){
        //         return undefined;
        //     } else {
        //         return value;
        //     }
        // }, spaces);
        const filtered = {};
        Object.entries(this).forEach(([key, value]) => {
            switch (key) {
                case 'map':
                // case 'mapLength':
                    return;
                
                default:
                    filtered[key] = value;
                    break;
            }
        });
        return filtered;
    }
    write() {
        fs.writeFileSync(this.jobPath, JSON.stringify(this, null, 2));
    }
    read() {
        Object.entries(JSON.parse(fs.readFileSync(this.jobPath).toString())).forEach(([key, value]) => {
            switch (key) {
                case 'mapComplete':
                    break;
                
                default:
                    this[key] = value;
                    break;
            }
        });
    }
    writeMap() {
        return bfj.write(this.mapPath, this.map);
    }
    readMap(onProgress: (itemsParsed: number) => void = () => { }, onEnd: () => void = () => { }) {
        this.map.length = 0;
        this.bytesIndexed = 0;
        this.mapComplete = false;
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(this.mapPath)){
                reject('Map does not exist: '+this.mapPath);
            }
            log.verbose('Copying map to tmp/ for reading, to avoid excessive seeking between map and resolve operations.');
            const tmpFile = path.join(os.tmpdir(), 'dsnapshot', this.mapPath);
            fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
            fs.copyFileSync(this.mapPath, tmpFile);
            return readArray(tmpFile, this.map, (bytesRead, itemsRead) => {
                this.bytesIndexed = bytesRead;
                onProgress(itemsRead);
            }).then(() => {
                this.bytesIndexed = this.bytesTotal;
                this.mapComplete = true;
                fs.unlinkSync(tmpFile);
                onEnd();
            });
        });
    }
    get jobPath() {
        return path.join(this.rootFolder, this.timestamp + '.job');
    }
    get mapPath() {
        return path.join(this.rootFolder, this.timestamp + '.map');
    }
    completeFolder(){
        const oldFolder = this.folder;
        this.folder = path.join(this.rootFolder, this.timestamp);
        fs.renameSync(oldFolder, this.folder);
        this.write();
    }
}

import Dropbox from 'dropbox';
import fs from 'fs';
import path from 'path';
import log from './log';

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
        this.rootFolder = rootFolder;
        this.startTime = Date.now();
        this.timestamp = new Date(this.startTime).toISOString().split('T')[0];
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
                        throw Error('A folder with this timestamp already exists: ' + basename);
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
        this.folder = path.join(this.rootFolder, this.timestamp+'.incomplete');
        log.info('path: ' + this.jobPath);
    }
    toJSON() {
        // return JSON.stringify(this, function(this, key, value){
        //     if (key === 'remoteIndex'){
        //         return undefined;
        //     } else {
        //         return value;
        //     }
        // }, spaces);
        return Object.entries(this).filter(([key, value]) => {
            return key !== 'map';
        }).reduce((map, [key, value]) => {
            (map as any)[key] = value;
            return map;
        }, {});
    }
    write(){
        fs.writeFileSync(this.jobPath, JSON.stringify(this, null, 2));
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

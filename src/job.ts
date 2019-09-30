import Dropbox from 'dropbox';
import fs from 'fs';
import path from 'path';
import log from './log';

export default class Job {
    rootFolder: string;
    bytesIndexed = 0;
    bytesTotal = 0;
    cursor?: Dropbox.files.ListFolderCursor;
    map: (Dropbox.files.FileMetadataReference | Dropbox.files.FolderMetadataReference | Dropbox.files.DeletedMetadataReference)[] = [];
    startTime: number;
    timestamp: string;
    previousTimestamp?: string;
    mapComplete = false;
    mapLength = 0;
    processIndex = 0;
    constructor(rootFolder: string) {
        this.rootFolder = rootFolder;
        this.startTime = Date.now();
        this.timestamp = new Date(this.startTime).toISOString().split('T')[0];
        const existingJobs = fs.readdirSync(rootFolder).sort();
        existingJobs.forEach(basename => {
            const filePath = path.join(rootFolder, basename);
            if (fs.statSync(filePath).isDirectory()) {
                log.debug('Existing folder: ' + basename);
                try {
                    const timestamp = basename.match(/^\d{4}\-\d{2}\-\d{2}/)![0];
                    if (timestamp != this.timestamp) {
                        this.previousTimestamp = basename;
                        log.verbose('Existing timestamp: ' + this.previousTimestamp);
                    }
                } catch {
                    // Not a timestamped directory
                }
            }
        });
        if (this.previousTimestamp){
            log.info('Previous job: ' + this.previousTimestamp);
        }
        fs.writeFileSync(this.jobPath, JSON.stringify(this, null, 2));
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
    get jobPath() {
        return path.join(this.rootFolder, this.timestamp + '.job');
    }
    get mapPath() {
        return path.join(this.rootFolder, this.timestamp + '.map');
    }
}

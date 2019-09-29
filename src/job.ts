import Dropbox from 'dropbox';
import fs from 'fs';
import path from 'path';
import Debug from 'debug';

const log = Debug('dsnapshot.job');

export default class Job{
    rootFolder: string;
    bytesIndexed = 0;
    bytesTotal = 0;
    cursor ?: Dropbox.files.ListFolderCursor;
    remoteIndex: any[] = [];
    startTime: number;
    timestamp: string;
    constructor(rootFolder: string){
        this.rootFolder = rootFolder;
        this.startTime = Date.now();
        this.timestamp = new Date(this.startTime).toISOString().split('T')[0];
        fs.writeFileSync(this.jobPath, JSON.stringify(this, null, 2));
        log('path: '+this.jobPath);
    }
    get jobPath() {
        return path.join(this.rootFolder, this.timestamp + '.job');
    }
    get indexPath() {
        return path.join(this.rootFolder, this.timestamp + '.index');
    }
}

import Dropbox from 'dropbox';
import fs from 'fs';
import path from 'path';

export default class Job{
    rootFolder: string;
    bytesIndexed = 0;
    bytesTotal = 0;
    cursor ?: Dropbox.files.ListFolderCursor;
    remoteIndex: any[] = [];
    startTime: number;
    timestamp: string;
    log: (string?: string) => void;
    constructor(rootFolder: string, log: (string?: string) => void){
        this.rootFolder = rootFolder;
        this.log = log;
        this.startTime = Date.now();
        this.timestamp = new Date(this.startTime).toISOString().split('T')[0];
        fs.writeFileSync(this.jobPath, JSON.stringify(this, null, 2));
        this.log('Job '.padEnd(20) + this.jobPath);
    }
    get jobPath() {
        return path.join(this.rootFolder, this.timestamp + '.job');
    }
    get indexPath() {
        return path.join(this.rootFolder, this.timestamp + '.index');
    }
}

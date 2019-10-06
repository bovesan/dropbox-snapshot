import fs from 'fs';
import path from 'path';
import log from '../../log';

interface Map {
    start: number,
    end: number,
    filename: string,
}
export default class Job {
	cursor?: string
	startTime?: number
	timestamp?: string
    destination: string
	bytesTotal = 0
	bytesMapped = 0
	mapItems = 0
	mapComplete = false
	mapBuffer: any[] = []
	// mapPath?: string
    maps: Map[] = []
	constructor(destination: string){
        this.destination = destination;
        this.startTime = Date.now();
        this.timestamp = new Date(this.startTime).toISOString().replace('T', ' ').slice(0, 16).replace(':', '-');
	}
    get folder(){
        return path.join(this.destination, this.timestamp);
    }
    get path(){
        return path.join(this.folder, 'snapshot.json');
    }
    write() {
        fs.mkdirSync(this.folder, {recursive: true});
        fs.writeFile(this.path, JSON.stringify(this, null, 2), {encoding: 'utf8'}, (error)=>{
            if (error){
                log.error(error);
            } else {
                log.debug('Wrote '+this.path);
            }
        });
    }
    read() {
        Object.entries(JSON.parse(fs.readFileSync(this.path, {encoding: 'utf8'}))).forEach(([key, value]) => {
            switch (key) {
                case 'mapComplete':
                    break;
                
                default:
                    this[key] = value;
                    break;
            }
        });
    }
    dumpMapBuffer(index: number){
        if (this.mapBuffer.length > 0){
            const start = index - this.mapBuffer.length;
            const filename = path.join('map.' + (String(this.maps.length).padStart(3, '0')) + '.json');
            fs.mkdirSync(this.folder, {recursive: true});
            fs.writeFile(path.join(this.folder, filename), JSON.stringify(this.mapBuffer), ()=>{
                this.maps.push({
                    start,
                    end: index,
                    filename,
                });
                log.debug(`Wrote map buffer to disk: Start: ${start} End: ${index} Filename: ${filename}`);
            });
            this.mapBuffer.length = 0;
        }
    }
    toJSON(){
        const filtered = {};
        Object.entries(this).forEach(([key, value]) => {
            switch (key) {
                case 'mapBuffer':
                    return;
                
                default:
                    filtered[key] = value;
            }
        });
        return filtered;
    }
}
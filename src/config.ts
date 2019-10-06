import os from 'os';
import path from 'path';
import fs from 'fs';
import log from './log';

class Config {
	get folder(){
		return path.join(os.homedir(), '.raindance');
	}
	get sourcesFolder(){
		return path.join(this.folder, 'sources');
	}
	constructor(){
		if (fs.existsSync(this.path)){
			Object.entries(JSON.parse(fs.readFileSync(this.path, {encoding: 'utf8'}))).forEach(([key, value]) => {
				try {
					this[key] = value;
				} catch (error){
					log.verbose(error);
				}
			});
		}
		this.write();
	}
	// _listenPort = 18881;
	get listenPort(){
		return 18881;
		// return this._listenPort;
	}
	// set listenPort(value: any){
	// 	this._listenPort = Number(value);
	// 	this.write();
	// }
	_defaultDestination: string | null = null;
	get defaultDestination(){
		return this._defaultDestination || path.resolve('.')
	}
	set defaultDestination(value: any){
		this._defaultDestination = value;
		this.write();
	}
	get path(){
		return path.join(this.folder, 'config.json');
	}
	get lockFilePath(){
		return path.join(this.folder, 'lockfile');
	}
	write(){
		fs.mkdirSync(this.folder, {recursive: true});
		fs.writeFileSync(this.path, JSON.stringify(this, null, 2), {encoding: 'utf8'});
	}
	toJSON(){
		const output = {};
		Object.keys(this).forEach(key => {
			if (key.startsWith('_')){
				output[key.slice(1)] = this[key];
			} else {
				output[key] = this[key];
			}
		});
		return output;
	}
}
export default new Config();

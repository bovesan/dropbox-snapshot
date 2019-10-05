import log from '../../log';
import config from '../../config';
import path from 'path';
import fs from 'fs';
import uuid from 'uuid/v1';

interface Setting {
	before?: ()=>Promise<any>,
	key: string,
	title: string,
	type: 'text',
	required?: boolean,
	messages?: string[],
	after?: ()=>Promise<any>,
}
export default class Source {
	type = '_source';
	_alias?: string;
	uuid: string;
	get alias(){
		return this._alias || this.type + '_' + this.uuid;
	}
	set alias(value: string){
		if (fs.existsSync(this.configPath)){
			fs.unlinkSync(this.configPath);
		}
		this._alias = value;
		this.write();
	}
	promises: Promise<any>[] = [];
	get settings(): Setting[] {
		return [];
	}
	constructor(alias?: string){
		if (alias){
			this.alias = alias;
			this.read();
		}
		if (!this.uuid){
			this.uuid = uuid();
		}
		if (this.type !== '_source'){
			this.write();
		}
	}
	get configPath(){
		return path.join(config.sourcesFolder, this.alias+'.json');
	}
	write(){
		fs.mkdirSync(path.dirname(this.configPath), {recursive: true});
		fs.writeFileSync(this.configPath, JSON.stringify(this, null, 2), {encoding: 'utf8'});
	}
	read(){
		if (fs.existsSync(this.configPath)){
			Object.entries(JSON.parse(fs.readFileSync(this.configPath, {encoding: 'utf8'}))).forEach(([key, value]) => {
				try {
					this[key] = value;
				} catch (error){
					log.verbose(error);
				}
			});
		} else {
			throw Error('Unknown source: '+this.alias);
		}
	}
}
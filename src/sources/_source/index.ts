import log from '../../log';
import config from '../../config';
import path from 'path';
import fs from 'fs';
import uuid from 'uuid/v1';

interface Setting {
	before?: ()=>Promise<any>,
	key: string,
	title: string,
	type: 'string' | 'path',
	required?: boolean,
	messages?: string[],
	after?: ()=>Promise<any>,
}
export default class Source {
	type = '_source';
	uuid: string;
	_alias?: string;
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
	_destination: string;
	get destination(){
		return this._destination || path.join(config.defaultDestination, this.alias);
	}
	set destination(value: string){
		if (!fs.existsSync(value)){
			fs.mkdirSync(value, {recursive: true});
		}
		this._destination = value;
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
		this.write();
	}
	get configPath(){
		return path.join(config.sourcesFolder, this.alias+'.json');
	}
	write(){
		if (this.type === '_source'){
			log.debug('Refuse to write _source');
			return;
		}
		fs.mkdirSync(path.dirname(this.configPath), {recursive: true});
		fs.writeFileSync(this.configPath, JSON.stringify(this, null, 2), {encoding: 'utf8'});
	}
	read(){
		if (fs.existsSync(this.configPath)){
			Object.entries(JSON.parse(fs.readFileSync(this.configPath, {encoding: 'utf8'}))).forEach(([key, value]) => {
				log.debug(`JSON ${key}: ${value}`);
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
	map(onUpdate: any): Promise<any> {
		return new Promise((resolve, reject) => {
        	reject(`Not yet implemented: ${this.type}.map()`);
		});
	}
	resolve(onUpdate: any): Promise<any> {
		return new Promise((resolve, reject) => {
        	reject(`Not yet implemented: ${this.type}.resolve()`);
		});
	}
	pull(onUpdate: any): Promise<any> {
		return new Promise(async (resolve, reject) => {
			try {
				await this.map(onUpdate).catch(reason => reject(reason));
				await this.resolve(onUpdate).catch(reason => reject(reason));
			} catch (reason) {
				reject(reason);
			}
		});
		// return new Promise((resolve, reject) => {
		// 	return this.map();
		// }).then(() => {
		// 	return this.resolve();
		// });
	}
}
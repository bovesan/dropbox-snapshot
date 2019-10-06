import _Source from './_source';
import _Dropbox from './dropbox';
import path from 'path';
import fs from 'fs';
import config from '../config';
import log from '../log';

declare namespace Sources {
	export type Source = _Source;
	export type Dropbox = _Dropbox;
}
const Sources = {
	new(type: string): Sources.Source {
		switch (type) {
			case 'dropbox':
				return new _Dropbox();
				break;
			
			default:
				// code...
				break;
		}
	},
	load(id: string | number): Sources.Source {
		let basename: string;
		if (typeof id === 'number'){
			basename = fs.readdirSync(config.sourcesFolder)[id-1];
		} else if (fs.existsSync(id)){
			basename = path.basename(id);
		} else {
			basename = id+'.json';
		}
		const entry = JSON.parse(fs.readFileSync(path.join(config.sourcesFolder, basename), {encoding: 'utf8'}));
		log.debug(entry._alias);
		switch (entry.type) {
			case 'dropbox':
				return new _Dropbox(entry._alias);
				break;
			
			default:
				// code...
				break;
		}
	},
	entries(){
		const basenames = fs.readdirSync(config.sourcesFolder);
		let index = 0;
		return basenames.map(basename => {
			index++;
			const json = JSON.parse(fs.readFileSync(path.join(config.sourcesFolder, basename), {encoding: 'utf8'}));
			return {
				index,
				alias: json._alias,
				type: json.type,
			}
		});
	},
}
export = Sources;
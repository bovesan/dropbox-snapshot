import Source from '../_source';
import Dropbox from 'dropbox';
import fetch from 'isomorphic-fetch';
import log from '../../log';
import readline from 'readline';
import { listenForToken } from '../../auth'
import config from '../../config'
import prettyBytes from 'pretty-bytes';
import fs from 'fs';
import path from 'path';
import { writeArray } from '../../arrayio';
import Stats from '../../Stats';

const CLIENT_ID = 'irvv6l188sxowqo';

const BUFFER_SIZE = 10 * 1024 * 1024;

export default class DropboxSource extends Source {
    dropbox: DropboxTypes.Dropbox;
	type = 'dropbox';
	user?: Dropbox.users.FullAccount;
	get settings() {
		return [
			{
				before: listenForToken,
				messages: [
					'Please visit this address to authenticate: ',
					this.dropbox.getAuthenticationUrl(`http://localhost:${config.listenPort}/`),
				],
				key: 'token',
				title: 'Access token',
				type: 'string' as 'string',
				required: true,
			},
			{
				key: 'remoteFolder',
				title: 'Remote folder',
				type: 'string' as 'string',
			},
			{
				key: 'alias',
				title: 'Alias',
				type: 'string' as 'string',
			},
			{
				key: 'destination',
				title: 'Destination',
				type: 'path' as 'path',
			},
		]
	}
	_token: string | null;
	get token(){
		return this._token;
	}
	set token(value: string){
        if (value.includes('=')) {
            const match = value.match(/access_token=([^&]*)/);
            if (!match) {
            	throw Error('Invalid token');
            }
            this._token = match[1];
        } else {
			this._token = value;
        }
		this.dropbox.setAccessToken(this._token);
		this.promises.push(this.dropbox.usersGetCurrentAccount().then(user => {
			this.user = user;
			log.info('Authenticated as '+user.name.display_name);
			if (!this._alias){
				this.alias = `Dropbox - ${user.name.display_name}`;
			}
		}));
		this.write();
	}
	_remoteFolder = '';
	get remoteFolder(){
		return this._remoteFolder;
	}
	set remoteFolder(value: string){
		this._remoteFolder = value;
		this.write();
	}
	constructor(alias?: string){
		super(alias);
        this.dropbox = new Dropbox.Dropbox({ clientId: CLIENT_ID, fetch });
        log.debug({token: this.token});
        if (this.token){
			this.dropbox.setAccessToken(this.token);
        }
		// throw Error('Not yet implemented');
	}
	toJSON(){
		const filtered = {};
		Object.entries(this).forEach(([key, value]) => {
			switch (key) {
				case 'dropbox':
				case 'user':
					return;
				
				default:
					filtered[key] = value;
			}
		});
		return filtered;
	}
	map(onUpdate: any){
		return new Promise(async (resolve, reject) => {
			const job: {
				cursor?: string,
				startTime?: number,
				timestamp?: string,
				path?: string,
				bytesTotal: number,
				bytesMapped: number,
				mapLength: number,
				mapComplete: boolean,
    			map: (Dropbox.files.FileMetadataReference | Dropbox.files.FolderMetadataReference | Dropbox.files.DeletedMetadataReference)[];
    			mapPath?: string,
			} = {
				bytesTotal: 0,
				bytesMapped: 0,
				mapLength: 0,
				mapComplete: false,
				map: [],
			};
			const status: any = {};
            const stats = new Stats();
            stats.onUpdate = (value) => {
                status.progress = value / job.bytesTotal;
                // log.debug(JSON.stringify({value, jobBytesTotal: job.bytesTotal, progress}));
                status.status = (status.progress * 100).toPrecision(3) + '%';
                status.status += ' @ ' + prettyBytes(Math.floor(stats.lastMinute / 60)) + 'ps ETL: ' + stats.etl(status.progress);
                onUpdate({'Mapping': status});
            }
	        job.startTime = Date.now();
	        job.timestamp = new Date(job.startTime).toISOString().replace('T', ' ').slice(0, 16);
	        try {
	        	job.bytesTotal = await this.dropbox.usersGetSpaceUsage().then(data => data.used);
	        } catch ({error}) {
	        	log.error(error);
	        	return reject(error);
	        }
        	job.path = path.join(this.destination, job.timestamp + '.job');
        	job.mapPath = path.join(this.destination, job.timestamp + '.map');
        	let entrySize = 0;
            let listFolderResult: Dropbox.files.ListFolderResult | undefined;
            log.info(`Mapping remote (${prettyBytes(job.bytesTotal)})`)
        	fs.writeFileSync(job.mapPath, '[\n');
            while (!listFolderResult || listFolderResult.has_more) {
                try {
                    if (job.cursor) {
                        listFolderResult = await this.dropbox.filesListFolderContinue({
                            cursor: job.cursor,
                        });
                    } else {
                        listFolderResult = await this.dropbox.filesListFolder({
                            path: this.remoteFolder || '',
                            recursive: true,
                        });
                    }
                    job.cursor = listFolderResult!.cursor;
                    listFolderResult.entries.forEach((entry: any) => {
                        if (entry.size) {
                            job.bytesMapped += (entry as Dropbox.files.FileMetadataReference).size;
                        }
                    });
                    job.map.push(...listFolderResult.entries);
                    if (!entrySize){
                    	entrySize = (JSON.stringify(job.map.find(entry => entry['.tag'] == 'file')) || {}).length;
                    }
                    if (job.map.length * entrySize > BUFFER_SIZE){
                    	log.debug('Buffer > '+prettyBytes(BUFFER_SIZE)+' saving to disk: '+job.mapPath);
                    	fs.appendFileSync(job.mapPath, job.map.map(item => JSON.stringify(item)).join(',')+'\n');
                    	job.map.length = 1;
                    }
                    stats.log(job.bytesMapped);
                	// onUpdate('Mapping remote', 'progress', job.bytesMapped / job.bytesTotal);
                } catch (error) {
                    reject(error);
                }
                job.mapLength = job.map.length;
            }
        	fs.writeFileSync(job.mapPath, ']');
            // process.stdout.write('\rMapping remote'.padEnd(21) + '100%'.padEnd(50));
            // log('');
            job.mapComplete = true;
            fs.writeFileSync(job.path, JSON.stringify(job, null, 2));
            log.info(`Writing map to disk ...`)
            // await job.writeMap().catch(error => reject(error));

            writeArray(job.mapPath, job.map);

            log.info('Wrote map: ' + job.mapPath);
            resolve();
		});
	}
}
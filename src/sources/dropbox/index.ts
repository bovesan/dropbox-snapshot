import Source from '../_source';
import Job from '../_source/Job';
import Dropbox from 'dropbox';
import fetch from 'isomorphic-fetch';
import log from '../../log';
import readline from 'readline';
import { listenForToken } from '../../auth'
import config from '../../config'
import prettyBytes from 'pretty-bytes';
import fs from 'fs';
import path from 'path';
// import { writeArray } from '../../arrayio';
import Stats from '../../Stats';

const CLIENT_ID = 'irvv6l188sxowqo';
const BUFFER_SIZE = 10 * 1024 * 1024;

class DropboxJob extends Job {
	mapBuffer: (Dropbox.files.FileMetadataReference | Dropbox.files.FolderMetadataReference | Dropbox.files.DeletedMetadataReference)[] = [];
}

export default class DropboxSource extends Source {
    dropbox: DropboxTypes.Dropbox;
	type = 'dropbox';
	user?: Dropbox.users.FullAccount;
	job: DropboxJob;
	_job: DropboxJob;
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
	map(onUpdate: (stats: Stats[]) =>void){
		const job = this.job = new DropboxJob(this.destination);
		return new Promise(async (resolve, reject) => {
	        try {
	        	job.bytesTotal = await this.dropbox.usersGetSpaceUsage().then(data => data.used);
	        } catch ({error}) {
	        	log.error(error);
	        	return reject(error);
	        }
        	job.write();
			const status: any = {};
            const stats = new Stats('Mapping remote', true);
            stats.onUpdate = (value) => {
                onUpdate([stats]);
            }
            stats.target = job.bytesTotal;
            onUpdate([stats]);
        	let entrySize = 0;
            let listFolderResult: Dropbox.files.ListFolderResult | undefined;
            log.info(`Mapping remote (${prettyBytes(job.bytesTotal)})`)
        	// fs.writeFileSync(job.mapPath, '[\n');
        	let index = 0;
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
                    log.debug(`Received ${listFolderResult.entries.length} entries`)
                    job.mapBuffer.push(...listFolderResult.entries);
                    index += listFolderResult.entries.length;
                    if (!entrySize){
                    	// Use this as an estimate to avoid unnecessary JSON conversion
                    	entrySize = JSON.stringify(job.mapBuffer).length / job.mapBuffer.length;
                    	log.debug(`Average entry size: ${prettyBytes(entrySize)}`)
                    }
                    if (job.mapBuffer.length * entrySize > BUFFER_SIZE){
                    	job.dumpMapBuffer(index);
                    	job.write();
                    }
                    stats.log(job.bytesMapped);
                	// onUpdate('Mapping remote', 'progress', job.bytesMapped / job.bytesTotal);
                } catch (error) {
                    reject(error);
                }
                job.mapItems = index;
            }
            // process.stdout.write('\rMapping remote'.padEnd(21) + '100%'.padEnd(50));
            // log('');
        	job.dumpMapBuffer(index);
            job.mapComplete = true;
            job.write();
            // await job.writeMap().catch(error => reject(error));
            // writeArray(job.mapPath, job.map);
            resolve();
		});
	}
	resolve(onUpdate: (stats: Stats[]) =>void){
		const job = this.job;
		return new Promise(async (resolve, reject) => {
			resolve();
		});
	}
}
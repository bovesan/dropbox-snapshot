import Source from '../_source';
import Dropbox from 'dropbox';
import fetch from 'isomorphic-fetch';
import log from '../../log';
import readline from 'readline';
import { listenForToken } from '../../auth'
import config from '../../config'

const CLIENT_ID = 'irvv6l188sxowqo';

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
				type: 'text' as 'text',
				required: true,
			},
			{
				key: 'remoteFolder',
				title: 'Remote folder',
				type: 'text' as 'text',
			},
			{
				key: 'alias',
				title: 'Alias',
				type: 'text' as 'text',
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
		super();
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
}
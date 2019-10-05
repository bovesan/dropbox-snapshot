import Source from '../_source';
import Dropbox from 'dropbox';
import fetch from 'isomorphic-fetch';
import log from '../../log';
import http from 'http';
import authenticationPage from './authenticationPage';
import readline from 'readline';

const CLIENT_ID = 'irvv6l188sxowqo';
const REDIRECT_PORT = 18881;

function listenForToken(){
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
		    const match = req.url!.match(/access_token=([^&]*)/);
		    if (!match) {
		        res.write(authenticationPage);
		        res.end();
		    } else {
		    	const token = match[1];
		        res.end();
		        server.close();
		        for (var i = 0; i < token.length; ++i) {
		        	process.stdin.emit('keypress', token[i], {
		        		name: token[i],
		        	});
		        }
	        	process.stdin.emit('keypress', token[i], {
	        		name: 'return',
	        	});
		        res.write('You can now close this window.');
		        resolve();
		    }
		}).listen(REDIRECT_PORT);
	});
}

export default class DropboxSource extends Source {
    dropbox: DropboxTypes.Dropbox;
	tag = 'dropbox';
	user?: Dropbox.users.FullAccount;
	get settings() {
		return [
			{
				before: listenForToken,
				messages: [
					'Please visit this address to authenticate: ',
					this.dropbox.getAuthenticationUrl(`http://localhost:${REDIRECT_PORT}/`),
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
			this.alias = `Dropbox - ${user.name.display_name}`;
			if (!this.alias){
				this.alias = `Dropbox - ${user.name.display_name}`;
			}
		}));
	}
	_remoteFolder = '';
	get remoteFolder(){
		return this._remoteFolder;
	}
	set remoteFolder(value: string){
		this._remoteFolder = value;
	}
	alias?: string;
	// _alias = '';
	// get alias(){
	// 	return (this._alias);
	// }
	// set alias(value: string){
	// 	this._alias = value;
	// }
	constructor(){
		super();
        this.dropbox = new Dropbox.Dropbox({ clientId: CLIENT_ID, fetch });
		// throw Error('Not yet implemented');
	}
}
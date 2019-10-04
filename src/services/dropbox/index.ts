import Service from '../_service';
import Dropbox from 'dropbox';
import log from '../../log';

const CLIENT_ID = 'irvv6l188sxowqo';
const REDIRECT_PORT = 18881;

export default class DropboxService extends Service {
    dropbox: DropboxTypes.Dropbox;
	tag = 'dropbox';
	user?: Dropbox.users.FullAccount;
	get settings() {
		return [
			{
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
import _Service from './_service';
import _Dropbox from './dropbox';

declare namespace Services {
	export type Service = _Service;
	export type Dropbox = _Dropbox;
}
function Services(tag: string): Services.Service {
	switch (tag) {
		case 'dropbox':
			return new _Dropbox();
			break;
		
		default:
			// code...
			break;
	}
}
export = Services;
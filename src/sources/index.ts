import _Source from './_source';
import _Dropbox from './dropbox';

declare namespace Sources {
	export type Source = _Source;
	export type Dropbox = _Dropbox;
}
function Sources(tag: string): Sources.Source {
	switch (tag) {
		case 'dropbox':
			return new _Dropbox();
			break;
		
		default:
			// code...
			break;
	}
}
export = Sources;
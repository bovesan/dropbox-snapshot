import log from '../../log';

interface Setting {
	key: string,
	title: string,
	type: 'text',
	required?: boolean,
	messages?: string[],
}
export default class Service {
	tag = '_service';
	promises: Promise<any>[] = [];
	get settings(): Setting[] {
		return [];
	}
	constructor(){
		//
	}
	toJSON(){
		return this.tag;
	}
    set(){

    }
}
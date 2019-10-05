import log from '../../log';

interface Setting {
	before?: ()=>void,
	key: string,
	title: string,
	type: 'text',
	required?: boolean,
	messages?: string[],
	after?: ()=>void,
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
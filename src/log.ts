import Debug from 'debug';

export const namespaces = {
	info:    'dsnapshot:info',
	verbose: 'dsnapshot:verbose',
    debug:   'dsnapshot:debug',
}

console.log(process.env.DEBUG);
Debug.enable(namespaces.info);
console.log(process.env.DEBUG);

export default {
	info: Debug(namespaces.info),
	verbose: Debug(namespaces.verbose),
	debug: Debug(namespaces.debug),
	enable(namespace: 'info' | 'verbose' | 'debug'){
		Debug.enable(process.env.DEBUG + ',' + namespaces[namespace]);
		return this;
	}
}
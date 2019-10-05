import http from 'http';
import authenticationPage from './authenticationPage';
import config from './config'

export function listenForToken(){
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
		    const match = req.url!.match(/access_token=([^&]*)/);
		    if (!match) {
		        res.write(authenticationPage);
		        res.end();
		    } else {
		    	const token = match[1];
		        res.write('You can now close this window.');
		        res.end();
		        server.close();
		        resolve(match[1]);
		    }
		}).listen(config.listenPort);
	});
}
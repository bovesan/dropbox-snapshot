import Dropbox from 'dropbox';
// import os from 'os';
// import fs from 'fs';
import http from 'http';
import path from 'path';
import config from '../../config';
import authenticationPage from './authenticationPage';
import prompt from '../../prompt';
import log from '../../log';

export function getToken(dropbox: Dropbox.Dropbox): Promise<string> {
    return new Promise((resolve, reject) => {
        let token: string;
        const authenticationUrl = dropbox.getAuthenticationUrl('http://localhost:' + config.authPort + '/');
        log.info('Please visit this address to authenticate:');
        log.info(authenticationUrl);
        log.info('If you authenticate on another device, you will be unable to connect to this program. No worries! Just paste the failed address below.');
        const gotToken = new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                if (token) {
                    resolve(token);
                    clearInterval(interval);
                }
            }, 1000);
        });
        new Promise((resolveToken, rejectToken) => {
            const server = http.createServer((req, res) => {
                const match = req.url!.match(/access_token=([^&]*)/);
                if (!match) {
                    res.write(authenticationPage);
                    res.end();
                } else {
                    res.write('You can now close this window and return to dsnapshot.');
                    res.end();
                    server.close();
                    resolveToken(match[1]);
                }
            }).listen(config.authPort);
            prompt('Access token or url:', gotToken, 5 * 60 * 1000).then(value => {
                if (!value) {
                    server.close();
                    rejectToken('No access token provided');
                }
                if (value.includes('=')) {
                    const match = value.match(/access_token=([^&]*)/);
                    if (!match) {
                        server.close();
                        rejectToken('Invalid url');
                    } else {
                        server.close();
                        resolveToken(match[1]);
                    }
                }
            }).catch(error => {
                server.close();
                rejectToken(error);
            });
        }).then(resolvedToken => {
            token = resolvedToken as string;
            if (token) {
                resolve(token);
            }
            reject('Token undefined');
        }).catch(error => reject(error));

    });
}
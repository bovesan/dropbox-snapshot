import Dropbox from 'dropbox';
import os from 'os';
import fs from 'fs';
import http from 'http';
import path from 'path';
import config from './config';
import authenticationPage from './authenticationPage';

function prompt(message: string, abort: Promise<any>, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
        process.stdout.write(message+' ');
        process.stdin.on('data', (chunk: Buffer) => {
            resolve(chunk.toString());
        });
        if (timeout){
            setTimeout(()=>{
                process.stdin.destroy();
                reject(`No input received. Waited ${timeout*0.001} seconds.`);
            }, timeout);
        }
        Promise.all([abort]).finally(() => {
            process.stdin.destroy();
            resolve();
        });
    })
}

export function authorize(dropbox: Dropbox.Dropbox): Promise < string > {
    return new Promise((resolve, reject) => {
        let token: string;
        if (fs.existsSync(config.token_path)) {
            token = fs.readFileSync(config.token_path).toString().trim();
            dropbox.setAccessToken(token);
            return resolve(token);
        }
        const authenticationUrl = dropbox.getAuthenticationUrl('http://localhost:' + config.authPort + '/');
        console.log('Please visit this address to authenticate:');
        console.log(authenticationUrl);
        console.log('If you authenticate on another device, you will be unable to connect to this program. No worries! Just paste the failed address below.');
        const gotToken = new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                if (token) {
                    console.log('Token resolved');
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
            // setTimeout(() => {
            //     server.close();
            //     prompt.
            //     throw Error('Authentication timeout');
            // }, 5 * 60 * 1000);
        }).then(resolvedToken => {
            token = resolvedToken as string;
            if (token) {
                fs.mkdirSync(path.dirname(config.token_path), {
                    recursive: true,
                    mode: 0o700,
                });
                fs.writeFileSync(config.token_path, token);
                dropbox.setAccessToken(token);
                resolve();
            }
            reject('Token undefined');
        }).catch(error => reject(error));

    });
}
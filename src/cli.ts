import commander from 'commander';
import config from './config';
import DSnapshot from './index';
import { Status } from './index';
import prettyBytes from 'pretty-bytes';
import log from './log';
import { etl } from './stats';
import Sources from './sources';
import prompts from 'prompts';

function runPromiseAndExit(promise: Promise<any>) {
    let keepAlive = setInterval(() => {
        // process.stdout.write('.');
    }, 1000);
    promise.then(() => {
        // process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exit(1);
    }).finally(() => {
        clearInterval(keepAlive);
    });
}
async function asyncForEach(array: [], callback: (T) => void) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index]);
  }
}
function monitor(status: Status){
    const line = '  ' + Object.entries(status).map(([key, value]) => {
        if (value.status) {
            return key + ': '+(value.status).padEnd(50);
        }
        if (value.progress) {
            const etlString = value.progress < 1 ? ' ETL: ' + etl(value.starttime, value.updatetime, value.progress) : ''
            return key + ': ' + ((value.progress * 100).toPrecision(3) + '%').padEnd(10) + etlString.padEnd(25);
        }
    }).join('') + (`Memory usage: ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(20)) + '\r';
    process.env.linebuffer = line;
    process.stdout.write(line)
}

const program = new commander.Command();
program
    .version('1.0.0')
    .description("Downloads and creates local snapshots of cloud services.")
    // .option('-c, --configFolder <path>', 'config folder', config.folder)
    .option('-v, --verbose', 'verbose output', ()=>log.enable('verbose'))
    .option('-d, --debug', 'extra verbose output', () => log.enable('verbose').enable('debug'))


program
    .command('config [key] [value]')
    .description('Global configuration.')
    .action(async function(key, value) {
        if (key){
            if (value !== undefined){
                config[key] = value;
                console.log(key+': '+config[key]);
            } else {
                console.log(key+': '+config[key]);
            }
        } else {
            Object.entries(config).forEach(([k, v]) => {
                console.log((k.replace(/^_/g, '')+': ').padEnd(16)+v);
            });
        }
    });

program
    .command('add')
    .description('Add a source.')
    .action(async (command: commander.Command) => {
        const source = await prompts([
            {
              type: 'select',
              name: 'service',
              message: 'Service type:',
              choices: [
                { title: 'Dropbox', value: 'dropbox' },
                { title: 'FTP', value: 'ftp', disabled: true },
                { title: 'Google Drive', value: 'googledrive', disabled: true },
                { title: 'HTTP', value: 'http', disabled: true },
                { title: 'IMAP', value: 'imap', disabled: true },
                { title: 'SSH', value: 'ssh', disabled: true },
              ],
              initial: 0,
            },
        ]).then(({service}) => {
            return Sources(service);
        });
        for (var i = 0; i < source.settings.length; ++i) {
            const setting = source.settings[i];
            if (setting.messages){
                console.log(setting.messages.join('\n'));
            }
            const question: prompts.PromptObject = {
                type: setting.type,
                name: setting.key,
                message: setting.title,
                initial: source[setting.key],
            };
            if (setting.required){
                question.validate = value => value ? true : 'This setting is required'
            }
            switch (setting.type) {
                case 'text':
                    break;
                default:
                    // code...
                    break;
            }
            try {
                if (setting.before){
                    setting.before().then((response) => {
                        for (var i = 0; i < response.length; ++i) {
                            process.stdin.emit('keypress', response[i], {
                                name: response[i],
                            });
                        }
                        process.stdin.emit('keypress', response[i], {
                            name: 'return',
                        });
                    });
                }
                await prompts(question, {onCancel: ()=>{process.exit()}}).then(values => {
                    source[setting.key] = values[setting.key];
                    return Promise.all(source.promises);
                });
            } catch ({error}) {
                console.log(error);
                i--;
            }
        }
        source.write();
    });

program
    .command('list')
    .description('List all configured sources.')
    .action(async function(key, newValue) {
        throw Error('Not yet implemented');
    });

program
    .command('map [source]')
    .description('Create an updated index.')
    .action(async function(key, newValue) {
        throw Error('Not yet implemented');
    });

program
    .command('resolve [source]')
    .description('Update files according to the latest map and download resources as necessary.')
    .action(async function(key, newValue) {
        throw Error('Not yet implemented');
    });

program
    .command('pull [source]')
    .description('Map and resolve.')
    .action(async function(key, newValue) {
        throw Error('Not yet implemented');
    });

program.parse(process.argv);
if (process.argv.length < 3) {
    program.outputHelp();
}
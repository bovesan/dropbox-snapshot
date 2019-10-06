import commander from 'commander';
import config from './config';
import DSnapshot from './index';
import Status from './Status';
import Stats from './Stats';
import prettyBytes from 'pretty-bytes';
import log from './log';
import { etl } from './stats';
import Sources from './sources';
import prompts from 'prompts';
import colors from 'colors';
import path from 'path';
import fs from 'fs';

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
function sourceIds(sourceId: string | number){
    let sourceIds: (string | number)[] = [];
    if (sourceId){
        try {
            sourceId = Number(sourceId);
        } catch {
            //
        }
        sourceIds.push(sourceId);
    } else {
        log.debug('sourceId not specified. Getting all entries.')
        sourceIds = Sources.entries().map(entry => entry.alias);
        log.debug('sourceIds: '+sourceIds.length);
    }
    return sourceIds;
}
function monitor(stats: Stats[]){
    if (!Array.isArray(stats)){
        stats = [stats];
    }
    let line = "\033[2K  ";
    const fields: string[] = [];
    stats.forEach(stat => {
        let field = '';
        field += stat.title + ':';
        if (stat.target){
            field += ' '+(stat.progress * 100).toPrecision(3) + '%';
        } else {
            if (stat.isBytes){
                field += ' '+stat.valueInHuman;
            } else {
                field += ' '+stat.value;
            }
        }
        if (stat.value){
            if (stat.isBytes){
                field += ' @ '+stat.speed();
            }
            if (stat.target && stat.target > stat.value){
                field += ' ETL: '+stat.etl();
            }
        }
        fields.push(field);
    });
    fields.push((`Memory usage: ${prettyBytes(process.memoryUsage().heapUsed)}`.padEnd(20)))
    line += fields.join('    ') + '\r';
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
    .description('global configuration')
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
    .description('add a source')
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
            return Sources.new(service);
        });
        for (var i = 0; i < source.settings.length; ++i) {
            const setting = source.settings[i];
            if (setting.messages){
                console.log(setting.messages.join('\n'));
            }
            let type: prompts.PromptType;
            switch (setting.type) {
                case 'string':
                    type = 'text';
                    break;
                case 'path':
                    type = 'text';
                    break;
            }
            const question: prompts.PromptObject = {
                type,
                name: setting.key,
                message: setting.title,
                initial: source[setting.key],
            };
            if (setting.required){
                question.validate = value => value ? true : 'This setting is required'
            }
            // switch (setting.type) {
            //     case 'path':
            //         // question.choices = [];
            //         question.suggest = (input) => {
            //             let absPath = path.resolve(input);
            //             let choices;
            //             if (absPath.endsWith('/')){
            //                 choices = fs.readdirSync(absPath);
            //             } else {
            //                 choices = fs.readdirSync(path.dirname(absPath));
            //             }
            //             return choices.filter(basename => basename.startsWith(path.basename(absPath)));
            //             Promise.resolve(choices.filter(basename => basename.startsWith(path.basename(absPath))))
            //             // Promise.resolve(choices.filter(item => item.slice(0, input.length) === input))
            //         }
            //         break;
            // }
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
    .description('list all configured sources')
    .action(async function(key, newValue) {
        Sources.entries().forEach(entry => {
            console.log(`[${entry.index}]`.padStart(5)+` ${entry.alias} (${entry.type})`);
        });
    });

program
    .command('map [source]')
    .description('create an updated index')
    .action(async function(sourceId?: string | number) {
        sourceIds(sourceId).forEach(sourceId => {
            log.debug('sourceId: '+sourceId);
            return Sources.load(sourceId).map(monitor).catch(error => {
                console.log(colors.red(error));
            });
        });
    });

program
    .command('resolve [source]')
    .description('update files according to the latest map and download resources as necessary')
    .action(async function(sourceId?: string | number) {
        sourceIds(sourceId).forEach(sourceId => {
            return Sources.load(sourceId).resolve(monitor).catch(error => {
                console.log(colors.red(error));
            });
        });
    });

program
    .command('pull [source]')
    .description('map and resolve')
    .action(async function(sourceId?: string | number) {
        sourceIds(sourceId).forEach(sourceId => {
            return Sources.load(sourceId).pull(monitor).catch(error => {
                console.log(colors.red(error));
            });
        });
    });

program
    .command('*', {noHelp: true})
    .action(async function(commandName) {
        console.log(colors.red('Unknown command: '+commandName));
        program.outputHelp();
    });

program.parse(process.argv);
if (process.argv.length < 3){
    program.outputHelp();
}